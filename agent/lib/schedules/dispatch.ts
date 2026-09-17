import type { ScheduleToFn } from "eve/schedules";
import {
  dispatchRootSession,
  founderAgentId,
} from "@agent/lib/eve/dispatch-root-session";
import { dispatchScheduledReport } from "@agent/lib/schedules/report";
import { postScheduledReport } from "@agent/lib/schedules/request";
import {
  claimReadyScheduledAgentRuns,
  listRecoverableScheduledReports,
  materializeDueScheduledAgentRuns,
  releaseScheduledAgentRun,
  setScheduledRunSession,
} from "@db/services/scheduled-agent-jobs";

const workerStartupLimitMs = 5 * 60_000;

export async function dispatchDueWork(to: ScheduleToFn) {
  const now = new Date();
  const materializedRunIds = await materializeDueScheduledAgentRuns({
    limit: 25,
    now,
  });
  const runs = await claimReadyScheduledAgentRuns({
    leaseForMs: workerStartupLimitMs,
    limit: 25,
    now,
  });
  const reports = await listRecoverableScheduledReports(now, 25);
  if (materializedRunIds.length > 0 || runs.length > 0 || reports.length > 0) {
    console.info("[scheduled-run] schedule tick found work", {
      claimedRunCount: runs.length,
      materializedRunCount: materializedRunIds.length,
      recoverableReportCount: reports.length,
    });
  }
  await Promise.all([
    ...runs.map((claim) => executeScheduledRun(to, claim)),
    ...reports.map((report) => dispatchRecoverableReport(to, report)),
  ]);
}

async function executeScheduledRun(
  to: ScheduleToFn,
  claim: Awaited<ReturnType<typeof claimReadyScheduledAgentRuns>>[number]
) {
  const leaseToken = claim.run.leaseToken;
  if (!leaseToken) throw new Error("A scheduled run claim requires a lease.");
  console.info("[scheduled-run] dispatching worker", {
    attempt: claim.run.attempts,
    jobId: claim.job.id,
    runId: claim.run.id,
    scheduledFor: claim.run.scheduledFor.toISOString(),
  });
  try {
    const session = claim.run.workerSessionId
      ? { sessionId: claim.run.workerSessionId }
      : await dispatchRootSession({
          idempotencyKey: `scheduled-run:${claim.run.id}`,
          principal: scheduledWorkerAuth(claim),
          provenance: {
            scheduleId: claim.job.id,
            scheduledFor: claim.run.scheduledFor.toISOString(),
            scheduledRunId: claim.run.id,
            sourceType: "schedule-occurrence",
          },
          returnRoute: {
            channel: claim.job.conversationChannel,
            conversationId: claim.job.conversationId,
            scheduleId: claim.job.id,
          },
          targetAgentId: founderAgentId,
          targetWorkspaceId: claim.job.workspaceId,
          task: scheduledRunPrompt(claim),
        });
    const persisted = await setScheduledRunSession(
      claim.run.id,
      leaseToken,
      session.sessionId
    );
    if (!persisted) {
      throw new Error("The scheduled run lease expired during dispatch.");
    }
    console.info("[scheduled-run] worker session accepted", {
      jobId: claim.job.id,
      runId: claim.run.id,
      sessionId: session.sessionId,
    });
  } catch (error) {
    console.warn("[scheduled-run] worker dispatch failed", {
      cause: error,
      jobId: claim.job.id,
      runId: claim.run.id,
    });
    const status = await releaseScheduledAgentRun(
      claim.run.id,
      leaseToken,
      error instanceof Error ? error.message : String(error)
    );
    if (status === "dead_letter") {
      await dispatchRecoverableReport(to, {
        conversationChannel: claim.job.conversationChannel,
        runId: claim.run.id,
      });
    }
  }
}

function dispatchRecoverableReport(
  to: ScheduleToFn,
  report: Awaited<ReturnType<typeof listRecoverableScheduledReports>>[number]
) {
  return report.conversationChannel === "linq"
    ? dispatchScheduledReport({ to }, report.runId)
    : postScheduledReport(report.runId);
}

function scheduledRunPrompt(
  claim: Awaited<ReturnType<typeof claimReadyScheduledAgentRuns>>[number]
) {
  return [
    "Complete this user-owned scheduled task in an isolated background session.",
    `Scheduled for: ${claim.run.scheduledFor.toISOString()}`,
    `Task: ${claim.job.prompt}`,
  ].join("\n\n");
}

function scheduledWorkerAuth(
  claim: Awaited<ReturnType<typeof claimReadyScheduledAgentRuns>>[number]
) {
  const leaseToken = claim.run.leaseToken;
  if (!leaseToken) throw new Error("A scheduled run claim requires a lease.");
  return {
    attributes: {
      conversationChannel: claim.job.conversationChannel,
      conversationId: claim.job.conversationId,
      scheduleId: claim.job.id,
      scheduledRunLeaseToken: leaseToken,
      scheduledRunId: claim.run.id,
      workspaceId: claim.job.workspaceId,
    },
    authenticator: "scheduled-worker",
    issuer: "open-instinct",
    principalId: claim.job.createdByUserId,
    principalType: "user" as const,
  };
}

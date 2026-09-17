import { randomUUID } from "node:crypto";
import { query, transaction } from "@/lib/db";
import { appendStep } from "./trajectory";
import type { MonolithFunction, Thinker } from "./types";

export async function claimRun(input: {
  identityId: string;
  thinker: Thinker;
  triggerStepId: string;
}) {
  const result = await query(
    `INSERT INTO thinker_runs (id, identity_id, thinker, trigger_step_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (identity_id, thinker, trigger_step_id) DO NOTHING
     RETURNING *`,
    [randomUUID(), input.identityId, input.thinker, input.triggerStepId]
  );
  return result.rows[0] ?? null;
}

export async function markRunRunning(runId: string, sessionId: string) {
  await query(
    `UPDATE thinker_runs SET status = 'running', eve_session_id = $2
     WHERE id = $1`,
    [runId, sessionId]
  );
}

export async function completeRun(runId: string) {
  await query(
    `UPDATE thinker_runs SET status = 'completed', completed_at = now()
     WHERE id = $1`,
    [runId]
  );
}

export async function failRun(runId: string, error: string) {
  await query(
    `UPDATE thinker_runs
     SET status = 'failed', error = $2, completed_at = now()
     WHERE id = $1 AND status <> 'completed'`,
    [runId, error.slice(0, 4000)]
  );
}

const idleDelays = [5, 10, 20, 40, 80, 160, 300] as const;
const thoughtDelays = [5, 10, 20, 40, 60] as const;

export function nextPacing(input: {
  readonly currentLevel: number;
  readonly currentTicks: number;
  readonly fn: MonolithFunction;
}) {
  const visible = input.fn === "act" || input.fn === "share";
  const ladder = input.fn === "idle" ? idleDelays : thoughtDelays;
  const boundedLevel = Math.min(
    Math.max(input.currentLevel, 0),
    ladder.length - 1
  );
  const delaySeconds = ladder[visible ? 0 : boundedLevel];
  let nextLevel = visible ? 0 : boundedLevel;
  let nextTicks = visible ? 0 : input.currentTicks + 1;
  if (!visible && nextTicks >= 3) {
    nextLevel = Math.min(nextLevel + 1, ladder.length - 1);
    nextTicks = 0;
  }
  return { delaySeconds, nextLevel, nextTicks };
}

export async function finishMonolithRun(input: {
  identityId: string;
  runId: string;
  triggerStepId: string;
  fn: MonolithFunction;
  content: string;
  resolves?: string;
}) {
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      input.runId
    ]);
    const runResult = await client.query(
      "SELECT * FROM thinker_runs WHERE id = $1 FOR UPDATE",
      [input.runId]
    );
    const run = runResult.rows[0];
    if (!run) throw new Error("Headlong run not found.");
    if (run.status === "completed") {
      const existing = await client.query(
        `SELECT * FROM trajectory_steps
         WHERE fields->>'runId' = $1 ORDER BY created_at DESC LIMIT 1`,
        [input.runId]
      );
      return {
        delaySeconds: Number(
          (existing.rows[0]?.fields as Record<string, unknown> | undefined)
            ?.delaySeconds ?? 5
        ),
        stepId: String(existing.rows[0]?.id)
      };
    }

    const identityResult = await client.query(
      `SELECT status, backoff_level, ticks_at_level, spontaneous_wakes
       FROM identities WHERE id = $1 FOR UPDATE`,
      [input.identityId]
    );
    const identity = identityResult.rows[0];
    if (!identity) throw new Error("Identity not found.");

    const currentLevel = Number(identity.backoff_level);
    const currentTicks = Number(identity.ticks_at_level);
    const { delaySeconds, nextLevel, nextTicks } = nextPacing({
      currentLevel,
      currentTicks,
      fn: input.fn
    });
    const stepType =
      input.fn === "act" || input.fn === "share"
        ? "observation"
        : input.fn === "idle"
          ? "idle"
          : "thought";

    const root = await client.query(
      `SELECT id FROM trajectories
       WHERE identity_id = $1 AND parent_trajectory_id IS NULL
       ORDER BY created_at ASC LIMIT 1`,
      [input.identityId]
    );
    const trajectoryId = String(root.rows[0]?.id);
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      trajectoryId
    ]);
    const tail = await client.query(
      `SELECT id, sequence FROM trajectory_steps
       WHERE trajectory_id = $1 ORDER BY sequence DESC LIMIT 1`,
      [trajectoryId]
    );
    const stepId = randomUUID();
    const fields = {
      function: input.fn,
      runId: input.runId,
      delaySeconds
    };
    await client.query(
      `INSERT INTO trajectory_steps
        (id, identity_id, trajectory_id, sequence, parent_step_id,
         trigger_step_id, type, source, content, resolves, fields)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'monolith', $8, $9, $10)`,
      [
        stepId,
        input.identityId,
        trajectoryId,
        Number(tail.rows[0]?.sequence ?? 0) + 1,
        tail.rows[0]?.id ?? null,
        input.triggerStepId,
        stepType,
        input.content,
        input.resolves ?? null,
        JSON.stringify(fields)
      ]
    );
    await client.query(
      `UPDATE identities
       SET backoff_level = $2, ticks_at_level = $3,
           spontaneous_wakes = spontaneous_wakes + 1,
           next_wake_at = now() + make_interval(secs => $4),
           goal_review_at = CASE
             WHEN goal_review_at IS NULL THEN now() + interval '7 days'
             ELSE goal_review_at END,
           updated_at = now()
       WHERE id = $1`,
      [input.identityId, nextLevel, nextTicks, delaySeconds]
    );
    await client.query(
      `UPDATE thinker_runs
       SET status = 'completed', completed_at = now()
       WHERE id = $1`,
      [input.runId]
    );
    return { delaySeconds, stepId };
  });
}

export async function recordResponderDecision(input: {
  identityId: string;
  runId: string;
  triggerStepId: string;
  action: "reply" | "defer" | "no_reply";
  message: string;
  request: string;
  person: string;
}) {
  const duplicate = await query(
    `SELECT id FROM trajectory_steps
     WHERE identity_id = $1
       AND (reply_to = $2 OR
            (trigger_step_id = $2 AND source = 'responder'
             AND fields ? 'decision'))
     LIMIT 1`,
    [input.identityId, input.triggerStepId]
  );
  if (duplicate.rows[0]) {
    await completeRun(input.runId);
    return { duplicate: true };
  }

  if (input.action === "reply" && input.message.trim()) {
    await appendStep({
      identityId: input.identityId,
      type: "message",
      source: "responder",
      content: input.message.trim(),
      sender: "identity",
      recipient: input.person,
      replyTo: input.triggerStepId,
      triggerStepId: input.triggerStepId,
      fields: { decision: "replied", runId: input.runId }
    });
  } else if (input.action === "defer") {
    if (input.message.trim()) {
      await appendStep({
        identityId: input.identityId,
        type: "message",
        source: "responder",
        content: input.message.trim(),
        sender: "identity",
        recipient: input.person,
        replyTo: input.triggerStepId,
        triggerStepId: input.triggerStepId,
        fields: { decision: "deferred", runId: input.runId }
      });
    }
    await appendStep({
      identityId: input.identityId,
      type: "action",
      source: "responder",
      content: input.request.trim(),
      sender: input.person,
      triggerStepId: input.triggerStepId,
      fields: {
        decision: "deferred",
        person: input.person,
        request: input.request.trim(),
        runId: input.runId
      }
    });
  }

  await appendStep({
    identityId: input.identityId,
    type: "observation",
    source: "responder",
    content:
      input.action === "reply"
        ? `Replied to ${input.person}: ${input.message.trim()}`
        : input.action === "defer"
          ? `Deferred work requested by ${input.person}: ${input.request.trim()}`
          : `Chose not to reply to ${input.person}; the message needed no reply.`,
    triggerStepId: input.triggerStepId,
    fields: { decision: input.action, runId: input.runId }
  });
  await completeRun(input.runId);
  return { duplicate: false };
}

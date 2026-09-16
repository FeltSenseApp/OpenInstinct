import { defineDynamic, defineTool, type ToolContext } from "eve/tools";
import { z } from "zod";
import { resolveModeValue } from "@agent/lib/mode";
import { scopeFromPrincipal } from "@agent/lib/principal-scope";
import { postScheduledRunRoute } from "@agent/lib/schedules/request";
import { scheduleOwner, scheduleReplyAnchor } from "@agent/lib/schedules/tools";
import { createScheduledAgentJob } from "@db/services/scheduled-agent-jobs";
import { listWorkspacesForUser } from "@db/services/workspaces";

type Workspace = Awaited<ReturnType<typeof listWorkspacesForUser>>[number];

function defineCompanyDispatch(companies: readonly Workspace[]) {
  const choices = companies
    .map((company) => `${company.name ?? "Unnamed company"} (${company.id})`)
    .join(", ");

  return defineTool({
    description: `Send a bounded task from the user's personal conversation to one company agent. The company runs it independently in its shared workspace and reports the result or a genuine human-input request back here. Available companies: ${choices}`,
    inputSchema: z.strictObject({
      company: z
        .string()
        .trim()
        .min(1)
        .describe("Exact company name or workspace ID."),
      task: z.string().trim().min(1).max(8_000),
    }),
    async execute({ company, task }, context) {
      return dispatchToCompany(context, company, task);
    },
  });
}

export default defineDynamic({
  events: {
    async "turn.started"(_event, context) {
      if (!resolveModeValue(context, { interactive: true })) return null;
      const caller = context.session.auth.current;
      if (caller?.principalType !== "user") return null;

      const workspaces = await listWorkspacesForUser(
        scopeFromPrincipal(caller).userId
      );
      const current = workspaces.find(
        (workspace) => workspace.id === caller.attributes.workspaceId
      );
      const companies = workspaces.filter(
        (workspace) => workspace.kind === "company"
      );
      if (current?.kind !== "personal" || companies.length === 0) return null;

      return { "company-dispatch": defineCompanyDispatch(companies) };
    },
  },
});

async function dispatchToCompany(
  context: ToolContext,
  requestedCompany: string,
  task: string
) {
  const owner = scheduleOwner(context);
  const workspaces = await listWorkspacesForUser(owner.scope.userId);
  const current = workspaces.find(
    (workspace) => workspace.id === owner.scope.workspaceId
  );
  if (current?.kind !== "personal") {
    throw new Error("Company tasks must be initiated from the personal agent.");
  }

  const normalized = requestedCompany.trim().toLocaleLowerCase();
  const matches = workspaces.filter(
    (workspace) =>
      workspace.kind === "company" &&
      (workspace.id.toLocaleLowerCase() === normalized ||
        workspace.name?.toLocaleLowerCase() === normalized)
  );
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "That company is not available to this user."
        : "More than one company has that name. Use the workspace ID."
    );
  }
  const target = matches[0];
  if (!target) throw new Error("That company is not available to this user.");

  const companyName = target.name ?? "Unnamed company";
  const job = await createScheduledAgentJob(
    { userId: owner.scope.userId, workspaceId: target.id },
    {
      ...owner.conversation,
      missedRunPolicy: "run_latest",
      prompt: [
        `Company dispatch for ${companyName}.`,
        "Operate as this company's agent in its shared company workspace.",
        `Task: ${task}`,
        "Work independently. Ask for human input only when knowledge, judgment, approval, or manual action genuinely blocks progress.",
      ].join("\n\n"),
      replyAnchorMessageId: scheduleReplyAnchor(context),
      timing: {
        at: new Date(Date.now() + 250).toISOString(),
        kind: "once",
      },
    }
  );
  const dispatch = await postScheduledRunRoute(
    "/internal/scheduled-run/dispatch",
    {}
  );
  if (!dispatch.ok) {
    throw new Error("The company task was queued but could not be started.");
  }

  return {
    company: companyName,
    dispatchId: job.id,
    status: "queued",
  };
}

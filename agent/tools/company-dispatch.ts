import { randomUUID } from "node:crypto";
import { defineDynamic, defineTool, type ToolContext } from "eve/tools";
import { z } from "zod";
import { resolveModeValue } from "@agent/lib/mode";
import { scopeFromPrincipal } from "@agent/lib/principal-scope";
import {
  postCompanyRunResponse,
  postCompanyRunStart,
} from "@agent/lib/company-run/request";
import { findCompanySessionForUser } from "@db/services/sessions";
import { listWorkspacesForUser } from "@db/services/workspaces";

type Workspace = Awaited<ReturnType<typeof listWorkspacesForUser>>[number];

function defineCompanyDispatch(companies: readonly Workspace[]) {
  const choices = companies
    .map((company) => `${company.name ?? "Unnamed company"} (${company.id})`)
    .join(", ");

  return defineTool({
    description: `Start one bounded request in a company's independent agent session. The company works in its shared workspace and reports only a useful result or genuine human blocker back to this personal conversation. Available companies: ${choices}`,
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

const answerCompany = defineTool({
  description:
    "Resume the exact company session that asked a genuine blocking question. Use the internal company session ID retained in conversation context and pass the user's answer exactly as given.",
  inputSchema: z.strictObject({
    answer: z.string().trim().min(1).max(8_000),
    sessionId: z.string().min(1),
  }),
  async execute({ answer, sessionId }, context) {
    const caller = context.session.auth.current;
    if (caller?.principalType !== "user") {
      throw new Error("An authenticated user is required.");
    }
    const owner = scopeFromPrincipal(caller);
    const companySession = await findCompanySessionForUser(
      owner.userId,
      sessionId
    );
    if (!companySession) {
      throw new Error("That company session is not available to this user.");
    }
    const response = await postCompanyRunResponse({
      answer,
      targetWorkspaceId: companySession.workspaceId,
      userId: owner.userId,
      workerSessionId: sessionId,
    });
    if (!response.ok) {
      throw new Error("The company session could not be resumed.");
    }
    return { resumed: true, sessionId };
  },
});

export default defineDynamic({
  events: {
    async "turn.started"(_event, context) {
      const mode = resolveModeValue(context, {
        interactive: "interactive" as const,
        "company-report": "company-report" as const,
      });
      if (!mode) return null;
      const caller = context.session.auth.current;
      if (caller?.principalType !== "user") return null;

      if (mode === "company-report") {
        return { "company-answer": answerCompany };
      }

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

      return {
        "company-answer": answerCompany,
        "company-dispatch": defineCompanyDispatch(companies),
      };
    },
  },
});

async function dispatchToCompany(
  context: ToolContext,
  requestedCompany: string,
  task: string
) {
  const caller = context.session.auth.current;
  if (caller?.principalType !== "user") {
    throw new Error("An authenticated user is required.");
  }
  const owner = scopeFromPrincipal(caller);
  const workspaces = await listWorkspacesForUser(owner.userId);
  const current = workspaces.find(
    (workspace) => workspace.id === owner.workspaceId
  );
  if (current?.kind !== "personal") {
    throw new Error("Company work must be initiated from the personal agent.");
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

  const originChannel = z
    .enum(["eve", "linq"])
    .parse(caller.attributes.conversationChannel);
  const originConversationId =
    originChannel === "eve"
      ? context.session.id
      : z.string().startsWith("linq:").parse(caller.attributes.conversationId);
  const replyAnchor =
    originChannel === "linq"
      ? z.string().min(1).safeParse(caller.attributes.linqMessageId)
      : undefined;
  const dispatchId = randomUUID();
  const companyName = target.name ?? "Unnamed company";
  const response = await postCompanyRunStart({
    companyDispatchId: dispatchId,
    companyName,
    originChannel,
    originConversationId,
    originReplyAnchorMessageId:
      replyAnchor?.success === true ? replyAnchor.data : undefined,
    originWorkspaceId: owner.workspaceId,
    targetWorkspaceId: target.id,
    task,
    userId: owner.userId,
  });
  if (!response.ok) {
    throw new Error("The company session could not be started.");
  }
  const started = z
    .object({ dispatchId: z.uuid(), sessionId: z.string().min(1) })
    .parse(await response.json());
  return {
    company: companyName,
    dispatchId: started.dispatchId,
    sessionId: started.sessionId,
    status: "started" as const,
  };
}

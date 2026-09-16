import { defineChannel, POST } from "eve/channels";
import { localDev, routeAuth, vercelOidc } from "eve/channels/auth";
import {
  companyRunReportSchema,
  companyRunRespondSchema,
  companyRunStartSchema,
} from "@agent/lib/company-run/request";
import linq from "./linq";

const internalRouteAuth = [vercelOidc(), localDev()];

export default defineChannel({
  audience({ auth }) {
    return auth?.principalType === "user" ? "private" : "unknown";
  },
  routes: [
    POST("/eve/v1/company-run/start", async (request, { from }) => {
      const auth = await routeAuth(request, internalRouteAuth);
      if (auth instanceof Response) return auth;
      const input = companyRunStartSchema.parse(await request.json());
      const session = await from(`company-run:${input.companyDispatchId}`).send(
        companyWorkerPrompt(input),
        {
          auth: companyWorkerAuth(input),
          title: `${input.companyName}: ${input.task.slice(0, 120)}`,
        }
      );
      return Response.json(
        { dispatchId: input.companyDispatchId, sessionId: session.id },
        { status: 202 }
      );
    }),
    POST(
      "/eve/v1/company-run/report",
      async (request, { attachSession, to }) => {
        const auth = await routeAuth(request, internalRouteAuth);
        if (auth instanceof Response) return auth;
        const input = companyRunReportSchema.parse(await request.json());
        const options = {
          auth: companyResultAuth(input),
          turnPolicy: "queue" as const,
        };
        const prompt = companyReportPrompt(input);
        if (input.originChannel === "linq") {
          await to(linq, {
            adapterName: "linq",
            threadId: input.originConversationId,
          }).send(prompt, options);
          return new Response(null, { status: 202 });
        }
        const result = await attachSession(input.originConversationId).send(
          prompt,
          options
        );
        return new Response(null, {
          status: result.status === "session_not_active" ? 409 : 202,
        });
      }
    ),
    POST(
      "/eve/v1/company-run/respond",
      async (request, { attachSession }) => {
        const auth = await routeAuth(request, internalRouteAuth);
        if (auth instanceof Response) return auth;
        const input = companyRunRespondSchema.parse(await request.json());
        const result = await attachSession(input.workerSessionId).send(
          input.answer,
          {
            auth: {
              attributes: { workspaceId: input.targetWorkspaceId },
              authenticator: "company-answer",
              issuer: "open-instinct",
              principalId: input.userId,
              principalType: "user",
            },
            turnPolicy: "queue",
          }
        );
        return new Response(null, {
          status: result.status === "session_not_active" ? 409 : 202,
        });
      }
    ),
  ],
});

function companyWorkerPrompt(input: Parameters<typeof companyWorkerAuth>[0]) {
  return [
    `Operate as the agent for ${input.companyName} in its shared company workspace.`,
    `Task from an authorized company member: ${input.task}`,
    "Work independently and return a useful completed result. Ask for human input only when knowledge, judgment, approval, or manual action genuinely blocks progress.",
  ].join("\n\n");
}

function companyWorkerAuth(input: {
  readonly companyDispatchId: string;
  readonly companyName: string;
  readonly originChannel: "eve" | "linq";
  readonly originConversationId: string;
  readonly originReplyAnchorMessageId?: string;
  readonly originWorkspaceId: string;
  readonly targetWorkspaceId: string;
  readonly task: string;
  readonly userId: string;
}) {
  const attributes = new Map<string, string>([
    ["companyDispatchId", input.companyDispatchId],
    ["companyName", input.companyName],
    ["originChannel", input.originChannel],
    ["originConversationId", input.originConversationId],
    ["originWorkspaceId", input.originWorkspaceId],
    ["task", input.task],
    ["workspaceId", input.targetWorkspaceId],
  ]);
  if (input.originReplyAnchorMessageId) {
    attributes.set(
      "originReplyAnchorMessageId",
      input.originReplyAnchorMessageId
    );
  }
  return {
    attributes: Object.fromEntries(attributes),
    authenticator: "company-worker",
    issuer: "open-instinct",
    principalId: input.userId,
    principalType: "user" as const,
  };
}

function companyResultAuth(input: {
  readonly companyDispatchId: string;
  readonly companyName: string;
  readonly originChannel: "eve" | "linq";
  readonly originConversationId: string;
  readonly originReplyAnchorMessageId?: string;
  readonly originWorkspaceId: string;
  readonly userId: string;
  readonly workerSessionId: string;
}) {
  const attributes = new Map<string, string>([
    ["companyDispatchId", input.companyDispatchId],
    ["companyName", input.companyName],
    ["companyWorkerSessionId", input.workerSessionId],
    ["conversationChannel", input.originChannel],
    ["conversationId", input.originConversationId],
    ["workspaceId", input.originWorkspaceId],
  ]);
  if (input.originReplyAnchorMessageId) {
    attributes.set("linqMessageId", input.originReplyAnchorMessageId);
  }
  return {
    attributes: Object.fromEntries(attributes),
    authenticator: "company-result",
    issuer: "open-instinct",
    principalId: input.userId,
    principalType: "user" as const,
  };
}

function companyReportPrompt(
  input: ReturnType<typeof companyRunReportSchema.parse>
) {
  if (input.kind === "input") {
    return [
      `${input.companyName} is genuinely blocked and needs human input before it can continue.`,
      `Original task: ${input.task}`,
      `Internal company session ID: ${input.workerSessionId}`,
      `Pending request: ${JSON.stringify(input.requests)}`,
      "First check whether the existing personal conversation clearly answers the request. If it does, call company-answer now. Otherwise ask the user clearly, keeping the internal session ID out of the user-visible message. After the user replies, call company-answer so this exact company session resumes.",
    ].join("\n\n");
  }
  if (input.kind === "error") {
    return [
      `${input.companyName} could not complete the requested work.`,
      `Original task: ${input.task}`,
      `Failure: ${input.error}`,
      "Tell the user concisely only if this failure is useful or actionable.",
    ].join("\n\n");
  }
  return [
    `${input.companyName} completed work requested through the personal agent.`,
    `Original task: ${input.task}`,
    `Company result: ${input.result}`,
    "Return the useful result naturally and name the company. Do not mention internal sessions, dispatches, handoffs, or implementation details.",
  ].join("\n\n");
}

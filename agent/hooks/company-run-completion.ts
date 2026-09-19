import { defineHook } from "eve/hooks";
import { companyRunIdentity } from "@agent/lib/company-run/identity";
import { postCompanyRunReport } from "@agent/lib/company-run/request";

export default defineHook({
  events: {
    async "input.requested"(event, ctx) {
      const identity = companyRunIdentity(ctx.session.auth);
      if (!identity) return;
      await report({
        ...reportBase(identity, ctx.session.id),
        kind: "input",
        requests: [...event.data.requests],
      });
    },
    async "message.completed"(event, ctx) {
      const identity = companyRunIdentity(ctx.session.auth);
      if (!identity || event.data.finishReason === "tool-calls") return;
      const result = event.data.message?.trim();
      if (event.data.finishReason === "stop" && result) {
        await report({
          ...reportBase(identity, ctx.session.id),
          kind: "result",
          result: result.slice(0, 4_000),
        });
      }
    },
    async "turn.failed"(event, ctx) {
      const identity = companyRunIdentity(ctx.session.auth);
      if (!identity) return;
      await report({
        ...reportBase(identity, ctx.session.id),
        error: event.data.message,
        kind: "error",
      });
    },
  },
});

function reportBase(
  identity: NonNullable<ReturnType<typeof companyRunIdentity>>,
  workerSessionId: string
) {
  return {
    companyDispatchId: identity.companyDispatchId,
    companyName: identity.companyName,
    originChannel: identity.originChannel,
    originConversationId: identity.originConversationId,
    originReplyAnchorMessageId: identity.originReplyAnchorMessageId,
    originWorkspaceId: identity.originWorkspaceId,
    targetWorkspaceId: identity.workspaceId,
    task: identity.task,
    userId: identity.userId,
    workerSessionId,
  };
}

async function report(input: Parameters<typeof postCompanyRunReport>[0]) {
  try {
    const response = await postCompanyRunReport(input);
    if (!response.ok) {
      console.warn("[company-run] report was not accepted", {
        dispatchId: input.companyDispatchId,
        status: response.status,
        workerSessionId: input.workerSessionId,
      });
    }
  } catch (error) {
    console.warn("[company-run] report delivery failed", {
      cause: error,
      dispatchId: input.companyDispatchId,
      workerSessionId: input.workerSessionId,
    });
  }
}

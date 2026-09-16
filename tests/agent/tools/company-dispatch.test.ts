import type { DynamicResolveContext, ToolContext } from "eve/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createScheduledAgentJob } from "@db/services/scheduled-agent-jobs";
import type { listWorkspacesForUser } from "@db/services/workspaces";

const services = vi.hoisted(() => ({
  create: vi.fn<typeof createScheduledAgentJob>(),
  listWorkspaces: vi.fn<typeof listWorkspacesForUser>(),
}));

vi.mock("@db/services/scheduled-agent-jobs", () => ({
  createScheduledAgentJob: services.create,
}));

vi.mock("@db/services/workspaces", () => ({
  listWorkspacesForUser: services.listWorkspaces,
}));

import companyDispatch from "@agent/tools/company-dispatch";

describe("company dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T20:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null)));
    services.listWorkspaces.mockResolvedValue([
      {
        id: "workspace:user-1",
        kind: "personal",
        name: null,
        role: "owner",
      },
      {
        id: "company:felt-sense",
        kind: "company",
        name: "Felt Sense",
        role: "owner",
      },
    ]);
  });

  it("offers a company tool only in the personal workspace", async () => {
    const resolve = companyDispatch.events["turn.started"];
    expect(resolve).toBeDefined();
    if (!resolve) return;

    const personal = await resolve({}, dynamicContext("workspace:user-1"));
    expect(personal && !("execute" in personal)).toBe(true);
    expect(Object.keys(personal ?? {})).toEqual(["company-dispatch"]);

    expect(await resolve({}, dynamicContext("company:felt-sense"))).toBeNull();
  });

  it("queues one company-scoped run that reports to the personal conversation", async () => {
    const resolve = companyDispatch.events["turn.started"];
    if (!resolve) throw new Error("Expected company dispatch resolver.");
    const tools = await resolve({}, dynamicContext("workspace:user-1"));
    const tool =
      tools && !("execute" in tools) ? tools["company-dispatch"] : null;
    if (!tool) throw new Error("Expected company-dispatch tool.");
    services.create.mockResolvedValue({
      conversationChannel: "eve",
      conversationId: "session-personal",
      createdAt: new Date("2026-09-16T20:00:00.000Z"),
      createdByUserId: "user-1",
      id: "00000000-0000-4000-8000-000000000001",
      lastError: null,
      lastRunAt: null,
      missedRunPolicy: "run_latest",
      nextRunAt: new Date("2026-09-16T20:00:00.250Z"),
      prompt: "Company dispatch for Felt Sense.",
      replyAnchorMessageId: null,
      revision: 0,
      status: "active",
      timing: { at: "2026-09-16T20:00:00.250Z", kind: "once" },
      updatedAt: new Date("2026-09-16T20:00:00.000Z"),
      workspaceId: "company:felt-sense",
    });

    const result = await tool.execute(
      { company: "Felt Sense", task: "Prepare the launch brief." },
      toolContext()
    );

    const call = services.create.mock.calls[0];
    expect(call?.[0]).toEqual({
      userId: "user-1",
      workspaceId: "company:felt-sense",
    });
    expect(call?.[1]).toMatchObject({
      conversationChannel: "eve",
      conversationId: "session-personal",
      missedRunPolicy: "run_latest",
      timing: {
        at: "2026-09-16T20:00:00.250Z",
        kind: "once",
      },
    });
    expect(call?.[1].prompt).toContain("Task: Prepare the launch brief.");
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://example.com/internal/scheduled-run/dispatch"),
      expect.objectContaining({ method: "POST" })
    );
    expect(result).toEqual({
      company: "Felt Sense",
      dispatchId: "00000000-0000-4000-8000-000000000001",
      status: "queued",
    });
  });
});

function dynamicContext(workspaceId: string) {
  return {
    channel: { kind: "channel:eve", metadata: {} },
    messages: [],
    model: null,
    session: {
      auth: {
        current: {
          attributes: { conversationChannel: "eve", workspaceId },
          authenticator: "authjs",
          principalId: "user-1",
          principalType: "user",
        },
        initiator: null,
      },
      id: "session-personal",
    },
  } satisfies DynamicResolveContext;
}

function toolContext() {
  return {
    abortSignal: new AbortController().signal,
    callId: "call-company",
    async getSandbox() {
      throw new Error("Sandbox access is not expected.");
    },
    getSkill() {
      throw new Error("Skill access is not expected.");
    },
    async getToken() {
      throw new Error("Token access is not expected.");
    },
    requireAuth() {
      throw new Error("Connection authorization is not expected.");
    },
    session: {
      auth: {
        current: {
          attributes: {
            conversationChannel: "eve",
            workspaceId: "workspace:user-1",
          },
          authenticator: "authjs",
          principalId: "user-1",
          principalType: "user",
        },
        initiator: null,
      },
      id: "session-personal",
      turn: { id: "turn-1", sequence: 0 },
    },
    toolName: "company-dispatch",
  } satisfies ToolContext;
}

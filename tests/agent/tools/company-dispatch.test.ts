import type { DynamicResolveContext, ToolContext } from "eve/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { findCompanySessionForUser } from "@db/services/sessions";
import type { listWorkspacesForUser } from "@db/services/workspaces";
import {
  companyRunRespondSchema,
  companyRunStartSchema,
} from "@agent/lib/company-run/request";

const services = vi.hoisted(() => ({
  findCompanySession: vi.fn<typeof findCompanySessionForUser>(),
  listWorkspaces: vi.fn<typeof listWorkspacesForUser>(),
}));

vi.mock("@db/services/sessions", () => ({
  findCompanySessionForUser: services.findCompanySession,
}));

vi.mock("@db/services/workspaces", () => ({
  listWorkspacesForUser: services.listWorkspaces,
}));

import companyDispatch from "@agent/tools/company-dispatch";

describe("company dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("offers company tools only in the personal workspace", async () => {
    const resolve = companyDispatch.events["turn.started"];
    expect(resolve).toBeDefined();
    if (!resolve) return;

    const personal = await resolve({}, dynamicContext("workspace:user-1"));
    expect(personal && !("execute" in personal)).toBe(true);
    expect(Object.keys(personal ?? {})).toEqual([
      "company-answer",
      "company-dispatch",
    ]);

    expect(await resolve({}, dynamicContext("company:felt-sense"))).toBeNull();
  });

  it("starts a company-owned Eve session without creating a schedule", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            dispatchId: "00000000-0000-4000-8000-000000000001",
            sessionId: "company-session-1",
          },
          { status: 202 }
        )
      )
    );
    const tools = await resolvedTools();
    const tool = tools["company-dispatch"];
    if (!tool) throw new Error("Expected company-dispatch tool.");
    const result = await tool.execute(
      { company: "Felt Sense", task: "Prepare the launch brief." },
      toolContext("company-dispatch")
    );

    const [url, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toEqual(
      new URL("https://example.com/internal/company-run/start")
    );
    expect(request).toMatchObject({ method: "POST" });
    const serializedBody = z.string().parse(request?.body);
    const body = companyRunStartSchema.parse(JSON.parse(serializedBody));
    expect(body).toMatchObject({
      companyName: "Felt Sense",
      originChannel: "eve",
      originConversationId: "session-personal",
      originWorkspaceId: "workspace:user-1",
      targetWorkspaceId: "company:felt-sense",
      task: "Prepare the launch brief.",
      userId: "user-1",
    });
    expect(result).toEqual({
      company: "Felt Sense",
      dispatchId: "00000000-0000-4000-8000-000000000001",
      sessionId: "company-session-1",
      status: "started",
    });
  });

  it("resumes only a company session owned by the current user", async () => {
    services.findCompanySession.mockResolvedValue({
      workspaceId: "company:felt-sense",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
    );
    const tools = await resolvedTools();
    const tool = tools["company-answer"];
    await tool.execute(
      { answer: "Blue.", sessionId: "company-session-1" },
      toolContext("company-answer")
    );

    expect(services.findCompanySession).toHaveBeenCalledWith(
      "user-1",
      "company-session-1"
    );
    const [url, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toEqual(
      new URL("https://example.com/internal/company-run/respond")
    );
    const serializedBody = z.string().parse(request?.body);
    expect(companyRunRespondSchema.parse(JSON.parse(serializedBody))).toEqual({
      answer: "Blue.",
      targetWorkspaceId: "company:felt-sense",
      userId: "user-1",
      workerSessionId: "company-session-1",
    });
  });
});

async function resolvedTools() {
  const resolve = companyDispatch.events["turn.started"];
  if (!resolve) throw new Error("Expected company dispatch resolver.");
  const tools = await resolve({}, dynamicContext("workspace:user-1"));
  if (!tools || "execute" in tools) {
    throw new Error("Expected company tools.");
  }
  return tools;
}

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

function toolContext(toolName: string) {
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
    toolName,
  } satisfies ToolContext;
}

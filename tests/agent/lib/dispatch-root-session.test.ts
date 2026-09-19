import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { listWorkspacesForUser } from "@db/services/workspaces";
import type { requestInternalRoute } from "@agent/lib/internal-request";

const internal = vi.hoisted(() => ({
  request: vi.fn<typeof requestInternalRoute>(),
}));
const workspaces = vi.hoisted(() => ({
  list: vi.fn<typeof listWorkspacesForUser>(),
}));

vi.mock("@agent/lib/internal-request", () => ({
  requestInternalRoute: internal.request,
}));
vi.mock("@db/services/workspaces", () => ({
  listWorkspacesForUser: workspaces.list,
}));

import {
  deriveOperationId,
  dispatchRootSession,
} from "@agent/lib/eve/dispatch-root-session";

const createBodySchema = z.looseObject({
  operationId: z.string(),
  message: z.string(),
});

describe("dispatchRootSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaces.list.mockResolvedValue([
      {
        id: "company:felt-sense",
        kind: "company",
        name: "Felt Sense",
        role: "owner",
      },
    ]);
  });

  it("uses Eve operationId and carries target, principal, provenance, and return context", async () => {
    mockCanonicalSession("company-session", "Prepare the launch brief.");

    await expect(dispatchRootSession(dispatchInput())).resolves.toEqual({
      sessionId: "company-session",
    });

    const [path, init] = internal.request.mock.calls[0] ?? [];
    expect(path).toBe("/eve/v1/session");
    const body = parseCreateBody(init?.body);
    expect(body).toMatchObject({
      clientContext: {
        dispatch: {
          provenance: {
            sourceRecordId: "company-dispatch-1",
            sourceType: "personal-agent",
          },
          returnRoute: {
            channel: "eve",
            conversationId: "personal-session",
          },
          targetAgentId: "founder",
          targetWorkspaceId: "company:felt-sense",
          version: 1,
        },
      },
      forwardedPrincipal: {
        current: {
          attributes: {
            dispatchIdempotencyKey: "company-dispatch-1",
            targetAgentId: "founder",
            workspaceId: "company:felt-sense",
          },
          principalId: "user-1",
          principalType: "user",
        },
      },
      message: "Prepare the launch brief.",
    });
    expect(body.operationId).toBe(
      deriveOperationId({
        idempotencyKey: "company-dispatch-1",
        targetAgentId: "founder",
        targetWorkspaceId: "company:felt-sense",
      })
    );
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
      "x-open-instinct-root-dispatch": "v1",
    });
  });

  it("returns the same canonical owner for sequential retries", async () => {
    mockCanonicalSession("company-session", "Prepare the launch brief.");
    const first = await dispatchRootSession(dispatchInput());
    const second = await dispatchRootSession(dispatchInput());

    expect(first).toEqual(second);
    const operationIds = createBodies().map((body) => body.operationId);
    expect(new Set(operationIds)).toEqual(
      new Set([
        deriveOperationId({
          idempotencyKey: "company-dispatch-1",
          targetAgentId: "founder",
          targetWorkspaceId: "company:felt-sense",
        }),
      ])
    );
  });

  it("converges concurrent cold-start candidates onto the canonical owner", async () => {
    let creates = 0;
    internal.request.mockImplementation(async (path, init) => {
      if (init.method === "GET") {
        return streamResponse("Prepare the launch brief.");
      }
      creates += 1;
      return acceptedResponse(
        creates === 1
          ? "losing-candidate-a"
          : creates === 2
            ? "losing-candidate-b"
            : "company-session"
      );
    });

    const [left, right] = await Promise.all([
      dispatchRootSession(dispatchInput()),
      dispatchRootSession(dispatchInput()),
    ]);

    expect(left.sessionId).toBe("company-session");
    expect(right.sessionId).toBe("company-session");
    expect(new Set(createBodies().map((body) => body.operationId)).size).toBe(
      1
    );
  });

  it("rejects reuse after a different task won the operation", async () => {
    mockCanonicalSession("company-session", "A different task.");

    await expect(dispatchRootSession(dispatchInput())).rejects.toThrow(
      "idempotency key already belongs to a different root-session task"
    );
  });

  it("rejects a principal without target-workspace access", async () => {
    workspaces.list.mockResolvedValue([]);

    await expect(dispatchRootSession(dispatchInput())).rejects.toThrow(
      "cannot access the target workspace"
    );
    expect(internal.request).not.toHaveBeenCalled();
  });
});

function dispatchInput() {
  return {
    idempotencyKey: "company-dispatch-1",
    principal: {
      attributes: { workspaceId: "personal:user-1" },
      authenticator: "authjs",
      principalId: "user-1",
      principalType: "user" as const,
    },
    provenance: {
      sourceRecordId: "company-dispatch-1",
      sourceType: "personal-agent",
    },
    returnRoute: {
      channel: "eve",
      conversationId: "personal-session",
    },
    targetAgentId: "founder",
    targetWorkspaceId: "company:felt-sense",
    task: "Prepare the launch brief.",
  };
}

function mockCanonicalSession(sessionId: string, task: string) {
  internal.request.mockImplementation(async (_path, init) =>
    init.method === "GET" ? streamResponse(task) : acceptedResponse(sessionId)
  );
}

function acceptedResponse(sessionId: string) {
  return Response.json(
    { ok: true, sessionId, status: "accepted" },
    { status: 202 }
  );
}

function streamResponse(task: string) {
  return new Response(
    `${JSON.stringify({
      data: { message: task, sequence: 0, turnId: "turn-1" },
      type: "message.received",
    })}\n`,
    { status: 200 }
  );
}

function createBodies() {
  return internal.request.mock.calls
    .filter(([, init]) => init.method === "POST")
    .map(([, init]) => parseCreateBody(init.body));
}

function parseCreateBody(body: BodyInit | null | undefined) {
  const serialized = z.string().parse(body);
  return createBodySchema.parse(JSON.parse(serialized));
}

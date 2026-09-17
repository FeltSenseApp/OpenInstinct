import type { RouteHandlerArgs } from "eve/channels";
import { describe, expect, it } from "vitest";
import scheduledRunChannel from "@agent/channels/scheduled-run";

const scheduledRunPaths = [
  "/eve/v1/scheduled-run/report",
  "/eve/v1/scheduled-run/respond",
] as const;

describe("scheduled run channel authentication", () => {
  for (const path of scheduledRunPaths) {
    it(`rejects an unauthenticated request to ${path}`, async () => {
      const route = scheduledRunChannel.routes.find(
        (candidate) =>
          candidate.transport !== "websocket" &&
          candidate.method === "POST" &&
          candidate.path === path
      );
      if (!route || route.transport === "websocket") {
        throw new Error(`The scheduled run route ${path} is unavailable.`);
      }

      const response = await route.handler(
        new Request(`https://assistant.example${path}`, {
          body: "not valid JSON",
          method: "POST",
        }),
        unexpectedRouteContext()
      );

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
    });
  }
});

describe("scheduled run channel boundary", () => {
  it("does not expose an addressed cold-start receiver", () => {
    expect(scheduledRunChannel.receive).toBeUndefined();
  });
});

function unexpectedRouteContext() {
  return {
    attachSession: unexpectedRouteRequest,
    from: unexpectedRouteRequest,
    params: {},
    requestIp: null,
    resolveSession: unexpectedRouteRequest,
    to: unexpectedRouteRequest,
    waitUntil: unexpectedRouteRequest,
  } satisfies RouteHandlerArgs;
}

function unexpectedRouteRequest(): never {
  throw new Error("The request should stop at authentication.");
}

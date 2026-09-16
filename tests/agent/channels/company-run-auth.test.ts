import type { RouteHandlerArgs } from "eve/channels";
import { describe, expect, it } from "vitest";
import companyRunChannel from "@agent/channels/company-run";

const paths = [
  "/internal/company-run/start",
  "/internal/company-run/report",
  "/internal/company-run/respond",
] as const;

describe("company run channel authentication", () => {
  for (const path of paths) {
    it(`rejects an unauthenticated request to ${path}`, async () => {
      const route = companyRunChannel.routes.find(
        (candidate) =>
          candidate.transport !== "websocket" &&
          candidate.method === "POST" &&
          candidate.path === path
      );
      if (!route || route.transport === "websocket") {
        throw new Error(`The company run route ${path} is unavailable.`);
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

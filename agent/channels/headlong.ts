import { defineChannel, POST } from "eve/channels";
import { localDev, routeAuth, vercelOidc } from "eve/channels/auth";
import { z } from "zod";
import { prepareDispatch, markRunRunning } from "@/lib/headlong/dispatch";

const schema = z.object({
  identityId: z.string().uuid(),
  thinker: z.enum(["monolith", "responder"]),
  triggerStepId: z.string().uuid()
});

export default defineChannel({
  turnPolicy: "queue",
  audience: () => "private",
  routes: [
    POST("/eve/v1/headlong/internal/dispatch", async (request, { from }) => {
      let stage = "auth";
      try {
        const authenticated = await routeAuth(request, [
          vercelOidc(),
          localDev()
        ]);
        if (authenticated instanceof Response) return authenticated;

        stage = "parse";
        const input = schema.parse(await request.json());
        stage = "prepare";
        const prepared = await prepareDispatch(input);
        if (prepared.status !== "ready") {
          return Response.json(prepared, { status: 202 });
        }
        const token =
          input.thinker === "monolith"
            ? `mind:${input.identityId}`
            : `responder:${input.triggerStepId}`;
        const source = from(token);
        if (input.thinker === "monolith") {
          stage = "clear";
          await source.clear().catch(() => undefined);
        }
        stage = "send";
        const session = await source.send(prepared.context, {
          auth: prepared.principal,
          turnPolicy: "queue"
        });
        stage = "mark-running";
        await markRunRunning(prepared.runId, session.id);
        return Response.json(
          { sessionId: session.id, status: "started" },
          { status: 202 }
        );
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : "Unknown channel failure",
            ok: false,
            stage
          },
          { status: 500 }
        );
      }
    })
  ]
});

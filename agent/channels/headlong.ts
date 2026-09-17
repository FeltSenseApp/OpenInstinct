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
      const authenticated = await routeAuth(request, [
        vercelOidc(),
        localDev()
      ]);
      if (authenticated instanceof Response) return authenticated;
      const input = schema.parse(await request.json());
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
        await source.clear().catch(() => undefined);
      }
      const session = await source.send(prepared.context, {
        auth: prepared.principal,
        turnPolicy: "queue"
      });
      await markRunRunning(prepared.runId, session.id);
      return Response.json(
        { sessionId: session.id, status: "started" },
        { status: 202 }
      );
    })
  ]
});

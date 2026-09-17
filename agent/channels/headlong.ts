import { defineChannel, POST } from "eve/channels";
import { localDev, routeAuth, vercelOidc } from "eve/channels/auth";
import { z } from "zod";
import { dispatchHeadlongThinker } from "@agent/lib/headlong/dispatch";

const inputSchema = z.object({
  thinker: z.enum(["responder", "monolith"]),
  triggerEventId: z.string().min(1),
  userId: z.string().min(1),
  workspaceId: z.string().min(1),
});

export default defineChannel({
  audience: () => "private",
  routes: [
    POST("/eve/v1/headlong/dispatch", async (request) => {
      const auth = await routeAuth(request, [vercelOidc(), localDev()]);
      if (auth instanceof Response) return auth;
      const input = inputSchema.parse(await request.json());
      const result = await dispatchHeadlongThinker({
        scope: { userId: input.userId, workspaceId: input.workspaceId },
        thinker: input.thinker,
        triggerEventId: input.triggerEventId,
      });
      return Response.json(result, { status: 202 });
    }),
  ],
});

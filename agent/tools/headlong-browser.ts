import { createHash } from "node:crypto";
import Kernel, { ConflictError, NotFoundError } from "@onkernel/sdk";
import { defineDynamic, defineTool, toolOutput, toolOutputPart } from "eve/tools";
import { z } from "zod";
import { requireRuntimeIdentity } from "@/lib/headlong/runtime-identity";

const inputSchema = z.object({
  action: z.enum(["create", "execute", "screenshot", "delete"]),
  session_id: z.string().optional(),
  start_url: z.url().optional(),
  code: z.string().max(30_000).optional(),
  save_changes: z.boolean().optional()
});

export default defineDynamic({
  events: {
    "turn.started": (_event, resolverContext) => {
      const runtime = requireRuntimeIdentity(resolverContext.session.auth);
      if (
        runtime.thinker !== "monolith" ||
        !process.env.KERNEL_API_KEY
      ) {
        return null;
      }
      return defineTool({
        description:
          "Create and control a persistent Kernel browser. Execute Playwright code for deterministic reading and interaction, capture a screenshot only when vision is needed, and delete the session when finished.",
        inputSchema,
        execute: async (input, context) => {
          const kernel = new Kernel({
            apiKey: required(process.env.KERNEL_API_KEY, "KERNEL_API_KEY")
          });
          const identity = requireRuntimeIdentity(
            context.session.auth,
            "monolith"
          );
          switch (input.action) {
            case "create": {
              const profile = await ensureProfile(kernel, identity.identityId);
              const browser = await kernel.browsers.create(
                {
                  profile: {
                    id: profile.id,
                    save_changes: input.save_changes ?? false
                  },
                  start_url: input.start_url,
                  stealth: true,
                  timeout_seconds: 900
                },
                { signal: context.abortSignal }
              );
              return {
                liveViewUrl: browser.browser_live_view_url,
                sessionId: browser.session_id
              };
            }
            case "execute":
              return kernel.browsers.playwright.execute(
                required(input.session_id, "session_id"),
                {
                  code: required(input.code, "code"),
                  timeout_sec: 60
                },
                { signal: context.abortSignal }
              );
            case "screenshot": {
              const response =
                await kernel.browsers.computer.captureScreenshot(
                  required(input.session_id, "session_id"),
                  undefined,
                  { signal: context.abortSignal }
                );
              return {
                screenshot: Buffer.from(
                  await response.arrayBuffer()
                ).toString("base64")
              };
            }
            case "delete":
              await kernel.browsers.deleteByID(
                required(input.session_id, "session_id"),
                { signal: context.abortSignal }
              );
              return { deleted: true };
          }
        },
        toModelOutput(output) {
          if (
            output &&
            typeof output === "object" &&
            "screenshot" in output &&
            typeof output.screenshot === "string"
          ) {
            return toolOutput.content([
              toolOutputPart.text("Current browser screenshot."),
              toolOutputPart.file(output.screenshot, {
                mediaType: "image/png"
              })
            ]);
          }
          return toolOutput.json(output);
        }
      });
    }
  }
});

async function ensureProfile(kernel: Kernel, identityId: string) {
  const name = `headlong-${createHash("sha256")
    .update(identityId)
    .digest("hex")
    .slice(0, 40)}`;
  try {
    return await kernel.profiles.retrieve(name);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
  try {
    return await kernel.profiles.create({ name });
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error;
    return kernel.profiles.retrieve(name);
  }
}

function required(value: string | undefined, field: string) {
  if (!value) throw new Error(`${field} is required for this action.`);
  return value;
}

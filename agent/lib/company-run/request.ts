import { z } from "zod";
import { inputRequestSchema } from "eve/client";
import { postInternalRoute } from "@agent/lib/internal-request";

export const companyRunStartSchema = z.strictObject({
  companyDispatchId: z.uuid(),
  companyName: z.string().min(1),
  originChannel: z.enum(["eve", "linq"]),
  originConversationId: z.string().min(1),
  originReplyAnchorMessageId: z.string().min(1).optional(),
  originWorkspaceId: z.string().min(1),
  targetWorkspaceId: z.string().min(1),
  task: z.string().min(1).max(8_000),
  userId: z.string().min(1),
});

const companyRunReportBaseSchema = companyRunStartSchema
  .omit({
    targetWorkspaceId: true,
  })
  .extend({
    targetWorkspaceId: z.string().min(1),
    workerSessionId: z.string().min(1),
  });

export const companyRunReportSchema = z.discriminatedUnion("kind", [
  companyRunReportBaseSchema.extend({
    kind: z.literal("result"),
    result: z.string().min(1).max(4_000),
  }),
  companyRunReportBaseSchema.extend({
    kind: z.literal("input"),
    requests: inputRequestSchema.array().min(1),
  }),
  companyRunReportBaseSchema.extend({
    error: z.string().min(1).max(2_000),
    kind: z.literal("error"),
  }),
]);

export const companyRunRespondSchema = z.strictObject({
  answer: z.string().trim().min(1).max(8_000),
  targetWorkspaceId: z.string().min(1),
  userId: z.string().min(1),
  workerSessionId: z.string().min(1),
});

export async function postCompanyRunStart(
  body: z.infer<typeof companyRunStartSchema>
) {
  return postInternalRoute(
    "/internal/company-run/start",
    JSON.stringify(companyRunStartSchema.parse(body))
  );
}

export async function postCompanyRunReport(
  body: z.infer<typeof companyRunReportSchema>
) {
  return postInternalRoute(
    "/internal/company-run/report",
    JSON.stringify(companyRunReportSchema.parse(body))
  );
}

export async function postCompanyRunResponse(
  body: z.infer<typeof companyRunRespondSchema>
) {
  return postInternalRoute(
    "/internal/company-run/respond",
    JSON.stringify(companyRunRespondSchema.parse(body))
  );
}

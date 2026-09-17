import { postInternalRoute } from "@agent/lib/internal-request";

interface ScheduledRunRequestBodies {
  "/eve/v1/scheduled-run/report": { runId: string };
  "/eve/v1/scheduled-run/respond": {
    answer: string;
    leaseToken: string;
    runId: string;
  };
}

export async function postScheduledRunRoute<
  Route extends keyof ScheduledRunRequestBodies,
>(route: Route, body: ScheduledRunRequestBodies[Route]) {
  return postInternalRoute(route, JSON.stringify(body));
}

export async function postScheduledReport(runId: string) {
  const response = await postScheduledRunRoute("/eve/v1/scheduled-run/report", {
    runId,
  });
  if (!response.ok) {
    throw new Error(
      `Scheduled report callback failed (${String(response.status)}).`
    );
  }
}

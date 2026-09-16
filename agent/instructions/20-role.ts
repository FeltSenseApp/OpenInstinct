import { defineDynamic } from "eve/instructions";
import { resolveModeInstructions } from "@agent/lib/mode";
import companyReportInstructions from "./content/role/company-report.md?raw";
import companyWorkerInstructions from "./content/role/company-worker.md?raw";
import interactiveInstructions from "./content/role/interactive.md?raw";
import scheduledReportInstructions from "./content/role/scheduled-report.md?raw";
import scheduledWorkerInstructions from "./content/role/scheduled-worker.md?raw";

export default defineDynamic({
  events: {
    "turn.started": (_event, context) =>
      resolveModeInstructions(context, {
        "company-report": companyReportInstructions,
        "company-worker": companyWorkerInstructions,
        interactive: interactiveInstructions,
        "scheduled-report": scheduledReportInstructions,
        "scheduled-worker": scheduledWorkerInstructions,
      }),
  },
});

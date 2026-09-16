import { defineSchedule } from "eve/schedules";
import scheduledRunChannel from "@agent/channels/scheduled-run";
import { dispatchDueWork } from "@agent/lib/schedules/dispatch";

export default defineSchedule({
  cron: "* * * * *",
  run({ to, waitUntil }) {
    waitUntil(
      dispatchDueWork(to, (target, message, options) =>
        to(scheduledRunChannel, target).send(message, options)
      )
    );
  },
});

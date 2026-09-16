import { defineDynamic, defineInstructions } from "eve/instructions";
import { z } from "zod";
import { readUserProfile } from "@db/services/user-profile";
import { scopeFromPrincipal } from "@agent/lib/principal-scope";

export default defineDynamic({
  events: {
    "turn.started": async (_event, context) => {
      const principal = [
        context.session.auth.current,
        context.session.auth.initiator,
      ].find(
        (candidate) =>
          candidate?.principalType === "user" &&
          z.string().safeParse(candidate.attributes.workspaceId).success
      );
      if (!principal) return null;

      const profile = await readUserProfile(scopeFromPrincipal(principal));
      const instant = new Date();
      const lines = [
        "Authoritative temporal context:",
        `Current instant (UTC): ${instant.toISOString()}`,
        `User timezone: ${profile.timezone ?? "unknown"}`,
      ];

      if (profile.timezone) {
        lines.push(
          `User local date and time: ${new Intl.DateTimeFormat("en-US", {
            dateStyle: "full",
            timeStyle: "long",
            timeZone: profile.timezone,
          }).format(instant)}`,
          "Resolve relative dates such as today and tomorrow from this context. Do not use the web to determine the current date."
        );
      } else {
        lines.push(
          "Ask for the user's timezone once before resolving a relative wall-clock date, normalize it to an IANA timezone, and save it to Personal Info."
        );
      }

      return defineInstructions({ content: lines.join("\n") });
    },
  },
});

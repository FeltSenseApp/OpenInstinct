import { defineDynamic, defineTool } from "eve/tools";
import { bash } from "eve/tools/bash";
import { glob } from "eve/tools/glob";
import { grep } from "eve/tools/grep";
import { readFile } from "eve/tools/read_file";
import { webFetch } from "eve/tools/web_fetch";
import { defaultWebSearch } from "eve/tools/web_search";
import { writeFile } from "eve/tools/write_file";
import { runtimeIdentity } from "@/lib/headlong/runtime-identity";

export default defineDynamic({
  events: {
    "turn.started": (_event, ctx) => {
      if (runtimeIdentity(ctx.session.auth)?.thinker !== "monolith") return null;
      return {
        bash: defineTool({ ...bash }),
        glob: defineTool({ ...glob }),
        grep: defineTool({ ...grep }),
        read_file: defineTool({ ...readFile }),
        web_fetch: defineTool({ ...webFetch }),
        web_search: defaultWebSearch,
        write_file: defineTool({ ...writeFile })
      };
    }
  }
});

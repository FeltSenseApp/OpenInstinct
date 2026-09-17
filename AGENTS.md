# Headlong on Eve

This repository is a clean implementation of Headlong on Eve. It is not an
Open Instinct application and must not introduce Company, workspace, founder,
goal-observer, schedule, vault, or personal-assistant concepts.

The canonical behavioral source is upstream Headlong commit
`f70f644eaab1a8a2caef5239d8284dc20d23615e`. Infrastructure substitutions
are allowed only where the Vercel host requires them:

- Neon Postgres replaces identity-local JSONL and Markdown state.
- Eve durable sessions, sandboxes, subagents, and Workflow replace local
  processes, shellm child processes, and the dispatcher timer.
- Kernel supplies browser execution.

Before editing Eve surfaces, read `node_modules/eve/docs/README.md` and the
specific linked guide. Run `pnpm check`, `pnpm eve:build`, and
`pnpm build` before pushing.

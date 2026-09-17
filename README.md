# Headlong on Eve

A clean-room host port of [Headlong](https://github.com/laude-institute/headlong)
at commit `f70f644eaab1a8a2caef5239d8284dc20d23615e`.

This application preserves Headlong's one-mind model: a persistent identity,
an append-only trajectory DAG, immediate responder, continuously waking
monolith, arbitrary typed memories, tiered life context, durable workspace,
subagent branches, recap, and start/stop controls.

Eve supplies durable execution and sandboxes. Neon supplies persistent state.
Vercel supplies hosting and Workflow timers. Kernel supplies browser execution.
There is no Company or workspace product concept.

## Development

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

## Verification

```bash
pnpm check
pnpm eve:build
pnpm build
```

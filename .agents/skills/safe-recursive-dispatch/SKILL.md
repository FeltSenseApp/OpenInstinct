---
name: safe-recursive-dispatch
description: Apply when creating or changing code that creates, dispatches, retries, schedules, wakes, resumes, or recursively spawns sessions, workflows, agents, jobs, hooks, or other executable work.
---

# Block recursive create-on-retry fan-out

Never implement polling by repeating a create or dispatch mutation, and never let retries or concurrent callers turn one logical operation into multiple executions. Creation retries must converge on one stable execution through a stable idempotency key and atomic ownership; after creation, check progress only through read-only status operations.

Self-continuing work must atomically enforce its intended successor count (normally at most one successor per run). Preserve intentional bounded fan-out, but cap recursion depth, fan-out, concurrency, retries, runtime, and spend, and provide a circuit breaker.

Add focused tests proving that repeated and concurrent requests create one execution, a successful creation is not repeated as polling, and duplicate or freshly identified wakes cannot bypass the logical-operation guard.

# Headlong parity contract

Source: upstream Headlong commit
`f70f644eaab1a8a2caef5239d8284dc20d23615e`.

The application is Headlong itself on a hosted substrate. Host substitutions
must preserve behavior and must not introduce a separate product ontology.

| Headlong primitive | Hosted implementation |
| --- | --- |
| Runtime identity directory | `identities` row plus one durable Eve monolith session |
| Core identity prompt | Editable identity prompt generated from the same interview fields |
| Root and child JSONL trajectories | Append-only `trajectories` and `trajectory_steps` |
| Dispatcher subscriptions | Idempotent responder and monolith claims keyed by trigger step |
| Responder | Tool-restricted fresh Eve session with reply/defer/no-reply |
| Monolith | Continued Eve session with one function per wake |
| shellm workspace | Persistent per-identity Eve sandbox |
| shellm child run | Eve subagent sharing ancestor context and workspace |
| `mem` | Arbitrary typed memories with expiry and source-step links |
| `traj` | Search, tail, raw-step lookup, fork, and merge tools |
| `context` + tiered recap | Immutable fanout-10 rollups plus a coarse-to-fine staircase |
| Dispatcher timer | Vercel Workflow sleep followed by a continuation turn |
| Backoff | Headlong 5/10/20/40… cadence, three wakes per level, capped by function |
| Chat | Shared multi-person stream with reply-to, deferral, and sent ledger |
| Start/stop | Identity status gates dispatch without deleting state |
| Dashboard | Talk, timeline, mind log, memories, recap, identity, and runtime controls |

## Non-negotiable exclusions

- No Company or workspace entity.
- No founder, supervisor, assignment, or company-goal layer.
- No inherited Open Instinct tools, prompts, schema, routes, or UI.
- No session-per-user partition of the mind. Every participant reaches the
  same identity trajectory.

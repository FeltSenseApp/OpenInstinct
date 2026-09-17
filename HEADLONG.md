# Headlong on Eve

This branch ports Headlong commit `f70f644eaab1a8a2caef5239d8284dc20d23615e` onto Eve. The inherited Open Instinct code is retained only where it supplies deployment infrastructure: authentication, company tenancy, Postgres, Vercel, connected services, and Eve session dispatch. A company is not part of Headlong's ontology. It is the ownership boundary for exactly one Headlong identity.

## Source mapping

| Headlong primitive                               | Eve implementation                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity directory and `core_identity_prompt.md` | One `headlong_minds` row per company workspace, created by the same short identity interview                                                                 |
| File memories with arbitrary types               | `headlong_memories`; `kind` is open text and supports Headlong's fact, belief, value, todo, preference, goal, intention, objective, person, and custom types |
| Append-only JSONL trajectory                     | Append-only `headlong_events` steps with parent links, source, direction, run, and Eve session provenance                                                    |
| Thinker subscriptions                            | Explicit dispatch from inbound messages, responder observations, and durable `monolith-wake` steps                                                           |
| Fast responder                                   | One tool-less-in-practice Eve run with the Headlong `reply`, `defer`, and `no_reply` structured decision                                                     |
| Deferral index                                   | Responder `action` steps remain pending until a monolith observation names their trigger in `resolves`                                                       |
| Monolith router                                  | One bounded Eve run choosing exactly one of `act`, `share`, `think`, `learn`, `recall`, `goals`, `values`, or `idle`                                         |
| Shellm tools and child processes                 | Eve tools and subagents; the useful durable result is appended to the root trajectory                                                                        |
| Dispatcher timer                                 | Durable Eve Workflow sleep followed by an explicit `monolith-wake` trajectory step                                                                           |
| Adaptive backoff                                 | Headlong's level-based 5/10/20/40… cadence, three-wake dwell, 60-second thought cap, and 300-second idle cap                                                 |
| Related-memory thinker context                   | Up to three lexical matches from the identity memory store on every wake                                                                                     |
| Optional retrieval thinker                       | Disabled-by-default passive lexical recall, with a per-identity dashboard toggle and 20-surfacing suppression window                                         |
| Share and goal-review nudges                     | Every twelfth spontaneous wake and once-weekly goal review, respectively                                                                                     |

The Headlong trajectory is the persistent mind. Eve sessions are bounded execution records attached to its steps; they are not treated as the identity or memory.

## Intentional host substitutions

- Postgres rows replace Headlong's local Markdown and JSONL files so the state survives Vercel deployments and can be shared safely by company members.
- Eve Workflow timers replace Headlong's always-alive filesystem dispatcher.
- Eve sessions and subagents replace Shellm runs and child processes.
- The browser and connected-service tools supplied by the deployment replace Headlong's machine-local CLI skill binaries.
- The company workspace is only authorization and tenancy. No company-specific memory type, company soul, or company-agent behavior is introduced.

## Wake behavior

- External observations engage the monolith immediately and reset pacing.
- `act` and `share` are visible work and reset pacing to level zero.
- Thought-only wakes descend the same three-wake backoff ladder, capped at 60 seconds.
- `idle` descends the ladder to a 300-second cap.
- Each scheduled continuation is represented by a `monolith-wake` step before a new run is claimed.
- Run claims and terminal function commits are idempotent under workflow replay.

## Verification

Apply all Drizzle migrations through `0017`, then deploy the Next.js app and Eve runtime together.

```sh
pnpm check
pnpm build:eve
pnpm build
```

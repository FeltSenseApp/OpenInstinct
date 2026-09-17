# Headlong on Eve

This branch turns the deployed OpenInstinct company-workspace shell into a Headlong-style continuous company agent. Authentication, company membership, Postgres, Vercel, and Eve remain deployment infrastructure. The product surface and company execution path are Headlong-specific.

## Runtime mapping

| Headlong primitive    | Eve implementation                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| Identity              | One `headlong_minds` row per company workspace                                                        |
| Root trajectory       | Append-only `headlong_events` rows shared by all company members                                      |
| Dispatcher            | Idempotent run claims plus the internal Headlong Eve channel                                          |
| Fast responder        | One bounded Eve root session per inbound company message                                              |
| Monolith              | One bounded Eve root session per observation, merge, or timed wake                                    |
| One function per wake | Required `headlong-function` workflow tool with the eight Headlong functions                          |
| Adaptive self-wake    | Durable Eve Workflow `sleep`, resetting after work and backing off to 60/300 seconds                  |
| Memory, goals, todos  | Typed, expirable `headlong_memories` records compiled into every wake                                 |
| Child work            | Eve subagent sessions; their useful result is committed to the company trajectory by the monolith     |
| Context rebuild       | Identity, trigger, active memory, cadence hints, and recent trajectory compiled for every bounded run |

The trajectory—not an individual model transcript—is the company mind. Eve sessions are execution records for bounded thinker wakes. That preserves Headlong's responder/monolith concurrency without pretending one model call lives forever.

## Wake behavior

- `action` and `share` schedule an immediate next wake and reset backoff to five seconds.
- `think`, `learn`, `recall`, `goals`, and `values` exponentially back off with a 60-second ceiling.
- `idle` exponentially backs off with a 300-second ceiling.
- Every twelfth monolith wake includes a share hint.
- A goal review hint appears when no goal review was recorded in the preceding week.
- Run claims and tool commits are idempotent, including replay of a durable workflow step.

## Deployment

Apply Drizzle migrations `0015` and `0016`, then deploy the Next.js app and Eve runtime together. Existing company workspace memberships become the authorization boundary for a company's mind. A company mind is created lazily the first time its dashboard opens.

Useful verification commands:

```sh
pnpm check
pnpm build:eve
pnpm build
```

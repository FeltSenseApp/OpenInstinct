import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addMemoryAction,
  forgetMemoryAction,
  sendMessageAction,
  setIdentityStatusAction,
  updateIdentityAction,
  wakeIdentityAction
} from "@/app/actions";
import { query } from "@/lib/db";
import { getIdentity } from "@/lib/headlong/identity";
import { listMemories } from "@/lib/headlong/memory";
import { listRollups } from "@/lib/headlong/rollups";
import { listSteps } from "@/lib/headlong/trajectory";
import type { TrajectoryStep } from "@/lib/headlong/types";
import { LiveRefresh } from "./refresh";

export const dynamic = "force-dynamic";

const tabs = [
  "home",
  "talk",
  "timeline",
  "mindlog",
  "memories",
  "recap",
  "identity",
  "runtime"
] as const;
type Tab = (typeof tabs)[number];

export default async function IdentityPage({
  params,
  searchParams
}: {
  params: Promise<{ identityId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { identityId } = await params;
  const requested = (await searchParams).tab;
  const tab = tabs.includes(requested as Tab) ? (requested as Tab) : "home";
  const identity = await getIdentity(identityId);
  if (!identity) notFound();
  const [steps, memories, rollups, activeRuns] = await Promise.all([
    listSteps(identityId, { limit: tab === "mindlog" ? 300 : 100 }),
    listMemories(identityId),
    listRollups(identityId),
    query<{ count: string }>(
      `SELECT count(*)::text AS count FROM thinker_runs
       WHERE identity_id = $1 AND status IN ('claimed', 'running')`,
      [identityId]
    )
  ]);
  const runCount = Number(activeRuns.rows[0]?.count ?? 0);

  return (
    <div className="shell">
      <LiveRefresh />
      <header className="topbar">
        <Link className="wordmark" href="/">
          HEADLONG
        </Link>
        <div className="identity-title">
          <span className="status-dot" data-status={identity.status} />
          <strong>{identity.name}</strong>
          <span>{runCount ? `${String(runCount)} active` : identity.status}</span>
        </div>
        <div className="topbar-actions">
          <form action={wakeIdentityAction.bind(null, identity.id)}>
            <button className="quiet" disabled={identity.status !== "active"}>
              Wake now
            </button>
          </form>
          <form
            action={setIdentityStatusAction.bind(
              null,
              identity.id,
              identity.status === "active" ? "paused" : "active"
            )}
          >
            <button className="quiet">
              {identity.status === "active" ? "Pause" : "Resume"}
            </button>
          </form>
        </div>
      </header>
      <nav className="tabs" aria-label="Headlong">
        {tabs.map((item) => (
          <Link
            className={item === tab ? "active" : ""}
            href={`/i/${identity.id}?tab=${item}`}
            key={item}
          >
            {item}
          </Link>
        ))}
      </nav>
      <main className="content">
        {tab === "home" && (
          <Home
            identity={identity}
            memories={memories}
            runCount={runCount}
            steps={steps}
          />
        )}
        {tab === "talk" && (
          <Talk identity={identity} steps={steps} />
        )}
        {tab === "timeline" && <Timeline steps={steps} />}
        {tab === "mindlog" && <Mindlog steps={steps} />}
        {tab === "memories" && (
          <Memories identityId={identity.id} memories={memories} />
        )}
        {tab === "recap" && <Recap rollups={rollups} />}
        {tab === "identity" && <Identity identity={identity} />}
        {tab === "runtime" && (
          <Runtime
            identity={identity}
            runCount={runCount}
            steps={steps}
          />
        )}
      </main>
    </div>
  );
}

function Home({
  identity,
  memories,
  runCount,
  steps
}: {
  identity: NonNullable<Awaited<ReturnType<typeof getIdentity>>>;
  memories: Awaited<ReturnType<typeof listMemories>>;
  runCount: number;
  steps: readonly TrajectoryStep[];
}) {
  const last = steps.at(-1);
  const thoughts = steps.filter((step) =>
    ["thought", "observation", "idle"].includes(step.type)
  );
  return (
    <div className="dashboard-grid">
      <section className="panel hero-panel">
        <p className="eyebrow">CURRENT INNER LIFE</p>
        <blockquote>
          {thoughts.at(-1)?.content ?? "Their life is just beginning."}
        </blockquote>
        <p className="muted">
          {last
            ? `Last movement ${relative(last.createdAt)}`
            : "No trajectory yet"}
        </p>
      </section>
      <section className="panel metric-panel">
        <p className="eyebrow">MIND</p>
        <div className="metrics">
          <Metric label="trajectory steps" value={steps.length} />
          <Metric label="memories" value={memories.length} />
          <Metric label="active runs" value={runCount} />
          <Metric
            label="next wake"
            value={
              identity.nextWakeAt
                ? relative(identity.nextWakeAt)
                : identity.status
            }
          />
        </div>
      </section>
      <section className="panel wide">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RECENT STREAM</p>
            <h2>What has been moving</h2>
          </div>
          <Link href={`/i/${identity.id}?tab=timeline`}>View timeline</Link>
        </div>
        <StepList steps={steps.slice(-8)} />
      </section>
    </div>
  );
}

function Talk({
  identity,
  steps
}: {
  identity: NonNullable<Awaited<ReturnType<typeof getIdentity>>>;
  steps: readonly TrajectoryStep[];
}) {
  const messages = steps.filter((step) => step.type === "message");
  return (
    <section className="panel talk-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">SHARED CONVERSATION</p>
          <h1>Talk with {identity.name}</h1>
        </div>
        <p>Every person reaches the same mind.</p>
      </div>
      <div className="conversation">
        {messages.length ? (
          messages.map((step) => (
            <article
              className={
                step.recipient === identity.name ? "message human" : "message mind"
              }
              key={step.id}
            >
              <header>
                {step.sender ?? step.source}
                <time>{formatTime(step.createdAt)}</time>
              </header>
              <p>{step.content}</p>
            </article>
          ))
        ) : (
          <p className="empty">No one has spoken yet.</p>
        )}
      </div>
      <form
        action={sendMessageAction.bind(null, identity.id)}
        className="composer"
      >
        <input defaultValue="operator" name="sender" aria-label="Your name" />
        <textarea
          aria-label="Message"
          name="message"
          placeholder={`Message ${identity.name}…`}
          required
          rows={3}
        />
        <button className="primary" type="submit">
          Send
        </button>
      </form>
    </section>
  );
}

function Timeline({ steps }: { steps: readonly TrajectoryStep[] }) {
  return (
    <section className="panel">
      <p className="eyebrow">TRAJECTORY DAG</p>
      <h1>Timeline</h1>
      <StepList steps={steps} />
    </section>
  );
}

function Mindlog({ steps }: { steps: readonly TrajectoryStep[] }) {
  return (
    <section className="panel">
      <p className="eyebrow">APPEND-ONLY SOURCE OF TRUTH</p>
      <h1>Mind log</h1>
      <div className="raw-log">
        {steps.map((step) => (
          <pre key={step.id}>
            {JSON.stringify(
              {
                step_id: step.id,
                ts: step.createdAt.toISOString(),
                type: step.type,
                source: step.source,
                content: step.content,
                from: step.sender,
                to: step.recipient,
                reply_to: step.replyTo,
                resolves: step.resolves,
                ...step.fields
              },
              null,
              2
            )}
          </pre>
        ))}
      </div>
    </section>
  );
}

function Memories({
  identityId,
  memories
}: {
  identityId: string;
  memories: Awaited<ReturnType<typeof listMemories>>;
}) {
  return (
    <div className="split">
      <section className="panel">
        <p className="eyebrow">SEMANTIC MEMORY</p>
        <h1>Memories</h1>
        <div className="memory-list">
          {memories.map((memory) => (
            <article className="memory" key={memory.id}>
              <header>
                <span className="pill">{memory.type}</span>
                <small>{relative(memory.updatedAt)}</small>
              </header>
              <h3>{memory.summary}</h3>
              <p>{memory.body}</p>
              <form
                action={forgetMemoryAction.bind(
                  null,
                  identityId,
                  memory.id
                )}
              >
                <button className="danger">Forget</button>
              </form>
            </article>
          ))}
        </div>
      </section>
      <section className="panel sticky">
        <p className="eyebrow">ADD MEMORY</p>
        <form
          action={addMemoryAction.bind(null, identityId)}
          className="form-stack"
        >
          <label>
            Type
            <input defaultValue="fact" name="type" required />
          </label>
          <label>
            Summary
            <input name="summary" required />
          </label>
          <label>
            Body
            <textarea name="body" required rows={7} />
          </label>
          <button className="primary">Remember</button>
        </form>
      </section>
    </div>
  );
}

function Recap({ rollups }: { rollups: Awaited<ReturnType<typeof listRollups>> }) {
  return (
    <section className="panel">
      <p className="eyebrow">TIERED LIFE CONTEXT</p>
      <h1>Recap</h1>
      <p className="lede small">
        The whole life at progressively lower resolution. These are indexes
        into the raw mind log, never replacements for it.
      </p>
      <div className="recap-list">
        {rollups.length ? (
          rollups.map((rollup) => (
            <article key={rollup.id}>
              <header>
                <span className="pill">tier {rollup.tier}</span>
                <code>
                  {rollup.start_sequence}–{rollup.end_sequence}
                </code>
              </header>
              <p>{rollup.summary}</p>
              {rollup.themes?.length ? (
                <small>{rollup.themes.join(" · ")}</small>
              ) : null}
            </article>
          ))
        ) : (
          <p className="empty">
            The first rollup appears after ten narrative steps.
          </p>
        )}
      </div>
    </section>
  );
}

function Identity({
  identity
}: {
  identity: NonNullable<Awaited<ReturnType<typeof getIdentity>>>;
}) {
  return (
    <section className="panel">
      <p className="eyebrow">CORE IDENTITY</p>
      <h1>{identity.name}</h1>
      <form
        action={updateIdentityAction.bind(null, identity.id)}
        className="form-stack"
      >
        <label>
          Vibe
          <textarea defaultValue={identity.vibe} name="vibe" rows={2} />
        </label>
        <label>
          Quiet focus
          <textarea defaultValue={identity.focus} name="focus" rows={3} />
        </label>
        <label>
          Core identity prompt
          <textarea
            className="code-input"
            defaultValue={identity.corePrompt}
            name="corePrompt"
            rows={24}
          />
        </label>
        <button className="primary">Save identity</button>
      </form>
    </section>
  );
}

function Runtime({
  identity,
  runCount,
  steps
}: {
  identity: NonNullable<Awaited<ReturnType<typeof getIdentity>>>;
  runCount: number;
  steps: readonly TrajectoryStep[];
}) {
  return (
    <section className="panel">
      <p className="eyebrow">RUNTIME</p>
      <h1>Mind control</h1>
      <div className="metrics large">
        <Metric label="status" value={identity.status} />
        <Metric label="active runs" value={runCount} />
        <Metric label="backoff level" value={identity.backoffLevel} />
        <Metric label="ticks at level" value={identity.ticksAtLevel} />
        <Metric label="spontaneous wakes" value={identity.spontaneousWakes} />
        <Metric label="steps shown" value={steps.length} />
      </div>
      <p className="muted">
        The monolith continues in one durable Eve session so its sandbox
        survives across wakes. The trajectory remains the canonical mind log.
      </p>
    </section>
  );
}

function Metric({
  label,
  value
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function StepList({ steps }: { steps: readonly TrajectoryStep[] }) {
  return (
    <div className="step-list">
      {steps.map((step) => (
        <article className="step" data-type={step.type} key={step.id}>
          <div className="step-rail">
            <span />
          </div>
          <div>
            <header>
              <span className="pill">{step.type}</span>
              <strong>{step.source}</strong>
              <time>{formatTime(step.createdAt)}</time>
            </header>
            <p>{step.content}</p>
            <code>{step.id.slice(0, 8)}</code>
          </div>
        </article>
      ))}
    </div>
  );
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  }).format(date);
}

function relative(date: Date) {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

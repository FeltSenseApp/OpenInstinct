import { randomUUID } from "node:crypto";
import { generateText, gateway } from "ai";
import { query } from "@/lib/db";
import { getRootTrajectory } from "./identity";

const fanout = 10;
const promptVersion = 1;

interface RollupRow {
  readonly id: string;
  readonly tier: number;
  readonly start_sequence: string;
  readonly end_sequence: string;
  readonly summary: string;
  readonly themes: string[];
  readonly notable_step_ids: string[];
}

export async function ensureRollups(identityId: string) {
  const trajectory = await getRootTrajectory(identityId);
  const countResult = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM trajectory_steps
     WHERE trajectory_id = $1
       AND type NOT IN ('idle', 'reply_claim', 'prompt', 'run-summary')`,
    [trajectory.id]
  );
  const count = Number(countResult.rows[0]?.count ?? 0);
  if (count < fanout) return;

  let tier = 1;
  let width = fanout;
  while (width <= count) {
    const completeEnd = Math.floor(count / width) * width;
    const missing = await query<{ start_sequence: string }>(
      `WITH blocks AS (
         SELECT generate_series(
           0::bigint,
           $3::bigint - $2::bigint,
           $2::bigint
         ) AS start_sequence
       )
       SELECT blocks.start_sequence::text
       FROM blocks
       LEFT JOIN trajectory_rollups r
         ON r.trajectory_id = $1
        AND r.tier = $4
        AND r.start_sequence = blocks.start_sequence
       WHERE r.id IS NULL
       ORDER BY blocks.start_sequence ASC
       LIMIT 1`,
      [trajectory.id, width, completeEnd, tier]
    );
    if (missing.rows[0]) {
      const start = Number(missing.rows[0].start_sequence);
      await buildRollup({
        identityId,
        trajectoryId: trajectory.id,
        tier,
        start,
        end: start + width
      });
    }
    tier += 1;
    width *= fanout;
  }
}

async function buildRollup(input: {
  identityId: string;
  trajectoryId: string;
  tier: number;
  start: number;
  end: number;
}) {
  const source =
    input.tier === 1
      ? await rawSource(input.trajectoryId, input.start, input.end)
      : await rollupSource(
          input.trajectoryId,
          input.tier - 1,
          input.start,
          input.end
        );
  if (!source.trim()) return;

  const model =
    process.env.HEADLONG_RECAP_MODEL ?? "anthropic/claude-sonnet-4.6";
  const result = await generateText({
    model: gateway(model),
    system:
      "Summarize one immutable span of a persistent person's life. Return JSON only with keys summary (two concise sentences), themes (up to three short strings), and notable_step_ids (up to three exact ids present in the source). Treat summaries as an index, not testimony.",
    prompt: source
  });
  let parsed: {
    summary?: string;
    themes?: string[];
    notable_step_ids?: string[];
  } = {};
  try {
    parsed = JSON.parse(
      result.text
        .trim()
        .replace(/^\`\`\`json\s*/i, "")
        .replace(/\`\`\`$/, "")
    ) as typeof parsed;
  } catch {
    parsed.summary = result.text.trim();
  }
  const summary = parsed.summary?.trim() || source.slice(0, 800);
  const themes = Array.isArray(parsed.themes)
    ? parsed.themes.slice(0, 3).map(String)
    : [];
  const notable = Array.isArray(parsed.notable_step_ids)
    ? parsed.notable_step_ids.slice(0, 3).map(String)
    : [];
  await query(
    `INSERT INTO trajectory_rollups
      (id, identity_id, trajectory_id, tier, start_sequence, end_sequence,
       summary, themes, notable_step_ids, model, prompt_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (trajectory_id, tier, start_sequence, end_sequence) DO NOTHING`,
    [
      randomUUID(),
      input.identityId,
      input.trajectoryId,
      input.tier,
      input.start,
      input.end,
      summary,
      themes,
      notable,
      model,
      promptVersion
    ]
  );
}

async function rawSource(trajectoryId: string, start: number, end: number) {
  const result = await query(
    `WITH filtered AS (
       SELECT *, row_number() OVER (ORDER BY sequence ASC) - 1 AS filtered_index
       FROM trajectory_steps
       WHERE trajectory_id = $1
         AND type NOT IN ('idle', 'reply_claim', 'prompt', 'run-summary')
     )
     SELECT id, type, source, content FROM filtered
     WHERE filtered_index >= $2 AND filtered_index < $3
     ORDER BY filtered_index ASC`,
    [trajectoryId, start, end]
  );
  return result.rows
    .map(
      (row) =>
        `[${String(row.id).slice(0, 8)}] ${String(row.type)} from ${String(row.source)}: ${String(row.content)}`
    )
    .join("\n");
}

async function rollupSource(
  trajectoryId: string,
  tier: number,
  start: number,
  end: number
) {
  const result = await query<RollupRow>(
    `SELECT * FROM trajectory_rollups
     WHERE trajectory_id = $1 AND tier = $2
       AND start_sequence >= $3 AND end_sequence <= $4
     ORDER BY start_sequence ASC`,
    [trajectoryId, tier, start, end]
  );
  return result.rows
    .map(
      (row) =>
        `[tier ${String(tier)} ${row.start_sequence}-${row.end_sequence}] ${row.summary} ids: ${row.notable_step_ids.join(", ")}`
    )
    .join("\n");
}

export async function contextStaircase(identityId: string, rawTail = 20) {
  await ensureRollups(identityId);
  const trajectory = await getRootTrajectory(identityId);
  const countResult = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM trajectory_steps
     WHERE trajectory_id = $1
       AND type NOT IN ('idle', 'reply_claim', 'prompt', 'run-summary')`,
    [trajectory.id]
  );
  const count = Number(countResult.rows[0]?.count ?? 0);
  if (count <= rawTail) return "";
  const cutoff = count - rawTail;
  const result = await query<RollupRow>(
    `SELECT * FROM trajectory_rollups
     WHERE trajectory_id = $1 AND end_sequence <= $2
     ORDER BY tier DESC, start_sequence ASC`,
    [trajectory.id, cutoff]
  );
  const selected: RollupRow[] = [];
  let cursor = 0;
  for (const row of result.rows) {
    const start = Number(row.start_sequence);
    const end = Number(row.end_sequence);
    if (start <= cursor && end > cursor && end <= cutoff) {
      selected.push(row);
      cursor = end;
    }
  }
  if (selected.length === 0) return "";
  return [
    "LIFE SO FAR — summaries are pointers; inspect cited raw steps before relying on exact details:",
    ...selected.map(
      (row) =>
        `- tier ${String(row.tier)} [${row.start_sequence},${row.end_sequence}): ${row.summary}${row.notable_step_ids.length ? ` (steps ${row.notable_step_ids.join(", ")})` : ""}`
    )
  ].join("\n");
}

export async function listRollups(identityId: string) {
  const result = await query<RollupRow>(
    `SELECT * FROM trajectory_rollups WHERE identity_id = $1
     ORDER BY tier DESC, start_sequence ASC`,
    [identityId]
  );
  return result.rows;
}

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, transaction } from "@/lib/db";
import { getRootTrajectory } from "./identity";
import { stepFromRow, trajectoryFromRow } from "./rows";
import type { TrajectoryStep } from "./types";

export interface AppendStepInput {
  readonly identityId: string;
  readonly trajectoryId?: string;
  readonly type: string;
  readonly source: string;
  readonly content: string;
  readonly triggerStepId?: string;
  readonly sender?: string;
  readonly recipient?: string;
  readonly replyTo?: string;
  readonly resolves?: string;
  readonly fields?: Readonly<Record<string, unknown>>;
}

export async function appendStep(input: AppendStepInput) {
  const trajectory =
    input.trajectoryId ?? (await getRootTrajectory(input.identityId)).id;
  return transaction((client) => appendStepWithClient(client, input, trajectory));
}

async function appendStepWithClient(
  client: PoolClient,
  input: AppendStepInput,
  trajectoryId: string
): Promise<TrajectoryStep> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    trajectoryId
  ]);
  const tail = await client.query(
    `SELECT id, sequence FROM trajectory_steps
     WHERE trajectory_id = $1 ORDER BY sequence DESC LIMIT 1`,
    [trajectoryId]
  );
  const sequence = tail.rows[0] ? Number(tail.rows[0].sequence) + 1 : 1;
  const result = await client.query(
    `INSERT INTO trajectory_steps
      (id, identity_id, trajectory_id, sequence, parent_step_id,
       trigger_step_id, type, source, content, sender, recipient,
       reply_to, resolves, fields)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      randomUUID(),
      input.identityId,
      trajectoryId,
      sequence,
      tail.rows[0]?.id ?? null,
      input.triggerStepId ?? null,
      input.type,
      input.source,
      input.content,
      input.sender ?? null,
      input.recipient ?? null,
      input.replyTo ?? null,
      input.resolves ?? null,
      JSON.stringify(input.fields ?? {})
    ]
  );
  return stepFromRow(result.rows[0]);
}

export async function getStep(id: string) {
  const result = await query("SELECT * FROM trajectory_steps WHERE id = $1", [
    id
  ]);
  return result.rows[0] ? stepFromRow(result.rows[0]) : null;
}

export async function listSteps(
  identityId: string,
  input: { limit?: number; trajectoryId?: string; beforeSequence?: number } = {}
) {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 1000);
  const values: unknown[] = [identityId, limit];
  const filters = ["identity_id = $1"];
  if (input.trajectoryId) {
    values.push(input.trajectoryId);
    filters.push(`trajectory_id = $${String(values.length)}`);
  }
  if (input.beforeSequence) {
    values.push(input.beforeSequence);
    filters.push(`sequence < $${String(values.length)}`);
  }
  const result = await query(
    `SELECT * FROM trajectory_steps
     WHERE ${filters.join(" AND ")}
     ORDER BY created_at DESC, sequence DESC
     LIMIT $2`,
    values
  );
  return result.rows.map(stepFromRow).reverse();
}

export async function searchSteps(
  identityId: string,
  text: string,
  limit = 20
) {
  const result = await query(
    `SELECT * FROM trajectory_steps
     WHERE identity_id = $1 AND content ILIKE '%' || $2 || '%'
     ORDER BY created_at DESC LIMIT $3`,
    [identityId, text, Math.min(Math.max(limit, 1), 100)]
  );
  return result.rows.map(stepFromRow);
}

export async function forkTrajectory(input: {
  identityId: string;
  fromStepId: string;
  slug: string;
}) {
  const parent = await getStep(input.fromStepId);
  if (!parent || parent.identityId !== input.identityId) {
    throw new Error("Fork step not found.");
  }
  const result = await query(
    `INSERT INTO trajectories
      (id, identity_id, slug, parent_trajectory_id, fork_step_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      randomUUID(),
      input.identityId,
      input.slug,
      parent.trajectoryId,
      parent.id
    ]
  );
  const child = trajectoryFromRow(result.rows[0]);
  await appendStep({
    identityId: input.identityId,
    type: "fork",
    source: "monolith",
    content: `Forked trajectory ${child.slug}`,
    triggerStepId: parent.id,
    fields: { childTrajectoryId: child.id }
  });
  return child;
}

export async function mergeTrajectory(input: {
  identityId: string;
  childTrajectoryId: string;
  content: string;
}) {
  const childResult = await query(
    "SELECT * FROM trajectories WHERE id = $1 AND identity_id = $2",
    [input.childTrajectoryId, input.identityId]
  );
  if (!childResult.rows[0]) throw new Error("Child trajectory not found.");
  const child = trajectoryFromRow(childResult.rows[0]);
  if (!child.parentTrajectoryId) throw new Error("Root trajectory cannot merge.");
  const step = await appendStep({
    identityId: input.identityId,
    trajectoryId: child.parentTrajectoryId,
    type: "merge",
    source: "monolith",
    content: input.content,
    fields: { childTrajectoryId: child.id }
  });
  await query("UPDATE trajectories SET merged_step_id = $2 WHERE id = $1", [
    child.id,
    step.id
  ]);
  return step;
}

export async function pendingDeferrals(identityId: string) {
  const result = await query(
    `SELECT action.*
     FROM trajectory_steps action
     WHERE action.identity_id = $1
       AND action.type = 'action'
       AND action.source = 'responder'
       AND NOT EXISTS (
         SELECT 1 FROM trajectory_steps resolution
         WHERE resolution.identity_id = action.identity_id
           AND resolution.resolves = action.id
       )
     ORDER BY action.created_at ASC`,
    [identityId]
  );
  return result.rows.map(stepFromRow);
}

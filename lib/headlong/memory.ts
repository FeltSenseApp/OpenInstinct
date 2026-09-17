import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { memoryFromRow } from "./rows";

export async function listMemories(
  identityId: string,
  input: { type?: string; includeExpired?: boolean } = {}
) {
  const values: unknown[] = [identityId];
  const filters = ["identity_id = $1"];
  if (input.type) {
    values.push(input.type);
    filters.push(`type = $${String(values.length)}`);
  }
  if (!input.includeExpired) {
    filters.push("(expires_at IS NULL OR expires_at > now())");
  }
  const result = await query(
    `SELECT * FROM memories WHERE ${filters.join(" AND ")}
     ORDER BY updated_at DESC`,
    values
  );
  return result.rows.map(memoryFromRow);
}

export async function searchMemories(
  identityId: string,
  text: string,
  limit = 10
) {
  const terms = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2)
    .slice(0, 8);
  if (terms.length === 0) return [];
  const pattern = terms.join("|");
  const result = await query(
    `SELECT *,
       (SELECT count(*) FROM unnest(regexp_split_to_array(lower(summary || ' ' || body), '[^a-z0-9]+')) token
        WHERE token ~ $2) AS relevance
     FROM memories
     WHERE identity_id = $1
       AND (expires_at IS NULL OR expires_at > now())
       AND lower(summary || ' ' || body) ~ $2
     ORDER BY relevance DESC, updated_at DESC
     LIMIT $3`,
    [identityId, pattern, Math.min(Math.max(limit, 1), 50)]
  );
  return result.rows.map(memoryFromRow);
}

export async function addMemory(input: {
  identityId: string;
  type: string;
  summary: string;
  body: string;
  sourceTrajectoryId?: string;
  sourceStepIds?: readonly string[];
  parentMemoryId?: string;
  level?: number;
  expiresAt?: Date;
}) {
  const result = await query(
    `INSERT INTO memories
      (id, identity_id, type, summary, body, source_trajectory_id,
       source_step_ids, parent_memory_id, level, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      randomUUID(),
      input.identityId,
      input.type.trim(),
      input.summary.trim(),
      input.body.trim(),
      input.sourceTrajectoryId ?? null,
      input.sourceStepIds ?? [],
      input.parentMemoryId ?? null,
      input.level ?? 1,
      input.expiresAt ?? null
    ]
  );
  return memoryFromRow(result.rows[0]);
}

export async function editMemory(
  identityId: string,
  memoryId: string,
  input: {
    type?: string;
    summary?: string;
    body?: string;
    expiresAt?: Date | null;
  }
) {
  const currentResult = await query(
    "SELECT * FROM memories WHERE id = $1 AND identity_id = $2",
    [memoryId, identityId]
  );
  if (!currentResult.rows[0]) throw new Error("Memory not found.");
  const current = memoryFromRow(currentResult.rows[0]);
  const result = await query(
    `UPDATE memories SET type = $3, summary = $4, body = $5,
       expires_at = $6, updated_at = now()
     WHERE id = $1 AND identity_id = $2 RETURNING *`,
    [
      memoryId,
      identityId,
      input.type?.trim() || current.type,
      input.summary?.trim() || current.summary,
      input.body?.trim() || current.body,
      input.expiresAt === undefined ? current.expiresAt : input.expiresAt
    ]
  );
  return memoryFromRow(result.rows[0]);
}

export async function forgetMemory(identityId: string, memoryId: string) {
  const result = await query(
    "DELETE FROM memories WHERE id = $1 AND identity_id = $2 RETURNING id",
    [memoryId, identityId]
  );
  return result.rowCount === 1;
}

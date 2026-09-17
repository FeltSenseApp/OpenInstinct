import type {
  Identity,
  Memory,
  Trajectory,
  TrajectoryStep
} from "./types";

export function identityFromRow(row: Record<string, unknown>): Identity {
  return {
    id: String(row.id),
    name: String(row.name),
    vibe: String(row.vibe),
    focus: String(row.focus),
    operatorName: row.operator_name ? String(row.operator_name) : null,
    operatorNote: row.operator_note ? String(row.operator_note) : null,
    corePrompt: String(row.core_prompt),
    status: row.status as Identity["status"],
    retrievalEnabled: Boolean(row.retrieval_enabled),
    backoffLevel: Number(row.backoff_level),
    ticksAtLevel: Number(row.ticks_at_level),
    spontaneousWakes: Number(row.spontaneous_wakes),
    goalReviewAt: row.goal_review_at
      ? new Date(String(row.goal_review_at))
      : null,
    nextWakeAt: row.next_wake_at ? new Date(String(row.next_wake_at)) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at))
  };
}

export function trajectoryFromRow(row: Record<string, unknown>): Trajectory {
  return {
    id: String(row.id),
    identityId: String(row.identity_id),
    slug: String(row.slug),
    parentTrajectoryId: row.parent_trajectory_id
      ? String(row.parent_trajectory_id)
      : null,
    forkStepId: row.fork_step_id ? String(row.fork_step_id) : null,
    mergedStepId: row.merged_step_id ? String(row.merged_step_id) : null,
    createdAt: new Date(String(row.created_at))
  };
}

export function stepFromRow(row: Record<string, unknown>): TrajectoryStep {
  return {
    id: String(row.id),
    identityId: String(row.identity_id),
    trajectoryId: String(row.trajectory_id),
    sequence: Number(row.sequence),
    parentStepId: row.parent_step_id ? String(row.parent_step_id) : null,
    triggerStepId: row.trigger_step_id ? String(row.trigger_step_id) : null,
    type: String(row.type),
    source: String(row.source),
    content: String(row.content),
    sender: row.sender ? String(row.sender) : null,
    recipient: row.recipient ? String(row.recipient) : null,
    replyTo: row.reply_to ? String(row.reply_to) : null,
    resolves: row.resolves ? String(row.resolves) : null,
    fields:
      row.fields && typeof row.fields === "object"
        ? (row.fields as Record<string, unknown>)
        : {},
    createdAt: new Date(String(row.created_at))
  };
}

export function memoryFromRow(row: Record<string, unknown>): Memory {
  return {
    id: String(row.id),
    identityId: String(row.identity_id),
    type: String(row.type),
    summary: String(row.summary),
    body: String(row.body),
    sourceTrajectoryId: row.source_trajectory_id
      ? String(row.source_trajectory_id)
      : null,
    sourceStepIds: Array.isArray(row.source_step_ids)
      ? row.source_step_ids.map(String)
      : [],
    parentMemoryId: row.parent_memory_id
      ? String(row.parent_memory_id)
      : null,
    level: Number(row.level),
    expiresAt: row.expires_at ? new Date(String(row.expires_at)) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at))
  };
}

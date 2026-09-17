import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const headlongMinds = pgTable(
  "headlong_minds",
  {
    workspaceId: text("workspace_id").primaryKey(),
    name: text("name").default("ada").notNull(),
    vibe: text("vibe").default("curious, warm, and plainspoken").notNull(),
    focus: text("focus")
      .default(
        "learning how their own mind works, and getting to know the people and environment they live with"
      )
      .notNull(),
    operatorName: text("operator_name"),
    operatorNote: text("operator_note"),
    identity: text("identity").notNull(),
    status: text("status", { enum: ["active", "paused"] })
      .default("active")
      .notNull(),
    backoffSeconds: integer("backoff_seconds").default(0).notNull(),
    backoffLevel: integer("backoff_level").default(0).notNull(),
    ticksAtLevel: integer("ticks_at_level").default(0).notNull(),
    spontaneousWakes: integer("spontaneous_wakes").default(0).notNull(),
    goalReviewAt: timestamp("goal_review_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }),
    retrievalEnabled: boolean("retrieval_enabled").default(false).notNull(),
    nextWakeAt: timestamp("next_wake_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "headlong_minds_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    check(
      "headlong_minds_backoff_check",
      sql`${table.backoffSeconds} BETWEEN 0 AND 300`
    ),
  ]
);

export const headlongEvents = pgTable(
  "headlong_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    parentId: text("parent_id"),
    type: text("type", {
      enum: [
        "message",
        "observation",
        "action",
        "thought",
        "reply_claim",
        "monolith-wake",
        "share",
        "think",
        "learn",
        "recall",
        "goals",
        "values",
        "idle",
        "merge",
        "error",
      ],
    }).notNull(),
    thinker: text("thinker", {
      enum: [
        "human",
        "responder",
        "monolith",
        "retrieval",
        "subagent",
        "system",
      ],
    }).notNull(),
    direction: text("direction", {
      enum: ["inbound", "internal", "outbound"],
    })
      .default("internal")
      .notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata")
      .$type<{
        decision?: "replied" | "deferred" | "no-reply" | "reply-failed";
        delaySeconds?: number;
        function?: string;
        person?: string;
        request?: string;
        retrievedMemoryId?: string;
        resolves?: string;
        runId?: string;
      }>()
      .default({}),
    authorUserId: text("author_user_id"),
    runId: text("run_id"),
    eveSessionId: text("eve_session_id"),
    createdAt: timestamp("created_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "headlong_events_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    index("headlong_events_trajectory_idx").on(
      table.workspaceId,
      table.createdAt.desc()
    ),
    index("headlong_events_run_idx").on(table.runId),
  ]
);

export const headlongMemories = pgTable(
  "headlong_memories",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      name: "headlong_memories_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    index("headlong_memories_lookup_idx").on(
      table.workspaceId,
      table.kind,
      table.updatedAt.desc()
    ),
  ]
);

export const headlongRuns = pgTable(
  "headlong_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    triggerEventId: text("trigger_event_id").notNull(),
    thinker: text("thinker", { enum: ["responder", "monolith"] }).notNull(),
    status: text("status", {
      enum: ["dispatching", "running", "completed", "failed"],
    })
      .default("dispatching")
      .notNull(),
    eveSessionId: text("eve_session_id"),
    error: text("error"),
    startedAt: timestamp("started_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }),
  },
  (table) => [
    foreignKey({
      name: "headlong_runs_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    uniqueIndex("headlong_runs_trigger_thinker_key").on(
      table.workspaceId,
      table.triggerEventId,
      table.thinker
    ),
    index("headlong_runs_workspace_idx").on(
      table.workspaceId,
      table.startedAt.desc()
    ),
  ]
);

export const headlongMindsRelations = relations(
  headlongMinds,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [headlongMinds.workspaceId],
      references: [workspaces.id],
    }),
    events: many(headlongEvents),
    memories: many(headlongMemories),
    runs: many(headlongRuns),
  })
);

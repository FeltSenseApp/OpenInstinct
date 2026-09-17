CREATE TABLE IF NOT EXISTS identities (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  vibe text NOT NULL,
  focus text NOT NULL,
  operator_name text,
  operator_note text,
  core_prompt text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  retrieval_enabled boolean NOT NULL DEFAULT false,
  backoff_level integer NOT NULL DEFAULT 0,
  ticks_at_level integer NOT NULL DEFAULT 0,
  spontaneous_wakes integer NOT NULL DEFAULT 0,
  goal_review_at timestamptz,
  next_wake_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trajectories (
  id text PRIMARY KEY,
  identity_id text NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  slug text NOT NULL,
  parent_trajectory_id text REFERENCES trajectories(id) ON DELETE CASCADE,
  fork_step_id text,
  merged_step_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(identity_id, slug)
);

CREATE TABLE IF NOT EXISTS trajectory_steps (
  id text PRIMARY KEY,
  identity_id text NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  trajectory_id text NOT NULL REFERENCES trajectories(id) ON DELETE CASCADE,
  sequence bigint NOT NULL,
  parent_step_id text,
  trigger_step_id text,
  type text NOT NULL,
  source text NOT NULL,
  content text NOT NULL,
  sender text,
  recipient text,
  reply_to text,
  resolves text,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trajectory_id, sequence)
);

CREATE INDEX IF NOT EXISTS trajectory_steps_identity_sequence_idx
  ON trajectory_steps(identity_id, sequence DESC);
CREATE INDEX IF NOT EXISTS trajectory_steps_trigger_idx
  ON trajectory_steps(trigger_step_id);
CREATE INDEX IF NOT EXISTS trajectory_steps_reply_idx
  ON trajectory_steps(reply_to);

CREATE TABLE IF NOT EXISTS memories (
  id text PRIMARY KEY,
  identity_id text NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  type text NOT NULL,
  summary text NOT NULL,
  body text NOT NULL,
  source_trajectory_id text REFERENCES trajectories(id) ON DELETE SET NULL,
  source_step_ids text[] NOT NULL DEFAULT '{}',
  parent_memory_id text REFERENCES memories(id) ON DELETE SET NULL,
  level integer NOT NULL DEFAULT 1,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memories_identity_type_idx
  ON memories(identity_id, type, updated_at DESC);

CREATE TABLE IF NOT EXISTS thinker_runs (
  id text PRIMARY KEY,
  identity_id text NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  thinker text NOT NULL CHECK (thinker IN ('responder', 'monolith', 'recap')),
  trigger_step_id text NOT NULL,
  eve_session_id text,
  status text NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'running', 'completed', 'failed')),
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(identity_id, thinker, trigger_step_id)
);

CREATE TABLE IF NOT EXISTS trajectory_rollups (
  id text PRIMARY KEY,
  identity_id text NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  trajectory_id text NOT NULL REFERENCES trajectories(id) ON DELETE CASCADE,
  tier integer NOT NULL,
  start_sequence bigint NOT NULL,
  end_sequence bigint NOT NULL,
  summary text NOT NULL,
  themes text[] NOT NULL DEFAULT '{}',
  notable_step_ids text[] NOT NULL DEFAULT '{}',
  model text NOT NULL,
  prompt_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trajectory_id, tier, start_sequence, end_sequence)
);

CREATE TABLE IF NOT EXISTS identity_files (
  identity_id text NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  path text NOT NULL,
  content bytea NOT NULL,
  executable boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(identity_id, path)
);

CREATE TABLE IF NOT EXISTS runtime_events (
  id text PRIMARY KEY,
  identity_id text REFERENCES identities(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  type text NOT NULL,
  data jsonb,
  emitted_at timestamptz NOT NULL
);

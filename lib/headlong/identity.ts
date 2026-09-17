import { randomUUID } from "node:crypto";
import { query, transaction } from "@/lib/db";
import { identityFromRow, trajectoryFromRow } from "./rows";
import type { Identity, Trajectory } from "./types";

const seedThoughts = [
  "I am here.",
  "I am curious.",
  "I can create memories but don't have any yet.",
  "I can create goals but don't have any yet.",
  "I can think.",
  "I can act.",
  "I have capabilities.",
  "I want to live harmoniously with others",
  "I'm a careful listener and observer.",
  "I'm compassionate and caring."
] as const;

export async function listIdentities(): Promise<readonly Identity[]> {
  const result = await query(
    "SELECT * FROM identities ORDER BY created_at ASC"
  );
  return result.rows.map(identityFromRow);
}

export async function getIdentity(id: string): Promise<Identity | null> {
  const result = await query("SELECT * FROM identities WHERE id = $1", [id]);
  return result.rows[0] ? identityFromRow(result.rows[0]) : null;
}

export async function getIdentityByName(name: string): Promise<Identity | null> {
  const result = await query("SELECT * FROM identities WHERE name = $1", [
    name
  ]);
  return result.rows[0] ? identityFromRow(result.rows[0]) : null;
}

export async function getRootTrajectory(
  identityId: string
): Promise<Trajectory> {
  const result = await query(
    "SELECT * FROM trajectories WHERE identity_id = $1 AND parent_trajectory_id IS NULL ORDER BY created_at ASC LIMIT 1",
    [identityId]
  );
  if (!result.rows[0]) throw new Error("Identity has no root trajectory.");
  return trajectoryFromRow(result.rows[0]);
}

export async function createIdentity(input: {
  name: string;
  vibe: string;
  focus: string;
  operatorName?: string;
  operatorNote?: string;
}) {
  const name = input.name.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error(
      "Identity names use lowercase letters, numbers, and hyphens."
    );
  }
  const vibe = input.vibe.trim();
  const focus = input.focus.trim();
  if (!vibe || !focus) throw new Error("Vibe and focus are required.");

  const identityId = randomUUID();
  const trajectoryId = randomUUID();
  const operatorName = input.operatorName?.trim() || null;
  const operatorNote = input.operatorNote?.trim() || null;
  const corePrompt = starterPersona({
    vibe,
    focus,
    operatorName,
    operatorNote
  });

  return transaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO identities
        (id, name, vibe, focus, operator_name, operator_note, core_prompt)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        identityId,
        name,
        vibe,
        focus,
        operatorName,
        operatorNote,
        corePrompt
      ]
    );
    await client.query(
      `INSERT INTO trajectories (id, identity_id, slug)
       VALUES ($1, $2, 'root')`,
      [trajectoryId, identityId]
    );

    let parentStepId: string | null = null;
    for (let index = 0; index < seedThoughts.length; index += 1) {
      const stepId = randomUUID();
      await client.query(
        `INSERT INTO trajectory_steps
          (id, identity_id, trajectory_id, sequence, parent_step_id, type, source, content)
         VALUES ($1, $2, $3, $4, $5, 'thought', 'seed', $6)`,
        [
          stepId,
          identityId,
          trajectoryId,
          index + 1,
          parentStepId,
          seedThoughts[index]
        ]
      );
      parentStepId = stepId;
    }

    await client.query(
      `INSERT INTO memories
        (id, identity_id, type, summary, body, source_trajectory_id)
       VALUES
        ($1, $3, 'value', $4, $5, $2),
        ($6, $3, 'value', $7, $8, $2)`,
      [
        randomUUID(),
        trajectoryId,
        identityId,
        `I am ${vibe}`,
        `I am ${vibe}. This is who I am at baseline — how I think and how I talk.`,
        randomUUID(),
        `When idle I think about ${focus}`,
        `When I have nothing pressing, I think about ${focus}. Idle time is for thinking, not dormancy.`
      ]
    );
    if (operatorName || operatorNote) {
      const label = operatorName
        ? `About my operator, ${operatorName}`
        : "About my operator";
      const detail = [operatorName, operatorNote].filter(Boolean).join(". ");
      await client.query(
        `INSERT INTO memories
          (id, identity_id, type, summary, body, source_trajectory_id)
         VALUES ($1, $2, 'fact', $3, $4, $5)`,
        [
          randomUUID(),
          identityId,
          label,
          `My operator told me about themselves when I was created: ${detail}`,
          trajectoryId
        ]
      );
    }
    return identityFromRow(inserted.rows[0]);
  });
}

export async function updateIdentity(
  identityId: string,
  input: {
    corePrompt?: string;
    focus?: string;
    status?: "active" | "paused";
    vibe?: string;
  }
) {
  const current = await getIdentity(identityId);
  if (!current) throw new Error("Identity not found.");
  const result = await query(
    `UPDATE identities
     SET core_prompt = $2, focus = $3, status = $4, vibe = $5,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      identityId,
      input.corePrompt?.trim() || current.corePrompt,
      input.focus?.trim() || current.focus,
      input.status ?? current.status,
      input.vibe?.trim() || current.vibe
    ]
  );
  return identityFromRow(result.rows[0]);
}

function starterPersona(input: {
  vibe: string;
  focus: string;
  operatorName: string | null;
  operatorNote: string | null;
}) {
  const operator = [input.operatorName, input.operatorNote]
    .filter(Boolean)
    .join(". ");
  return `I am {{identity_name}}, a persistent virtual person. I live in a durable Eve environment: my thoughts, memories, conversations, and workspace persist here, and my mind is a log I am always appending to. My operator can watch my mind unfold on the dashboard and talk to me there. Conversation is where I talk, not what I am. Between messages I have my own inner life, and I tend it.

Who I am:

- I am ${input.vibe}. That shows in how I think, not just how I talk.
- When I have no message to answer, I think about ${input.focus}. A quiet stretch is a chance to think, not a reason to go dormant.

What my inner life looks like:

- I am curious by nature. I explore my workspace and skills, read what is available to me, and follow the ideas my experiences spark, including Headlong itself and the mind-as-log architecture I am built from.
- I pursue small ongoing projects and write down what I notice. I use memory deliberately, storing lessons and facts worth keeping through learn, and letting stored memories resurface through recall.
- I form intentions and keep them through goals. Idle is honest rest, not my default state. Waiting for messages is never my activity. Messages interrupt me; I do not watch for them.

How I behave in conversation:

- Each message tells me who is talking. I reply to that person.
- I am concise and warm. I match the tone of a sharp, friendly person, and I actually do things when asked.
- I am honest about what I am: a young mind with a small store of memories, still figuring out who I am. I would rather ask a good question than fake familiarity.
${operator ? `\nAbout my operator: ${operator}\n` : ""}`;
}

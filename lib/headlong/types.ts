export type IdentityStatus = "active" | "paused";
export type Thinker = "responder" | "monolith" | "recap";
export type MonolithFunction =
  | "act"
  | "share"
  | "think"
  | "learn"
  | "recall"
  | "goals"
  | "values"
  | "idle";

export interface Identity {
  readonly id: string;
  readonly name: string;
  readonly vibe: string;
  readonly focus: string;
  readonly operatorName: string | null;
  readonly operatorNote: string | null;
  readonly corePrompt: string;
  readonly status: IdentityStatus;
  readonly retrievalEnabled: boolean;
  readonly backoffLevel: number;
  readonly ticksAtLevel: number;
  readonly spontaneousWakes: number;
  readonly goalReviewAt: Date | null;
  readonly nextWakeAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Trajectory {
  readonly id: string;
  readonly identityId: string;
  readonly slug: string;
  readonly parentTrajectoryId: string | null;
  readonly forkStepId: string | null;
  readonly mergedStepId: string | null;
  readonly createdAt: Date;
}

export interface TrajectoryStep {
  readonly id: string;
  readonly identityId: string;
  readonly trajectoryId: string;
  readonly sequence: number;
  readonly parentStepId: string | null;
  readonly triggerStepId: string | null;
  readonly type: string;
  readonly source: string;
  readonly content: string;
  readonly sender: string | null;
  readonly recipient: string | null;
  readonly replyTo: string | null;
  readonly resolves: string | null;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
}

export interface Memory {
  readonly id: string;
  readonly identityId: string;
  readonly type: string;
  readonly summary: string;
  readonly body: string;
  readonly sourceTrajectoryId: string | null;
  readonly sourceStepIds: readonly string[];
  readonly parentMemoryId: string | null;
  readonly level: number;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

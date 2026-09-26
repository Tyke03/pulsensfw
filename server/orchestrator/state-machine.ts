/**
 * state-machine.ts — explicit, validated, idempotent work-item state transitions.
 * Every transition records {from, to, actor, runId, reason, at} in the item's
 * transition history; illegal transitions throw; re-applying the same
 * (from,to,runId) pair is a no-op.
 */
export const STATES = [
  'discovered', 'research_validated', 'research_completed', 'research_rejected', 'ready_to_write', 'claimed', 'in_progress',
  'draft_proposed', 'draft_persisted', 'visual_pending', 'needs_visual', 'visual_ready',
  'end_rail_pending', 'end_rail_validated', 'qc_pending', 'qc_pass', 'qc_hold', 'qc_reject',
  'publish_eligible', 'published', 'audit_pending', 'audit_completed',
  'retryable_failure', 'terminal_failure', 'human_review', 'paused',
] as const;

export type State = (typeof STATES)[number];

export type Transition = { from: State; to: State; actor: string; runId?: number; reason?: string; at?: string };

export const VALID_TRANSITIONS: Record<State, State[]> = {
  discovered: ['research_validated', 'research_rejected', 'human_review', 'claimed', 'retryable_failure', 'terminal_failure'],
  research_validated: ['ready_to_write', 'research_completed'],
  ready_to_write: ['claimed'],
  claimed: ['in_progress', 'retryable_failure'],
  in_progress: ['draft_proposed', 'research_validated', 'qc_pending', 'end_rail_pending', 'audit_completed', 'retryable_failure', 'terminal_failure', 'human_review'],
  draft_proposed: ['draft_persisted', 'retryable_failure', 'terminal_failure', 'human_review'],
  draft_persisted: ['visual_pending', 'retryable_failure'],
  visual_pending: ['visual_ready', 'needs_visual', 'retryable_failure', 'terminal_failure'],
  needs_visual: ['visual_pending', 'human_review'],
  visual_ready: ['end_rail_pending'],
  end_rail_pending: ['end_rail_validated', 'retryable_failure', 'claimed'],
  end_rail_validated: ['qc_pending'],
  qc_pending: ['qc_pass', 'qc_hold', 'qc_reject', 'claimed'],
  qc_pass: ['publish_eligible', 'qc_hold', 'retryable_failure', 'terminal_failure', 'human_review'], // publish_eligible only if all deterministic gates pass
  qc_hold: ['qc_pending', 'human_review', 'retryable_failure', 'terminal_failure'],
  qc_reject: ['human_review', 'terminal_failure', 'retryable_failure'],
  publish_eligible: ['published', 'retryable_failure', 'terminal_failure', 'human_review'],
  published: ['audit_pending', 'retryable_failure'],
  audit_pending: ['audit_completed', 'retryable_failure'],
  audit_completed: [],
  research_rejected: [],
  retryable_failure: ['ready_to_write', 'claimed', 'in_progress', 'draft_proposed', 'terminal_failure', 'human_review'],
  terminal_failure: [],
  human_review: ['ready_to_write', 'terminal_failure'],
  paused: ['ready_to_write', 'claimed'],
} as unknown as Record<State, State[]>;

export class IllegalTransitionError extends Error {
  constructor(public from: State, public to: State) {
    super(`Illegal state transition: ${from} → ${to}`);
  }
}

export function canTransition(from: State, to: State): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

/** Apply a transition to a work item (pure helper; persistence is orchestrator's job). */
export function applyTransition(
  item: { state: string; transitionHistory?: unknown[] },
  t: Transition,
): { state: State; transitionHistory: unknown[] } {
  const from = item.state as State;
  // Idempotent no-op: re-application of an already-applied transition (same from→to)
  // returns unchanged state/history without error.
  if (t.to === from) return { state: from, transitionHistory: Array.isArray(item.transitionHistory) ? [...item.transitionHistory] : [] };
  if (!canTransition(from, t.to)) throw new IllegalTransitionError(from, t.to);
  const history = Array.isArray(item.transitionHistory) ? [...item.transitionHistory] : [];
  const record = { from, to: t.to, actor: t.actor, runId: t.runId ?? null, reason: t.reason ?? null, at: t.at ?? new Date().toISOString() };
  const dup = history.some(
    (h: any) => h && h.from === from && h.to === t.to && (t.runId == null || h.runId === t.runId) && !t.reason,
  );
  if (dup) return { state: from as State, transitionHistory: history }; // idempotent no-op
  history.push(record);
  return { state: t.to, transitionHistory: history };
}

export function isTerminal(state: State): boolean {
  return state === 'terminal_failure' || state === 'audit_completed' || state === 'research_rejected' || state === 'research_completed';
}

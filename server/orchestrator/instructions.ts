/**
 * instructions.ts — central operator-command pickup from agent_instructions.
 * The orchestrator is the ONLY consumer of this table in the new architecture;
 * prompt agents never see operator instructions.
 */
import { db } from '../db';
import { agentInstructions } from '@shared/schema';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';

export type OperatorInstruction = typeof agentInstructions.$inferSelect;

export type InstructionEffect = {
  globalHalt: boolean;
  applied: OperatorInstruction[];
  haltedBy: number | null;
};

const HALT_RE = /(pause|halt|stop)\s+(all|everything|the pipeline)|emergency\s*stop/i;

export async function loadActiveInstructions(targets: string[]): Promise<OperatorInstruction[]> {
  if (targets.length === 0) return [];
  return db
    .select()
    .from(agentInstructions)
    .where(and(eq(agentInstructions.active, true), or(inArray(agentInstructions.target, targets), eq(agentInstructions.target, 'all'))))
    .orderBy(asc(agentInstructions.createdAt));
}

/**
 * Evaluate instructions; returns halt status + the rows the orchestrator applies.
 * The orchestrator is the single central enforcement point: it picks up every
 * active instruction addressed to 'all' or to any agent role (legacy agents
 * never read this table in the new architecture).
 */
export function evaluateInstructions(rows: OperatorInstruction[], _selfTarget: string): InstructionEffect {
  let globalHalt = false;
  let haltedBy: number | null = null;
  const applied: OperatorInstruction[] = [];
  for (const row of rows) {
    if (row.target === 'all' && row.persist && HALT_RE.test(row.instruction)) {
      globalHalt = true;
      haltedBy = row.id;
    }
    applied.push(row);
  }
  return { globalHalt, applied, haltedBy };
}

/** Record consumption: append {agent, seen_at} to consumed_by; deactivate one-shots. */
export async function markConsumed(row: OperatorInstruction, agent: string): Promise<void> {
  const consumed = Array.isArray(row.consumedBy) ? [...row.consumedBy] : [];
  consumed.push({ agent, seen_at: new Date().toISOString() });
  const update: Record<string, unknown> = { consumedBy: consumed };
  if (!row.persist) update.active = false;
  await db.update(agentInstructions).set(update).where(eq(agentInstructions.id, row.id));
}

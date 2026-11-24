/**
 * Local-PC resilience utilities for scheduled content-team scripts.
 *
 * - `writeJsonAtomic(filePath, data)` writes to a sibling temp file and renames
 *   atomically so a mid-write Windows Update reboot or power loss never leaves
 *   half-written `registry.json`, `rotation.json`, or `budget.json` files.
 * - `readJsonSafe(filePath, fallback)` recovers cleanly if a file doesn't exist yet.
 * - `isSlotOverdue(lastRunIso, expectedIntervalMs, now)` lets a catch-up dispatcher
 *   detect missed scheduled runs after a reboot.
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function writeJsonAtomic(filePath, data) {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  try {
    await writeFile(tmpPath, payload, 'utf8');
    await rename(tmpPath, filePath);
  } catch (error) {
    try {
      await unlink(tmpPath);
    } catch {
      /* ignore cleanup errors */
    }
    throw error;
  }
}

export async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function isSlotOverdue(lastRunIso, expectedIntervalMs, now = new Date()) {
  if (!lastRunIso) return true;
  const last = new Date(lastRunIso).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= expectedIntervalMs;
}

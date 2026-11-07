/**
 * Concierge endpoint (round 2F): one POST per turn, Server-Sent-Events
 * response, compatible with the Persona widget's pluggable SSE parser.
 *
 * Event frames (data: <json>):
 *   {"type":"status", stage:"thinking"|"tool", label:string}
 *   {"type":"tool", tool:string, summary:string, citations?:Citation[]}
 *   {"type":"citations", citations:Citation[]}
 *   {"type":"final", text:string, citations:Citation[], model:string}
 *   {"type":"error", error:string, human:string}  — unconfigured / quota / busy
 *
 * Honest states: no model credentials, exhausted session quota, the global
 * cost cap, or the concurrency cap all return terminal "error" frames the UI
 * renders as clearly labeled unavailable states. Nothing improvises.
 */
import type { APIRoute } from 'astro';
import { conciergeGate, runTurn } from '../../lib/concierge/service';
import { sharedTracker } from '../../lib/models/usage';
import { readReader } from '../../lib/reader/cookies';
import { fingerprintOf } from '../../lib/agent/canonical';
import { isSameOrigin } from '../../lib/http/same-origin';

export const prerender = false;

function env(key: string): string {
  return ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[key] ?? '').trim();
}

function num(key: string, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(env(key), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

const MAX_MESSAGES = 12;

function sseFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const secure = new URL(request.url).protocol === 'https:';
  const gate = conciergeGate(cookies, secure);
  const readerReal = readReader(cookies, secure);

  const body = (await request.json().catch(() => null)) as { messages?: Array<{ role: 'user' | 'assistant'; content: string }>; prompt?: string } | null;
  const prompt = (body?.prompt ?? '').trim();
  const history = (body?.messages ?? []).slice(0, MAX_MESSAGES).map((message) => ({ role: message.role, content: message.content.slice(0, 4000) }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (frame: unknown) => controller.enqueue(encoder.encode(sseFrame(frame)));
      try {
        if (gate.status === 'unconfigured') {
          push({ type: 'error', error: 'unconfigured', human: 'The Concierge is not configured on this deployment (no model credentials). Set MODELS_* env to enable it — nothing is faked meanwhile.' });
          controller.close();
          return;
        }
        const sessionSource = cookies.get('pulse_seed')?.value ?? 'anon';
        const sessionHash = await fingerprintOf(sessionSource);
        const turns = sharedTracker.turnLimitState(sessionHash);
        if (!turns.allowed) {
          push({ type: 'error', error: 'quota-session', human: `Daily session limit reached (${turns.used}/${turns.cap} turns). Try again tomorrow.` });
          controller.close();
          return;
        }
        const cost = sharedTracker.costCapState(0);
        if (cost.capped) {
          push({ type: 'error', error: 'quota-cost', human: 'The desk paused its model spend for today (global cost cap). Real answers resume when the budget resets.' });
          controller.close();
          return;
        }
        if (!sharedTracker.concurrencySlot()) {
          push({ type: 'error', error: 'busy', human: 'All Concierge lanes are busy right now — try again in a moment.' });
          sharedTracker.releaseSlot();
          controller.close();
          return;
        }
        sharedTracker.releaseSlot();
        const gateOk = gate.status === 'ok' ? gate : null;
        if (!gateOk) {
          push({ type: 'error', error: 'unconfigured', human: 'The Concierge is not configured on this deployment.' });
          controller.close();
          return;
        }
        push({ type: 'status', stage: 'thinking', label: gateOk.modelPlan === 'dev-fixture' ? 'Dev fixture (no live model configured)' : 'Thinking' });

        const result = await runTurn({
          history,
          prompt,
          reader: { ...readerReal, nsfw: gateOk.nsfwAllowed },
          sessionHash,
          maxAttempts: num('CONCIERGE_MAX_ATTEMPTS', 3, 1, 4),
          timeoutMs: Math.min(90_000, Math.max(5_000, num('CONCIERGE_TIMEOUT_MS', 45_000, 5000, 90_000))),
          tokenCeiling: Math.min(2000, Math.max(200, num('CONCIERGE_TOKEN_CEILING', 1200, 200, 2000))),
          tracker: sharedTracker,
        });
        if (result.status !== 'ok') {
          const human = result.reason === 'unconfigured'
            ? 'No model tiers are configured (MODELS_* env). The Concierge answers nothing until they exist.'
            : result.reason === 'policy-locked'
              ? 'Every tier declined this prompt on policy grounds. Nothing was answered.'
              : result.reason === 'budget'
                ? 'Quota or cost cap hit. Try later.'
                : 'Model tiers did not answer in time (network outage). Try again.';
          push({ type: 'error', error: result.reason, human });
          controller.close();
          return;
        }
        push({ type: 'citations', citations: result.citations });
        push({ type: 'final', text: result.text, citations: result.citations, model: result.model });
        controller.close();
      } catch (error) {
        push({ type: 'error', error: 'internal', human: (error as Error).message ?? 'The Concierge hit an unexpected error.' });
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    },
  });
};

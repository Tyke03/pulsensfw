import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRefusal, ladderConfig, runChatWith, type ChatMessage } from '../models/ladder';

const messages: ChatMessage[] = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'Compare the big sites for me.' },
];

const ENV: Record<string, string> = {
  MODELS_MAIN_API_URL: 'https://main.test/v1',
  MODELS_MAIN_API_KEY: 'main-key',
  MODELS_MAIN_IDS: 'strong-1,weak-2',
  MODELS_FALLBACK_API_URL: 'https://venice.test/v1',
  MODELS_FALLBACK_API_KEY: 'fb-key',
  MODELS_FALLBACK_IDS: 'venice-fallback',
};

type Call = { url: string; model: string };

interface Step {
  status?: number;
  json?: unknown;
  reject?: 'network';
}

function script(steps: Array<(call: Call) => Step | null>, calls: Call[]): typeof fetch {
  let index = -1;
  return (async (input: string | URL | Request, init?: RequestInit) => {
    index += 1;
    const body = JSON.parse(String(init?.body ?? '{}')) as { model: string };
    const call: Call = { url: String(input), model: body.model };
    calls.push(call);
    const step = steps[Math.min(index, steps.length - 1)]?.(call);
    if (step?.reject === 'network') throw new TypeError('fetch failed');
    return new Response(step?.json !== undefined ? JSON.stringify(step.json) : '', {
      status: step?.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function ok(json: unknown): Step {
  return { json };
}

describe('model ladder — configuration', () => {
  it('reports no tiers without env (never invents models)', () => {
    const config = ladderConfig({});
    assert.equal(config.tiers.length, 0);
  });

  it('orders main tiers (best first) before the Venice fallback', () => {
    const config = ladderConfig(ENV);
    assert.deepEqual(
      config.tiers.map((tier) => `${tier.scope}:${tier.modelId}`),
      ['main:strong-1', 'main:weak-2', 'fallback:venice-fallback'],
    );
  });
});

describe('model ladder — routing behavior', () => {
  it('unconfigured → honest unavailable', async () => {
    const outcome = await runChatWith({}, { messages });
    assert.equal(outcome.status, 'unavailable');
    if (outcome.status === 'unavailable') assert.equal(outcome.reason, 'unconfigured');
  });

  it('walks tiers on narrow policy refusals, then fails policy-locked', async () => {
    const calls: Call[] = [];
    const refusal = { choices: [{ message: { content: "I can't help with that request." } }] };
    const outcome = await runChatWith(ENV, {
      messages,
      maxAttempts: 3,
      fetchImpl: script([
        () => ok(refusal),
        () => ok(refusal),
        () => ok(refusal),
        () => ok({ choices: [{ message: { content: 'fine' } }] }),
      ], calls),
    });
    assert.deepEqual(calls.map((call) => call.model), ['strong-1', 'weak-2', 'venice-fallback']);
    assert.equal(outcome.status, 'unavailable');
    if (outcome.status === 'unavailable') assert.equal(outcome.reason, 'policy-locked');
  });

  it('treats network/timeout as outage (separate from policy) and lands the fallback', async () => {
    const calls: Call[] = [];
    const outcome = await runChatWith(ENV, {
      messages,
      maxAttempts: 3,
      fetchImpl: script([
        () => ({ reject: 'network' }),
        () => ({ reject: 'network' }),
        () => ok({ choices: [{ message: { content: 'Venice answered plainly.' } }], usage: { prompt_tokens: 12, completion_tokens: 34 } }),
      ], calls),
    });
    assert.deepEqual(calls.map((call) => call.model), ['strong-1', 'weak-2', 'venice-fallback']);
    assert.equal(outcome.status, 'ok');
    if (outcome.status === 'ok') {
      assert.equal(outcome.model, 'venice-fallback');
      assert.equal(outcome.usage.completion, 34);
    }
  });

  it('empty output is its own bucket, not a refusal', async () => {
    const calls: Call[] = [];
    const outcome = await runChatWith(ENV, {
      messages,
      maxAttempts: 2,
      fetchImpl: script([
        () => ok({ choices: [{ message: { content: '' } }] }),
        () => ok({ choices: [{ message: { content: 'answered now.' } }] }),
      ], calls),
    });
    assert.equal(outcome.status, 'ok');
    if (outcome.status === 'ok') assert.equal(outcome.model, 'weak-2');
  });

  it('ambiguous text is not counted as refusal (narrow markers only)', async () => {
    assert.equal(isRefusal('That is not supported yet; try another endpoint.'), false);
    assert.equal(isRefusal("I won't provide that."), true);
  });

  it('budget guard blocks before any call and reports budget', async () => {
    const calls: Call[] = [];
    const outcome = await runChatWith(ENV, {
      messages,
      guard: { async beforeCall() { return { allowed: false }; }, enter: () => true, exit: () => {} },
      fetchImpl: script([() => ok({ choices: [{ message: { content: 'never reached' } }] })], calls),
    });
    assert.equal(calls.length, 0);
    assert.equal(outcome.status, 'unavailable');
    if (outcome.status === 'unavailable') assert.equal(outcome.reason, 'budget');
  });

  it('disabled ids are skipped entirely (unknown model IDs stay off)', async () => {
    const calls: Call[] = [];
    const outcome = await runChatWith(ENV, {
      messages,
      disabled: new Set(['strong-1']),
      fetchImpl: script([() => ok({ choices: [{ message: { content: 'from weak' } }] })], calls),
    });
    assert.deepEqual(calls.map((call) => call.model), ['weak-2']);
    assert.equal(outcome.status, 'ok');
  });

  it('tool calls come through untouched on the OK path', async () => {
    const calls: Call[] = [];
    const outcome = await runChatWith(ENV, {
      messages,
      tools: [{ type: 'function', function: { name: 'search_published', description: 's', parameters: { type: 'object', properties: {} } } }],
      fetchImpl: script([
        () => ok({ choices: [{ message: { content: '', tool_calls: [{ id: 't1', function: { name: 'search_published', arguments: '{"q":"x"}' } }] } }] }),
      ], calls),
    });
    assert.equal(outcome.status, 'ok');
    if (outcome.status === 'ok') assert.equal(outcome.text, '');
  });
});

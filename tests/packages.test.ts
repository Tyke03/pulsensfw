import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS, getAgent, AGENT_IDS } from '../server/orchestrator/packages';
import { STATES, VALID_TRANSITIONS, canTransition, applyTransition, IllegalTransitionError } from '../server/orchestrator/state-machine';
import { ROUTING_POLICY } from '../shared/brand';

const NEWS_FIT = {
  why_users_care: 'Users of the platform are directly affected by this week.',
  novelty_or_timeliness: 'Announced this week.',
  primary_audience: 'Platform users and creators',
  category_exclusivity_reason: 'Cross-platform change not owned by vertical categories',
  source_quality: 'high',
  date_of_event: null,
  date_of_source: '2026-09-20',
  sensitive_content_risk: 'low',
  recommended_angle: 'Practical impact explainer',
};

const roleOut = (payload: unknown) => ({ status: 'ok', confidence: 0.9, uncertainty: [], escalation: null, payload });

describe('case 1/2: every prompt-agent output schema validates fixtures', () => {
  it('all 16 agent IDs registered with stable version', () => {
    assert.equal(AGENTS.length, 16);
    for (const a of AGENTS) {
      assert.ok(a.id && a.version && a.systemPrompt.length > 50, `${a.id} malformed`);
    }
  });

  it('research-industry-news: valid candidate output passes schema', () => {
    const agent = getAgent('research-industry-news')!;
    const out = roleOut({
      candidates: [{
        topic: 'Platform X ends payout method Y',
        category: 'industry-news',
        finding: 'Platform X announced ending payout method Y for creators next month.',
        source_url: 'https://example.com/news/x-payout-change',
        source_date: '2026-09-20',
        event_date: '2026-09-18',
        suggested_angle: 'What creators should switch to now',
        confidence: 0.85,
        duplicate_fingerprint: 'x-payout-y-2026',
        news_fit: NEWS_FIT,
      }],
    });
    const res = agent.outputSchema.safeParse(out);
    assert.equal(res.success, true, JSON.stringify(res.success ? [] : res.error.issues));
  });

  it('research-industry-news: candidate without why_users_care fails schema (case 22)', () => {
    const agent = getAgent('research-industry-news')!;
    const out = roleOut({
      candidates: [{
        topic: 'Dry filing story', category: 'industry-news', finding: 'A company filed paperwork.',
        source_url: 'https://example.com/filing', source_date: '2026-09-20', event_date: null,
        suggested_angle: 'n/a', confidence: 0.4, duplicate_fingerprint: 'filing-1',
        news_fit: { ...NEWS_FIT, why_users_care: 'n/a' },
      }],
    });
    const res = agent.outputSchema.safeParse(out);
    assert.equal(res.success, false, 'thin why_users_care must be schema-invalid');
  });

  it('writer output requires draft package fields; refusal shape also valid', () => {
    const w = getAgent('writer-sex-tech')!;
    assert.equal(w.outputSchema.safeParse(roleOut({
      title: 'T', slug: 't', excerpt: 'E', body: 'B', tags: ['a', 'b', 'c'],
      metaTitle: 'M'.repeat(50), metaDescription: 'D'.repeat(140),
      intentBrand: 'Lovense', isStraightNews: false, newsFit: null, visualBrief: null,
      internalLinkIntents: [], selfCheck: {},
    })).success, true);
    assert.equal(w.outputSchema.safeParse({
      status: 'refused', confidence: 0.2, uncertainty: ['thin sourcing'],
      escalation: { reason_code: 'insufficient_sources', detail: 'single unverified source', recommended_action: 'human review' },
      payload: null,
    }).success, true);
  });

  it('qc output rejects an invalid recommendation', () => {
    const qc = getAgent('qc-publisher')!;
    const bad = qc.outputSchema.safeParse(roleOut({ recommendation: 'ship-it', scorecard: [], remediation: [] }));
    assert.equal(bad.success, false);
  });

  it('health-checker schema distinguishes all 8 statuses (case 16 shape)', () => {
    const h = getAgent('affiliate-health-checker')!;
    for (const status of ['healthy', 'redirect', 'redirect_to_home', 'rate_limited_inconclusive', 'broken', 'disabled', 'expired', 'unknown']) {
      const res = h.outputSchema.safeParse(roleOut({ observations: [{ url: 'https://x.example/a', affiliateId: 1, status, httpStatus: null, redirectTarget: null, notes: null }] }));
      assert.equal(res.success, true, status);
    }
  });
});

describe('state machine (cases 4/5/6 preconditions; illegal transitions rejected)', () => {
  it('happy path is legal end to end', () => {
    const path = ['discovered', 'research_validated', 'ready_to_write', 'claimed', 'in_progress',
      'draft_proposed', 'draft_persisted', 'visual_pending', 'visual_ready', 'end_rail_pending',
      'end_rail_validated', 'qc_pending', 'qc_pass', 'publish_eligible', 'published', 'audit_pending', 'audit_completed'];
    for (let i = 0; i < path.length - 1; i++) {
      assert.ok(canTransition(path[i] as any, path[i + 1] as any), `${path[i]} → ${path[i + 1]}`);
    }
  });

  it('illegal transitions throw', () => {
    assert.throws(() => applyTransition({ state: 'discovered' }, { from: 'discovered', to: 'published', actor: 'test' }), IllegalTransitionError);
    assert.ok(!canTransition('qc_reject' as any, 'published' as any));
  });

  it('transitions are idempotent (same run re-application is a no-op)', () => {
    const item = { state: 'discovered', transitionHistory: [] };
    const a1 = applyTransition(item, { from: 'discovered', to: 'research_validated', actor: 'orch', runId: 7 });
    const a2 = applyTransition({ state: a1.state, transitionHistory: a1.transitionHistory }, { from: 'discovered', to: 'research_validated', actor: 'orch', runId: 7 });
    assert.equal(a2.transitionHistory.length, 1);
  });

  it('history preserves all evidence (append-only)', () => {
    let item: { state: any; transitionHistory: any[] } = { state: 'discovered', transitionHistory: [] };
    for (const to of ['research_validated', 'ready_to_write']) {
      item = { ...item, ...applyTransition(item, { from: item.state, to, actor: 'orch', runId: 1, reason: `to ${to}` }) } as typeof item;
    }
    assert.equal(item.transitionHistory.length, 2);
    assert.equal(item.transitionHistory[0].to, 'research_validated');
  });

  it('qc_hold can return to qc_pending; qc_reject cannot publish (case 10)', () => {
    assert.ok(canTransition('qc_hold' as any, 'qc_pending' as any));
    assert.ok(!canTransition('qc_reject' as any, 'publish_eligible' as any));
  });
});

describe('category routing policy (case 21)', () => {
  it('specialized verticals are NOT industry-news owned terms', () => {
    const inTerms = ROUTING_POLICY['industry-news'].owns.map(s => s.toLowerCase());
    assert.ok(!inTerms.some(t => t.includes('chatbot')));
    assert.ok(!inTerms.some(t => t.includes('toy') || t.includes('device')));
    assert.ok(!inTerms.some(t => t.includes('headset')));
  });
  it('industry-news escalates dry legal/filing framing', () => {
    assert.ok(ROUTING_POLICY['industry-news'].escalates.some(t => ['legal', 'regulation', 'filing', 'b2b'].includes(t)));
  });
});

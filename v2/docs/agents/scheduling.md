# Local scheduling example (round 2E) — NOT ACTIVATED

The site never launches agents. Agents execute outside the site (opencode
sessions) and talk to the desk endpoints. What follows is the SHAPE of a
local scheduler an operator could run if they want one; nothing here is
wired into npm scripts, CI, or the dev server, and no keys are read by any
schedule. Rename to `.mjs` before running, and run only on an operator
machine that already holds the two agent env keys.

```javascript
// docs/agents/schedule.example.mjs
// Operator-side loop; intentionally dormant in the repo.
//
//   AGENT_DRAFT_KEY=... AGENT_PUBLISH_KEY=... node schedule.example.mjs
//
// Drives one opencode session per role, per day, over the desk endpoints.
// No cron, no daemon, no site-side process.

import { spawnSync } from 'node:child_process';

const MCP = 'https://pulsensfw.com/api/agent/mcp';
const roles = [
  { role: 'researcher', command: 'opencode run --agent researcher "check the research queue and push gaps as notes"' },
  { role: 'writer', command: 'opencode run --agent writer "pick one ready item per category and draft it in_review"' },
  { role: 'qc', command: 'opencode run --agent qc "review in_review drafts with compare_run, publish clean ones, return gaps"' },
];

for (const role of roles) {
  const result = spawnSync('opencode', [...role.command.split(' ').slice(1), '--mcp-endpoint', MCP], {
    stdio: 'inherit',
    env: process.env,
  });
  console.log(`[schedule] ${role.role} exited with ${result.status}`);
}
```

Rules the operator should keep:
- Schedules live on the operator machine; the repo ships this example only.
- Two keys, two scopes; never hand the publish key to a researcher/writer run.
- Every mutation is idempotent, so reruns after crashes are safe: same
  idempotency key replays; new work gets fresh keys.
- Run cadence suggestion (manual, not configured): researcher weekly,
  writer after researcher, QC after writer. Humans stay in the loop for
  anything contested.

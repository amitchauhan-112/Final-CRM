// One-off utility: deletes old Vercel deployments for this project, keeping
// only the most recent KEEP_COUNT (default 5) so the live/current one and a
// few rollback candidates are always safe. Frees up Function Storage quota.
//
// Usage (PowerShell):
//   $env:VERCEL_TOKEN = "your-token-from-vercel.com/account/tokens"
//   node cleanup-vercel-deployments.js            # dry run — only lists what WOULD be deleted
//   node cleanup-vercel-deployments.js --confirm  # actually deletes
//
// Optional: $env:VERCEL_TEAM_ID = "team_xxx" if this project lives under a
// Vercel Team (not needed for a personal/Hobby account — leave unset).

const PROJECT_NAME = 'final-crm';
const KEEP_COUNT = 5;
const TOKEN = process.env.VERCEL_TOKEN;
const TEAM_ID = process.env.VERCEL_TEAM_ID || '';
const CONFIRM = process.argv.includes('--confirm');

if (!TOKEN) {
  console.error('Set $env:VERCEL_TOKEN first — get one from https://vercel.com/account/tokens');
  process.exit(1);
}

const qs = (params) => {
  const p = new URLSearchParams(params);
  if (TEAM_ID) p.set('teamId', TEAM_ID);
  return p.toString();
};

async function vercelFetch(path, options = {}) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${options.method || 'GET'} ${path} -> ${res.status}: ${body}`);
  }
  return res.json();
}

async function main() {
  // Resolve project id from its name.
  const project = await vercelFetch(`/v9/projects/${PROJECT_NAME}?${qs({})}`);
  const projectId = project.id;
  console.log(`Project: ${PROJECT_NAME} (${projectId})`);

  // Paginate through every deployment.
  let deployments = [];
  let next;
  do {
    const params = { projectId, limit: '100' };
    if (next) params.until = String(next);
    const page = await vercelFetch(`/v6/deployments?${qs(params)}`);
    deployments.push(...page.deployments);
    next = page.pagination?.next;
  } while (next);

  deployments.sort((a, b) => b.created - a.created);

  const keep = deployments.slice(0, KEEP_COUNT);
  const remove = deployments.slice(KEEP_COUNT);

  console.log(`\nTotal deployments: ${deployments.length}`);
  console.log(`Keeping (most recent ${KEEP_COUNT}):`);
  keep.forEach((d) => console.log(`  KEEP   ${new Date(d.created).toISOString().slice(0, 10)}  ${d.uid}  ${d.meta?.githubCommitMessage?.split('\n')[0] || d.url}`));

  console.log(`\n${CONFIRM ? 'Deleting' : 'Would delete (dry run — pass --confirm to actually delete)'} ${remove.length} older deployments:`);
  for (const d of remove) {
    const label = `${new Date(d.created).toISOString().slice(0, 10)}  ${d.uid}  ${d.meta?.githubCommitMessage?.split('\n')[0] || d.url}`;
    if (!CONFIRM) {
      console.log(`  WOULD DELETE  ${label}`);
      continue;
    }
    try {
      await vercelFetch(`/v13/deployments/${d.uid}?${qs({})}`, { method: 'DELETE' });
      console.log(`  DELETED  ${label}`);
    } catch (e) {
      console.log(`  FAILED   ${label}  (${e.message})`);
    }
  }

  console.log('\nDone.' + (CONFIRM ? '' : ' Re-run with --confirm to actually delete.'));
}

main().catch((e) => { console.error(e); process.exit(1); });

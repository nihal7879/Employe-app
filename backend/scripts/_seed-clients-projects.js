/**
 * Create the clients/projects needed by the DWR import.
 *   Dry run:  node -r dotenv/config scripts/_seed-clients-projects.js
 *   Commit :  node -r dotenv/config scripts/_seed-clients-projects.js --commit
 * Idempotent: existing clients/projects (case-insensitive) are left untouched.
 */
const knex = require('knex')({ client: 'mysql2', connection: {
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, dateStrings: true } });

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const code = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 50);

// client name -> projects to ensure exist under it
const PLAN = {
  Strategy: ['PMS', 'Stridex', 'Hedge'],
  Claus:    ['BMR', 'Udforske', 'hassleoparkenV3', 'Dreamselector'],
};

(async () => {
  const commit = process.argv.includes('--commit');
  const clients = await knex('clients').where('is_deleted', false).select('id', 'client_name');
  const projects = await knex('projects').where('is_deleted', false).select('id', 'project_name', 'project_code');
  const cliByName = new Map(clients.map((c) => [norm(c.client_name), c]));
  const projByName = new Map(projects.map((p) => [norm(p.project_name), p]));
  const usedCodes = new Set(projects.map((p) => p.project_code));
  const actions = [];

  for (const [clientName, projNames] of Object.entries(PLAN)) {
    let client = cliByName.get(norm(clientName));
    let clientId = client?.id;
    if (!client) {
      actions.push(`CREATE client "${clientName}"`);
      if (commit) { [clientId] = await knex('clients').insert({ client_name: clientName, status: 'Active' }); }
    }
    for (const pn of projNames) {
      if (projByName.get(norm(pn))) { actions.push(`skip project "${pn}" (exists)`); continue; }
      let c = code(pn); let n = 1; while (usedCodes.has(c)) c = code(pn).slice(0, 47) + n++;
      usedCodes.add(c);
      actions.push(`CREATE project "${pn}" [${c}] under "${clientName}"`);
      if (commit) await knex('projects').insert({ client_id: clientId, project_code: c, project_name: pn, project_status: 'Active' });
    }
  }

  console.log(commit ? '=== COMMITTED ===' : '=== DRY RUN (use --commit to apply) ===');
  actions.forEach((a) => console.log('  ' + a));
  await knex.destroy();
})().catch(async (e) => { console.error('ERROR:', e.message); await knex.destroy(); process.exit(1); });

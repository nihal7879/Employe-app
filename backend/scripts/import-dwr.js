/**
 * Import historical daily tasks (old DWRs) into the daily_tasks table from a CSV.
 * One CSV can hold rows for MANY employees (the `employee` column says who).
 *
 *   1. Fill scripts/dwr-import-template.csv (or a copy) in Excel, save as CSV (UTF-8).
 *   2. Dry run — review the summary + any unmatched names (NOTHING is written):
 *        node scripts/import-dwr.js scripts/dwr-data.csv
 *   3. When it looks right, insert:
 *        node scripts/import-dwr.js scripts/dwr-data.csv --commit
 *
 * Safe to re-run: a row with the same (employee_id, task_date, start_time) is skipped.
 *
 * CSV columns (header row required; blank/extra columns are fine):
 *   employee     - employee_code OR email OR name (e.g. EMP-001)         -> employee_id   [required]
 *   task_date    - 2026-05-22 / 22 May 2026 / 22-05-2026                 -> task_date      [required]
 *   start_time   - 9:55 AM / 09:55 / 13:35                               -> start_time
 *   end_time     - 11:20 AM                                             -> end_time
 *   hours_spent  - leave BLANK to auto-calc from start/end times         -> hours_spent
 *   client       - client name (blank = taken from the project)          -> client_id
 *   project      - project name (pricespy, Trade Mirror, ...)            -> project_id
 *   activity     - Development / Bug Fixing / ...                        -> activity_id
 *   task_title   - short title (blank = first 255 chars of description)   -> task_title
 *   description  - full task text                                        -> description
 *   assigned_by  - e.g. "nirav sir"                                      -> assigned_by
 *   reference    - any reference/comment                                 -> reference
 *   status       - blank = "Submitted"                                   -> submission_status
 *   remarks      - e.g. "Completed"                                      -> remarks
 *   is_break     - yes/true/1 for lunch/breaks (no client/project/activ) -> is_break
 */
const fs = require('fs');
const path = require('path');

// Optional aliases: spreadsheet text -> exact name stored in the DB (case/space-insensitive).
const PROJECT_ALIASES = { tms: 'Trade Mirror', eclass: 'E-Class' };
const ACTIVITY_ALIASES = { implementation: 'Development', bug: 'Bug Fixing', change: 'Development' };

const knex = require('knex')({
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'employee_app',
    dateStrings: true,
  },
});

const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
const truthy = (s) => ['1', 'true', 'yes', 'y', 'break'].includes(norm(s));

// --- Minimal RFC-4180 CSV parser (handles quotes, commas & newlines in quotes) ---
function parseCsv(text) {
  text = text.replace(/^﻿/, ''); // strip BOM
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(norm);
  return rows.slice(1)
    .filter((r) => r.some((v) => String(v).trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, idx) => [h, (r[idx] ?? '').trim()])));
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseDate(s) {
  s = String(s || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\s/-]+([A-Za-z]+)[\s/-]+(\d{4})$/);
  if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
function parseTime(s) {
  s = String(s || '').trim();
  if (!s || s === '-') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const ap = (m[4] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}:${m[3] || '00'}`;
}
function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const sec = (t) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + s; };
  let d = sec(end) - sec(start);
  if (d < 0) d += 86400;
  return Math.round((d / 3600) * 100) / 100;
}

(async () => {
  const file = process.argv[2];
  const commit = process.argv.includes('--commit');
  if (!file) { console.error('Usage: node scripts/import-dwr.js <file.csv> [--commit]'); process.exit(1); }
  const csvPath = path.resolve(file);
  if (!fs.existsSync(csvPath)) { console.error('File not found:', csvPath); process.exit(1); }

  const [employees, clients, projects, activities] = await Promise.all([
    knex('employees').where('is_deleted', false).select('id', 'name', 'email', 'employee_code'),
    knex('clients').where('is_deleted', false).select('id', 'client_name'),
    knex('projects').where('is_deleted', false).select('id', 'client_id', 'project_name'),
    knex('activities').where('is_deleted', false).select('id', 'activity_name'),
  ]);
  const empByKey = new Map();
  employees.forEach((e) => { [e.employee_code, e.email, e.name].forEach((k) => { if (k) empByKey.set(norm(k), e); }); });
  const cliByName = new Map(clients.map((c) => [norm(c.client_name), c]));
  const projByName = new Map(projects.map((p) => [norm(p.project_name), p]));
  const actByName = new Map(activities.map((a) => [norm(a.activity_name), a]));

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const prepared = [], errors = [];
  const unmatched = { employee: new Set(), client: new Set(), project: new Set(), activity: new Set() };
  let breaks = 0;

  rows.forEach((r, i) => {
    const line = i + 2;
    const emp = empByKey.get(norm(r.employee));
    if (!emp) { unmatched.employee.add(r.employee || '(blank)'); errors.push(`line ${line}: employee not found`); return; }
    const task_date = parseDate(r.task_date);
    if (!task_date) { errors.push(`line ${line}: bad/empty task_date "${r.task_date}"`); return; }

    const start_time = parseTime(r.start_time);
    const end_time = parseTime(r.end_time);
    const description = (r.description || '').trim();
    const task_title = (r.task_title || description).slice(0, 255).trim();
    if (!task_title) { errors.push(`line ${line}: need task_title or description`); return; }

    const isBreak = truthy(r.is_break) || !norm(r.project) || norm(r.project) === '-' || /lunch|break/i.test(description);
    if (isBreak) breaks++;

    let client_id = null, project_id = null, activity_id = null;
    if (!isBreak) {
      const projKey = norm(PROJECT_ALIASES[norm(r.project)] || r.project);
      const p = projByName.get(projKey);
      if (p) { project_id = p.id; client_id = p.client_id; } else unmatched.project.add(r.project);
      if (norm(r.client)) { const c = cliByName.get(norm(r.client)); if (c) client_id = c.id; else unmatched.client.add(r.client); }
      const actKey = norm(ACTIVITY_ALIASES[norm(r.activity)] || r.activity);
      if (norm(r.activity)) { const a = actByName.get(actKey); if (a) activity_id = a.id; else unmatched.activity.add(r.activity); }
    }

    const hours = r.hours_spent && !isNaN(parseFloat(r.hours_spent)) ? parseFloat(r.hours_spent) : hoursBetween(start_time, end_time);
    const clean = (v) => (v && v.trim() && v.trim() !== '-' ? v.trim() : null);

    prepared.push({
      employee_id: emp.id,
      client_id, project_id, activity_id,
      hours_spent: hours,
      start_time, end_time,
      task_title, description: description || null,
      assigned_by: clean(r.assigned_by),
      reference: clean(r.reference),
      is_break: isBreak,
      task_date,
      submission_status: clean(r.status) || 'Submitted',
      remarks: clean(r.remarks),
      ip_address: 'dwr-import',
    });
  });

  console.log('\n=== Import summary ===');
  console.log('CSV file        :', csvPath);
  console.log('Rows parsed     :', rows.length);
  console.log('Ready to insert :', prepared.length, `(lunch/break: ${breaks})`);
  const byEmp = {};
  prepared.forEach((p) => { byEmp[p.employee_id] = (byEmp[p.employee_id] || 0) + 1; });
  Object.entries(byEmp).forEach(([id, n]) => {
    const e = employees.find((x) => x.id == id);
    console.log(`   employee ${e ? e.name + ' (' + e.employee_code + ')' : id}: ${n} rows`);
  });
  const dates = prepared.map((p) => p.task_date).sort();
  if (dates.length) console.log('Date range      :', dates[0], '→', dates[dates.length - 1]);
  if (errors.length) { console.log('\nSkipped rows:'); errors.forEach((e) => console.log('  -', e)); }
  for (const k of ['employee', 'client', 'project', 'activity']) {
    if (unmatched[k].size) {
      console.log(`\n⚠  Unmatched ${k.toUpperCase()} values (fix the CSV, create the record, or add an alias):`);
      [...unmatched[k]].forEach((v) => console.log('   •', JSON.stringify(v)));
    }
  }
  const blockers = Object.values(unmatched).some((s) => s.size);

  if (!commit) { console.log('\nDRY RUN — nothing written. Re-run with --commit to insert.'); await knex.destroy(); return; }
  if (blockers) { console.log('\n✗ Refusing to --commit while names are unmatched. Fix them first.'); await knex.destroy(); process.exit(1); }

  let inserted = 0, skipped = 0;
  for (const row of prepared) {
    const exists = await knex('daily_tasks')
      .where({ employee_id: row.employee_id, task_date: row.task_date })
      .andWhere((qb) => (row.start_time ? qb.where('start_time', row.start_time) : qb.whereNull('start_time')))
      .first('id');
    if (exists) { skipped++; continue; }
    await knex('daily_tasks').insert(row);
    inserted++;
  }
  console.log(`\n✓ Done. Inserted: ${inserted}, skipped (already present): ${skipped}.`);
  await knex.destroy();
})().catch(async (e) => { console.error('ERROR:', e); try { await knex.destroy(); } catch {} process.exit(1); });

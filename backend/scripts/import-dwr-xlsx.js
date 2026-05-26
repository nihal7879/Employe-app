/**
 * Import the "DWR Full Data.xlsx" export (Gmail → Sheet) into daily_tasks.
 *
 *   1. Dry run (NOTHING written — shows summary + unmatched names):
 *        node -r dotenv/config scripts/import-dwr-xlsx.js "C:/Users/dell/Downloads/DWR Full Data.xlsx"
 *   2. When clean, insert:
 *        node -r dotenv/config scripts/import-dwr-xlsx.js "C:/Users/dell/Downloads/DWR Full Data.xlsx" --commit
 *
 * Employee is taken from the `Sender` column email (matched to employees.email).
 * Safe to re-run: a row with the same (employee_id, task_date, start_time) is skipped.
 *
 * Excel columns used: Sender, Reported Date, From Time, To Time, Project Name,
 *   Task Description, Reported By, Type, Status, Comment.
 */
const path = require('path');
const XLSX = require('xlsx');

// Spreadsheet value -> exact name stored in the DB (case/space-insensitive).
const PROJECT_ALIASES = {
  tms: 'Trade Mirror', trademirror: 'Trade Mirror', 'trade mirror': 'Trade Mirror',
  'e class': 'E-Class', eclass: 'E-Class',
};
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

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function excelToYMD(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') {
    const ms = Math.round((Math.floor(v) - 25569) * 86400 * 1000); // 25569 = 1970-01-01
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\s/-]+([A-Za-z]+)[\s/-]+(\d{4})$/); // 27 Feb 2026
  if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
function excelToTime(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') {
    let secs = Math.round((v - Math.floor(v)) * 86400);
    const h = Math.floor(secs / 3600); secs -= h * 3600;
    const m = Math.floor(secs / 60); const s = secs - m * 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return null;
}
function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const sec = (t) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + (s || 0); };
  let d = sec(end) - sec(start);
  if (d < 0) d += 86400;
  return Math.round((d / 3600) * 100) / 100;
}
function emailOf(sender) {
  const m = String(sender || '').match(/<([^>]+)>/);
  return norm(m ? m[1] : sender);
}

(async () => {
  const file = process.argv[2];
  const commit = process.argv.includes('--commit');
  if (!file) { console.error('Usage: node -r dotenv/config scripts/import-dwr-xlsx.js <file.xlsx> [--commit]'); process.exit(1); }

  const wb = XLSX.readFile(path.resolve(file));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  if (!rows.length) { console.error('Empty sheet'); process.exit(1); }
  const H = rows[0].map(norm);
  const col = (name) => H.indexOf(norm(name));
  const I = {
    sender: col('Sender'), date: col('Reported Date'), from: col('From Time'), to: col('To Time'),
    project: col('Project Name'), desc: col('Task Description'), by: col('Reported By'),
    type: col('Type'), status: col('Status'), comment: col('Comment'),
  };

  const [employees, clients, projects, activities] = await Promise.all([
    knex('employees').where('is_deleted', false).select('id', 'name', 'email', 'employee_code'),
    knex('clients').where('is_deleted', false).select('id', 'client_name'),
    knex('projects').where('is_deleted', false).select('id', 'client_id', 'project_name'),
    knex('activities').where('is_deleted', false).select('id', 'activity_name'),
  ]);
  const empByEmail = new Map(employees.filter((e) => e.email).map((e) => [norm(e.email), e]));
  const projByName = new Map(projects.map((p) => [norm(p.project_name), p]));
  const actByName = new Map(activities.map((a) => [norm(a.activity_name), a]));

  const prepared = [], errors = [];
  const unmatched = { employee: new Set(), project: new Set(), activity: new Set() };
  let breaks = 0;

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    if (!r.some((v) => String(v).trim() !== '')) return; // blank row
    const emp = empByEmail.get(emailOf(r[I.sender]));
    if (!emp) { unmatched.employee.add(String(r[I.sender] || '(blank)')); errors.push(`line ${line}: employee not found`); return; }
    const task_date = excelToYMD(r[I.date]);
    if (!task_date) { errors.push(`line ${line}: bad task_date "${r[I.date]}"`); return; }

    const start_time = excelToTime(r[I.from]);
    const end_time = excelToTime(r[I.to]);
    const description = String(r[I.desc] || '').trim();
    const task_title = (description || 'Task').slice(0, 255);

    const projRaw = norm(r[I.project]);
    const isBreak = !projRaw || projRaw === '-' || /no lunch|lunch|break/i.test(`${projRaw} ${description}`);
    if (isBreak) breaks++;

    let client_id = null, project_id = null, activity_id = null;
    if (!isBreak) {
      const p = projByName.get(norm(PROJECT_ALIASES[projRaw] || projRaw));
      if (p) { project_id = p.id; client_id = p.client_id; } else unmatched.project.add(String(r[I.project]));
      const typeRaw = norm(r[I.type]);
      if (typeRaw) { const a = actByName.get(norm(ACTIVITY_ALIASES[typeRaw] || typeRaw)); if (a) activity_id = a.id; else unmatched.activity.add(String(r[I.type])); }
    }

    const clean = (v) => { const t = String(v == null ? '' : v).trim(); return t && t !== '-' ? t : null; };
    prepared.push({
      employee_id: emp.id,
      client_id, project_id, activity_id,
      hours_spent: hoursBetween(start_time, end_time),
      start_time, end_time,
      task_title, description: description || null,
      assigned_by: clean(r[I.by]),
      reference: clean(r[I.comment]),
      is_break: isBreak,
      task_date,
      submission_status: 'Submitted',
      remarks: clean(r[I.status]),
      ip_address: 'dwr-xlsx-import',
    });
  });

  console.log('\n=== Import summary ===');
  console.log('File          :', file);
  console.log('Rows parsed   :', rows.length - 1);
  console.log('Ready to insert:', prepared.length, `(breaks: ${breaks})`);
  const dates = prepared.map((p) => p.task_date).sort();
  if (dates.length) console.log('Date range    :', dates[0], '→', dates[dates.length - 1]);
  if (errors.length) { console.log(`\nSkipped ${errors.length} row(s):`); errors.slice(0, 20).forEach((e) => console.log('  -', e)); }
  for (const k of ['employee', 'project', 'activity']) {
    if (unmatched[k].size) {
      console.log(`\n⚠  Unmatched ${k.toUpperCase()} (create the record or add an alias):`);
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

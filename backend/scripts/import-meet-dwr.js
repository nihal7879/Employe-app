/**
 * Import Meet Vishavadia's DWR.xlsx with per-project client mapping.
 *
 *   Dry run:  node -r dotenv/config scripts/import-meet-dwr.js "C:/Users/dell/Downloads/DWR.xlsx"
 *   Commit:   node -r dotenv/config scripts/import-meet-dwr.js "C:/Users/dell/Downloads/DWR.xlsx" --commit
 *
 * Workflow on --commit (single transaction):
 *   1) rename client "Internal" -> "Millicent" (if still "Internal")
 *   2) ensure clients exist: Millicent, Adfactor, Sundaram, RD Brothers, LKP, Other
 *   3) create any missing projects under the right client
 *   4) insert daily_tasks for employee meet@millicent.in (skip dupes on emp+date+start_time)
 *   5) deactivate RD Brothers client + RDB-App project at the end
 */
const path = require('path');
const XLSX = require('xlsx');

const EMPLOYEE_EMAIL = 'meet@millicent.in';

// project (normalized) -> { client: <client_name>, code_prefix: <project code prefix> }
const PROJECT_CLIENT_MAP = {
  'shipyard':            { client: 'Millicent',   prefix: 'INT' },
  'app info extractor':  { client: 'Millicent',   prefix: 'INT' },
  'rdb-app':             { client: 'RD Brothers', prefix: 'RDB' },
  'getsetgrow':          { client: 'LKP',         prefix: 'LKP' },
  'sentry-v3-app':       { client: 'Adfactor',    prefix: 'ADF' },
  'sencheck':            { client: 'Adfactor',    prefix: 'ADF' },
  'tellatina':           { client: 'Other',       prefix: 'OTH' },
  'cse-app':             { client: 'Other',       prefix: 'OTH' },
  'eclass-v2':           { client: 'Sundaram',    prefix: 'SUN' },
};

// Clients that must exist (will be created with is_active=true unless listed below)
const ALL_TARGET_CLIENTS = ['Millicent', 'Adfactor', 'Sundaram', 'RD Brothers', 'LKP', 'Other'];

// At end of import, deactivate these clients + their RDB-App project
const DEACTIVATE_CLIENTS = ['RD Brothers'];
const DEACTIVATE_PROJECTS = ['RDB-App'];

const TYPE_TO_ACTIVITY = {
  new: 'Development',
  change: 'Development',
  bug: 'Bug Fixing',
  support: 'Support',
};

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

function excelDateToYMD(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') {
    const ms = Math.round((Math.floor(v) - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

function excelFracToTime(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') {
    let secs = Math.round((v - Math.floor(v)) * 86400);
    if (secs >= 86400) secs -= 86400;
    const h = Math.floor(secs / 3600); secs -= h * 3600;
    const m = Math.floor(secs / 60); const s = secs - m * 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}:${(m[3] || '00').padStart(2, '0')}`;
  return null;
}

function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const sec = (t) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + (s || 0); };
  let d = sec(end) - sec(start);
  if (d < 0) d += 86400;
  return Math.round((d / 3600) * 100) / 100;
}

function mapActivity(typeRaw, actByName) {
  const k = norm(typeRaw);
  const name = TYPE_TO_ACTIVITY[k];
  if (!name) return null;
  const a = actByName.get(norm(name));
  return a ? a.id : null;
}

function mapProgress(statusRaw) {
  return norm(statusRaw) === 'completed' ? 'Completed' : 'In Progress';
}

(async () => {
  const file = process.argv[2];
  const commit = process.argv.includes('--commit');
  if (!file) { console.error('Usage: node -r dotenv/config scripts/import-meet-dwr.js <file.xlsx> [--commit]'); process.exit(1); }

  const employee = await knex('employees').where({ email: EMPLOYEE_EMAIL, is_deleted: false, is_active: true }).first('id', 'name', 'employee_code');
  if (!employee) { console.error(`Employee not found: ${EMPLOYEE_EMAIL}`); process.exit(1); }
  console.log(`Employee: ${employee.name} (id=${employee.id}, ${employee.employee_code})`);

  const internalRow = await knex('clients').where({ client_name: 'Internal', is_deleted: false }).first('id');
  const willRenameInternal = !!internalRow;

  const allClients = await knex('clients').where('is_deleted', false).select('id', 'client_name', 'is_active');
  const clientByName = new Map(allClients.map((c) => [norm(c.client_name), c]));
  if (willRenameInternal && !clientByName.has('millicent')) {
    // pretend already renamed for planning purposes
    clientByName.set('millicent', { ...internalRow, client_name: 'Millicent', is_active: true });
  }

  const activities = await knex('activities').where('is_deleted', false).select('id', 'activity_name');
  const actByName = new Map(activities.map((a) => [norm(a.activity_name), a]));

  const wb = XLSX.readFile(path.resolve(file));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  if (!rows.length) { console.error('Empty sheet'); process.exit(1); }
  const I = { date: 1, from: 2, to: 3, project: 4, desc: 5, by: 6, type: 7, status: 8, comment: 10 };

  // Discover projects in file
  const projNamesInFile = new Set();
  rows.slice(1).forEach((r) => {
    const p = String(r[I.project] || '').trim();
    if (p && norm(p) !== 'project name') projNamesInFile.add(p);
  });

  // Build plan: which clients need creating, which projects need creating
  const clientsToCreate = ALL_TARGET_CLIENTS.filter((c) => !clientByName.has(norm(c)) && !(c === 'Millicent' && willRenameInternal));

  const allProjects = await knex('projects').where('is_deleted', false).select('id', 'client_id', 'project_name', 'project_code');

  // Per-client next project-code suffix
  const suffixByClient = {};
  for (const cName of ALL_TARGET_CLIENTS) {
    const c = clientByName.get(norm(cName));
    if (!c) { suffixByClient[norm(cName)] = 0; continue; }
    const max = allProjects.filter((p) => p.client_id === c.id).reduce((mx, p) => {
      const m = String(p.project_code || '').match(/-(\d{3,})$/);
      return m ? Math.max(mx, parseInt(m[1], 10)) : mx;
    }, 0);
    suffixByClient[norm(cName)] = max;
  }

  // Plan projects: { normProjName -> { project_name, client_name, project_code, exists_id } }
  const planned = new Map();
  for (const projRaw of projNamesInFile) {
    const k = norm(projRaw);
    const mapping = PROJECT_CLIENT_MAP[k];
    if (!mapping) {
      console.warn(`!! Project "${projRaw}" has no client mapping — will be skipped`);
      continue;
    }
    const clientKey = norm(mapping.client);
    const client = clientByName.get(clientKey);
    const existing = client ? allProjects.find((p) => p.client_id === client.id && norm(p.project_name) === k) : null;
    if (existing) {
      planned.set(k, { project_name: projRaw, client_name: mapping.client, project_code: existing.project_code, exists_id: existing.id });
    } else {
      suffixByClient[clientKey] = (suffixByClient[clientKey] || 0) + 1;
      const code = `${mapping.prefix}-${String(suffixByClient[clientKey]).padStart(3, '0')}`;
      planned.set(k, { project_name: projRaw, client_name: mapping.client, project_code: code, exists_id: null });
    }
  }

  console.log('\n=== Plan ===');
  if (willRenameInternal) console.log(`Rename client: Internal -> Millicent (id=${internalRow.id})`);
  if (clientsToCreate.length) {
    console.log('Create clients:');
    clientsToCreate.forEach((c) => console.log(`  + ${c}`));
  }
  console.log('Projects:');
  for (const [, p] of planned) {
    const marker = p.exists_id ? '(exists)' : '(create)';
    console.log(`  ${marker} ${p.project_code} | ${p.project_name} -> ${p.client_name}`);
  }
  console.log('Post-import deactivate:');
  DEACTIVATE_CLIENTS.forEach((c) => console.log(`  - client: ${c}`));
  DEACTIVATE_PROJECTS.forEach((p) => console.log(`  - project: ${p}`));

  // Parse data rows
  const prepared = [], skippedRows = [];
  const unmatchedTypes = new Set();
  let breaks = 0, noProjectTasks = 0;
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    if (!r.some((v) => String(v).trim() !== '')) return;
    if (norm(r[I.project]) === 'project name' || norm(r[I.desc]) === 'issue/ support/ task description') return; // stray header

    const task_date = excelDateToYMD(r[I.date]);
    if (!task_date) { skippedRows.push(`line ${line}: bad date "${r[I.date]}"`); return; }

    const start_time = excelFracToTime(r[I.from]);
    const end_time = excelFracToTime(r[I.to]);
    const projRaw = String(r[I.project] || '').trim();
    const description = String(r[I.desc] || '').trim();

    if (!projRaw && !description && !start_time && !end_time) return; // placeholder stub

    // Lunch/Break/Tea is ALWAYS a break, even when the project column happens to be filled.
    const isBreak = /^(lunch|break|tea)$/i.test(description);
    if (isBreak) breaks++;

    if (!isBreak && projRaw) {
      const projInfo = planned.get(norm(projRaw));
      if (!projInfo) { skippedRows.push(`line ${line}: no mapping for project "${projRaw}"`); return; }
    } else if (!isBreak) {
      noProjectTasks++;
    }

    const typeRaw = r[I.type];
    const activity_id = isBreak ? null : mapActivity(typeRaw, actByName);
    if (!isBreak && typeRaw && !TYPE_TO_ACTIVITY[norm(typeRaw)] && norm(typeRaw) !== 'bug/ new/ change/ support') {
      unmatchedTypes.add(String(typeRaw));
    }

    const task_title = (description || (isBreak ? 'Break' : 'Task')).slice(0, 255);
    const clean = (v) => { const t = String(v == null ? '' : v).trim(); return t && t !== '-' ? t : null; };

    // XLSX "Comment/Solution" (col 10) often has multi-paragraph notes that overflow
    // the 255-char `reference` column. Put long narrative into `description` (TEXT),
    // keep the short ticket id (col 5) as `reference`.
    const commentRaw = clean(r[I.comment]);
    const finalDescription = commentRaw || description || null;
    const finalReference = description && description.length <= 255 ? description : null;

    prepared.push({
      employee_id: employee.id,
      _project_key: isBreak ? null : (projRaw ? norm(projRaw) : null),
      activity_id,
      hours_spent: hoursBetween(start_time, end_time),
      start_time, end_time,
      task_title,
      description: finalDescription,
      assigned_by: clean(r[I.by]),
      reference: finalReference,
      is_break: isBreak,
      task_date,
      submission_status: 'Submitted',
      progress_status: isBreak ? null : mapProgress(r[I.status]),
      remarks: clean(r[I.status]),
      ip_address: 'dwr-xlsx-import',
    });
  });

  const byProgress = prepared.reduce((m, p) => { m[p.progress_status || 'null'] = (m[p.progress_status || 'null'] || 0) + 1; return m; }, {});
  const byClient = prepared.reduce((m, p) => {
    const k = p._project_key ? (planned.get(p._project_key)?.client_name || '?') : (p.is_break ? '(break)' : '(no project)');
    m[k] = (m[k] || 0) + 1; return m;
  }, {});

  console.log('\n=== Parse summary ===');
  console.log('Rows in file       :', rows.length - 1);
  console.log('Ready to insert    :', prepared.length, `(breaks: ${breaks}, no-project: ${noProjectTasks})`);
  console.log('Skipped            :', skippedRows.length);
  if (skippedRows.length) skippedRows.slice(0, 10).forEach((s) => console.log('   -', s));
  console.log('By progress_status :', byProgress);
  console.log('By client          :', byClient);
  if (unmatchedTypes.size) console.log('Unmapped Type values:', [...unmatchedTypes]);

  if (!commit) {
    console.log('\nDRY RUN — nothing written. Re-run with --commit to apply.');
    await knex.destroy();
    return;
  }

  // ---- COMMIT ----
  await knex.transaction(async (trx) => {
    if (willRenameInternal) {
      await trx('clients').where({ id: internalRow.id }).update({ client_name: 'Millicent' });
      console.log(`Renamed client id=${internalRow.id} -> Millicent`);
    }
    // Create missing clients
    for (const cName of clientsToCreate) {
      const [id] = await trx('clients').insert({ client_name: cName, status: 'Active', is_active: true, is_deleted: false });
      clientByName.set(norm(cName), { id, client_name: cName, is_active: true });
      console.log(`Created client: ${cName} (id=${id})`);
    }
    // Resolve client_id for renamed Millicent
    if (willRenameInternal) {
      clientByName.set('millicent', { id: internalRow.id, client_name: 'Millicent', is_active: true });
    }
    // Create missing projects
    for (const [, p] of planned) {
      if (p.exists_id) continue;
      const c = clientByName.get(norm(p.client_name));
      const [pid] = await trx('projects').insert({
        client_id: c.id,
        project_code: p.project_code,
        project_name: p.project_name,
        project_status: 'Active',
        is_active: true,
        is_deleted: false,
      });
      p.exists_id = pid;
      console.log(`Created project: ${p.project_code} | ${p.project_name} -> ${p.client_name} (id=${pid})`);
    }

    // Insert daily_tasks
    let inserted = 0, skipped = 0;
    for (const row of prepared) {
      const info = row._project_key ? planned.get(row._project_key) : null;
      const client_id = info ? clientByName.get(norm(info.client_name)).id : (row.is_break ? null : null);
      const insertRow = { ...row, client_id, project_id: info ? info.exists_id : null };
      delete insertRow._project_key;
      const exists = await trx('daily_tasks')
        .where({ employee_id: insertRow.employee_id, task_date: insertRow.task_date })
        .andWhere((qb) => (insertRow.start_time ? qb.where('start_time', insertRow.start_time) : qb.whereNull('start_time')))
        .first('id');
      if (exists) { skipped++; continue; }
      await trx('daily_tasks').insert(insertRow);
      inserted++;
    }
    console.log(`\nDaily tasks — inserted: ${inserted}, skipped (duplicates): ${skipped}`);

    // Deactivate RD Brothers + RDB-App
    for (const cName of DEACTIVATE_CLIENTS) {
      const c = clientByName.get(norm(cName));
      if (c) {
        await trx('clients').where({ id: c.id }).update({ is_active: false, status: 'Inactive' });
        console.log(`Deactivated client: ${cName} (id=${c.id})`);
      }
    }
    for (const pName of DEACTIVATE_PROJECTS) {
      const p = planned.get(norm(pName));
      if (p && p.exists_id) {
        await trx('projects').where({ id: p.exists_id }).update({ is_active: false, project_status: 'Inactive' });
        console.log(`Deactivated project: ${pName} (id=${p.exists_id})`);
      }
    }
  });

  await knex.destroy();
})().catch(async (e) => { console.error('ERROR:', e); try { await knex.destroy(); } catch {} process.exit(1); });

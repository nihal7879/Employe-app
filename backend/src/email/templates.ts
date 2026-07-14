export interface TaskRow {
  client_name: string;
  project_name: string;
  activity_name: string;
  task_title: string;
  hours_spent: number | string;
  description?: string;
  start_time?: string | null;
  end_time?: string | null;
}

// "HH:MM[:SS]" -> minutes since midnight, or null.
function toMin(t?: string | null): number | null {
  if (!t) return null;
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
// "HH:MM[:SS]" -> "h:MM AM/PM", or "—".
function fmt12(t?: string | null): string {
  const mins = toMin(t);
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}

export function employeeDailyReportEmail(opts: {
  name: string;
  date: string;
  total_hours: number;
  tasks: TaskRow[];
  first_login?: string | null;
  last_logout?: string | null;
}) {
  const { name, date, total_hours, tasks: rawTasks, first_login = null, last_logout = null } = opts;
  const loginMin = toMin(first_login);

  // Show tasks in chronological order by start time, not creation order — so a
  // 9–11 / 2–4 / 11–2 entry sequence reads 9–11, 11–2, 2–4. Untimed tasks sort
  // last, keeping their original relative order.
  const tasks = [...rawTasks].sort((a, b) => {
    const sa = toMin(a.start_time);
    const sb = toMin(b.start_time);
    if (sa == null && sb == null) return 0;
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sa - sb;
  });

  // Flag any task that started before the employee's first login of the day.
  // With the login-grace window these are allowed, but they're surfaced here
  // so the employee/admin can confirm the back-dated start time is correct.
  const flagged = (t: TaskRow) => {
    const s = toMin(t.start_time);
    return loginMin != null && s != null && s < loginMin;
  };
  const flaggedCount = tasks.filter(flagged).length;

  const rows = tasks.length
    ? tasks
        .map((t) => {
          const warn = flagged(t);
          const timeCell = t.start_time
            ? `${fmt12(t.start_time)} – ${fmt12(t.end_time)}${warn
                ? `<br/><span style="color:#b91c1c;font-size:11px;font-weight:600;">⚠ before login</span>`
                : ''}`
            : '—';
          return `
        <tr${warn ? ' style="background:#fff7ed;"' : ''}>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;">${escape(t.client_name)}</td>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;">${escape(t.project_name)}</td>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;">${escape(t.activity_name)}</td>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;">${escape(t.task_title)}</td>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;white-space:nowrap;">${timeCell}</td>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">${t.hours_spent}</td>
        </tr>`;
        })
        .join('')
    : `<tr><td colspan="6" style="padding:12px;text-align:center;color:#6b7280;border:1px solid #e5e7eb;">
         No tasks submitted yet for today.
       </td></tr>`;

  const mismatchBanner = flaggedCount > 0
    ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 16px;margin:16px 0;">
         <strong style="color:#9a3412;">⚠ Time mismatch:</strong>
         <span style="color:#7c2d12;">
           ${flaggedCount} task${flaggedCount === 1 ? '' : 's'} below started before your first login
           (${fmt12(first_login)}). Logging before login is allowed within the grace window, but please
           confirm the start time${flaggedCount === 1 ? ' is' : 's are'} correct.
         </span>
       </div>`
    : '';

  return `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#111827;">
    <h2 style="margin-bottom:4px;">Hi ${escape(name)},</h2>
    <p style="color:#374151;margin-top:0;">Here is your daily task report for <strong>${date}</strong>.</p>
    <div style="background:#f3f4f6;border-radius:8px;padding:12px 16px;margin:16px 0;">
      <strong>First login:</strong> ${fmt12(first_login)} &nbsp;·&nbsp;
      <strong>Last logout:</strong> ${fmt12(last_logout)}<br/>
      <strong>Total hours logged today:</strong> ${total_hours.toFixed(2)} h<br/>
      <strong>Tasks submitted:</strong> ${tasks.length}
    </div>
    ${mismatchBanner}
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="background:#111827;color:#fff;">
          <th style="padding:8px 10px;text-align:left;">Client</th>
          <th style="padding:8px 10px;text-align:left;">Project</th>
          <th style="padding:8px 10px;text-align:left;">Activity</th>
          <th style="padding:8px 10px;text-align:left;">Task</th>
          <th style="padding:8px 10px;text-align:left;">Time</th>
          <th style="padding:8px 10px;text-align:right;">Hours</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#6b7280;font-size:12px;margin-top:24px;">
      This is an automated report generated by the Employee App.
    </p>
  </div>`;
}

export function adminDailySummaryEmail(opts: {
  date: string;
  rows: { employee_name: string; task_count: number; total_hours: number }[];
  grand_total_hours: number;
  grand_total_tasks: number;
}) {
  const { date, rows, grand_total_hours, grand_total_tasks } = opts;
  const body = rows.length
    ? rows
        .map(
          (r) => `
        <tr>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;">${escape(r.employee_name)}</td>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">${r.task_count}</td>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">${r.total_hours.toFixed(2)}</td>
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="3" style="padding:12px;text-align:center;color:#6b7280;border:1px solid #e5e7eb;">
         No active employees found.
       </td></tr>`;

  return `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#111827;">
    <h2 style="margin-bottom:4px;">Team Daily Summary</h2>
    <p style="color:#374151;margin-top:0;">Employee task activity for <strong>${date}</strong>.</p>
    <div style="background:#f3f4f6;border-radius:8px;padding:12px 16px;margin:16px 0;">
      <strong>Total hours logged:</strong> ${grand_total_hours.toFixed(2)} h<br/>
      <strong>Total tasks:</strong> ${grand_total_tasks}<br/>
      <strong>Employees:</strong> ${rows.length}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="background:#111827;color:#fff;">
          <th style="padding:8px 10px;text-align:left;">Employee</th>
          <th style="padding:8px 10px;text-align:right;">Tasks</th>
          <th style="padding:8px 10px;text-align:right;">Hours</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    <p style="color:#6b7280;font-size:12px;margin-top:24px;">
      This is an automated summary generated by the Employee App.
    </p>
  </div>`;
}

export interface LoginOverrideRow {
  name: string;
  employee_code?: string | null;
  first_login?: string | null;
  earliest_task?: string | null;
  tasks_before_login: number | string;
}

export function adminDailyDigestEmail(opts: {
  date: string;
  sections: { employee_name: string; total_hours: number; task_count: number; tasks: TaskRow[] }[];
  notSubmitted?: string[];
  overrides?: LoginOverrideRow[];
  grand_total_hours: number;
  grand_total_tasks: number;
}) {
  const { date, sections, notSubmitted = [], overrides = [], grand_total_hours, grand_total_tasks } = opts;

  const overrideHtml = overrides.length
    ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 16px;margin:16px 0;">
         <strong style="color:#9a3412;">⚠ Logged tasks before login (${overrides.length}):</strong>
         <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
           <thead>
             <tr style="background:#9a3412;color:#fff;">
               <th style="padding:6px 10px;text-align:left;">Employee</th>
               <th style="padding:6px 10px;text-align:left;">First login</th>
               <th style="padding:6px 10px;text-align:left;">Earliest task</th>
               <th style="padding:6px 10px;text-align:right;">Tasks before login</th>
             </tr>
           </thead>
           <tbody>${overrides
             .map(
               (o) => `
             <tr>
               <td style="padding:6px 10px;border:1px solid #fed7aa;">${escape(o.name)}${o.employee_code ? ` <span style="color:#9a3412;">(${escape(o.employee_code)})</span>` : ''}</td>
               <td style="padding:6px 10px;border:1px solid #fed7aa;">${fmt12(o.first_login)}</td>
               <td style="padding:6px 10px;border:1px solid #fed7aa;">${fmt12(o.earliest_task)}</td>
               <td style="padding:6px 10px;border:1px solid #fed7aa;text-align:right;">${o.tasks_before_login}</td>
             </tr>`,
             )
             .join('')}</tbody>
         </table>
       </div>`
    : '';

  return `
  <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;color:#111827;">
    <h2 style="margin-bottom:4px;">Team Daily Summary</h2>
    <p style="color:#374151;margin-top:0;">Compliance summary for <strong>${date}</strong>.</p>
    <div style="background:#f3f4f6;border-radius:8px;padding:12px 16px;margin:16px 0;">
      <strong>Total hours logged:</strong> ${grand_total_hours.toFixed(2)} h<br/>
      <strong>Total tasks:</strong> ${grand_total_tasks}<br/>
      <strong>Submitted:</strong> ${sections.length} &nbsp;·&nbsp; <strong>Not submitted:</strong> ${notSubmitted.length}
    </div>
    ${notSubmitted.length ? `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin:16px 0;">
      <strong style="color:#b91c1c;">Not submitted today (${notSubmitted.length}):</strong>
      <span style="color:#7f1d1d;"> ${notSubmitted.map(escape).join(', ')}</span>
    </div>` : ''}
    ${overrideHtml}
    <p style="margin:20px 0;">
      <a href="${APP_URL}" style="display:inline-block;background:#7C3AED;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;">
        Open Employee App for full details →
      </a>
    </p>
    <p style="color:#6b7280;font-size:12px;margin-top:8px;">
      This is an automated summary generated by the Employee App.
    </p>
  </div>`;
}

const APP_URL = 'https://employe-app-mt.vercel.app';

export function reminderEmail(name: string, date: string) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#111827;">
    <h2>Hi ${escape(name)},</h2>
    <p>You haven't submitted your daily task report for <strong>${date}</strong> yet.</p>
    <p>Please log in to the Employee App and submit your tasks.</p>
    <p style="margin:24px 0;">
      <a href="${APP_URL}" style="display:inline-block;background:#7C3AED;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;">
        Open Employee App →
      </a>
    </p>
    <p style="color:#6b7280;font-size:12px;">Or paste this link in your browser: <a href="${APP_URL}" style="color:#7C3AED;">${APP_URL}</a></p>
  </div>`;
}

// ===== Assigned-task emails (assignment / comment / status / reminder) =====
export interface AssignedTaskEmailData {
  title: string;
  description?: string | null;
  assignee_name?: string | null;
  assigned_by_name?: string | null;
  priority?: string | null;
  status?: string | null;
  client_name?: string | null;
  project_name?: string | null;
  assigned_date?: string | null;
  start_date?: string | null;
  due_date?: string | null;
}

// Professional, email-client-safe palette. Everything below is built from
// nested <table> layouts with inline styles (no flexbox / no gradients) so it
// renders consistently in Gmail, Outlook, Apple Mail, etc.
const INK = '#111827';   // headings
const BODY = '#374151';  // body text
const MUTE = '#6b7280';  // labels
const FAINT = '#9ca3af'; // footer / de-emphasised
const LINE = '#e5e7eb';  // borders
const SOFT = '#f9fafb';  // subtle fills
const PAGE = '#eef1f5';  // page background
const ACCENT = '#7C3AED';// primary accent (app brand purple)

const STATUS_COLOR: Record<string, string> = {
  Open: '#64748b', 'In Progress': '#2563eb', Completed: '#16a34a',
};
const PRIORITY_COLOR: Record<string, string> = {
  Low: '#64748b', Medium: '#2563eb', High: '#d97706', Urgent: '#dc2626',
};

// A solid, tinted pill (bg = 12% tint via a light fill, text = full colour).
function pill(label: string, value: string, color: string) {
  return `<span style="display:inline-block;background:${color}1a;color:${color};font-size:12px;font-weight:700;line-height:1;padding:7px 12px;border-radius:6px;border:1px solid ${color}33;">${escape(label)}${label ? ' ' : ''}${escape(value)}</span>`;
}

// One key/value line in the details table (label left, value right).
function metaRow(label: string, valueHtml: string, last = false) {
  const border = last ? '' : `border-bottom:1px solid ${LINE};`;
  return `<tr>
    <td style="padding:11px 0;${border}color:${MUTE};font-size:13px;line-height:1.4;vertical-align:top;white-space:nowrap;">${label}</td>
    <td style="padding:11px 0;${border}color:${INK};font-size:13px;line-height:1.4;font-weight:600;vertical-align:top;text-align:right;word-break:break-word;">${valueHtml}</td>
  </tr>`;
}

// One template for every task notification email. `headline` sets the context
// (e.g. "A new task has been assigned to you"); `note` adds an optional block
// such as a comment body or a status-change line.
export function assignedTaskEmail(opts: {
  headline: string;
  task: AssignedTaskEmailData;
  note?: { label: string; body: string } | null;
}) {
  const { headline, task, note } = opts;
  const statusColor = STATUS_COLOR[task.status || 'Open'] || STATUS_COLOR.Open;

  const badges: string[] = [];
  if (task.status) badges.push(pill('', task.status, statusColor));
  if (task.priority) badges.push(pill('', `${task.priority} priority`, PRIORITY_COLOR[task.priority] || MUTE));
  const badgeRow = badges.length
    ? `<tr><td style="padding:0 32px 20px;">${badges.join('&nbsp;&nbsp;')}</td></tr>`
    : '';

  const descBlock = task.description
    ? `<tr><td style="padding:0 32px 22px;">
         <div style="color:${BODY};font-size:14px;line-height:1.65;white-space:pre-wrap;word-break:break-word;border-left:3px solid ${LINE};padding-left:14px;">${escape(task.description)}</div>
       </td></tr>`
    : '';

  const noteBlock = note
    ? `<tr><td style="padding:0 32px 22px;">
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SOFT};border:1px solid ${LINE};border-radius:8px;">
           <tr><td style="padding:14px 16px;">
             <div style="color:${MUTE};font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:6px;">${escape(note.label)}</div>
             <div style="color:${BODY};font-size:14px;line-height:1.55;white-space:pre-wrap;word-break:break-word;">${escape(note.body)}</div>
           </td></tr>
         </table>
       </td></tr>`
    : '';

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};margin:0;padding:0;">
    <tr><td align="center" style="padding:32px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;overflow:hidden;">

        <!-- Accent bar -->
        <tr><td style="height:4px;background:${ACCENT};font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Header -->
        <tr><td style="padding:26px 32px 4px;">
          <div style="color:${FAINT};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Employee App</div>
          <div style="margin-top:14px;color:${MUTE};font-size:14px;line-height:1.4;">${escape(headline)}</div>
          <div style="margin-top:6px;color:${INK};font-size:21px;line-height:1.3;font-weight:700;word-break:break-word;">${escape(task.title)}</div>
        </td></tr>

        <tr><td style="padding:18px 32px 0;">&nbsp;</td></tr>
        ${badgeRow}
        ${descBlock}
        ${noteBlock}

        <!-- Details -->
        <tr><td style="padding:0 32px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SOFT};border:1px solid ${LINE};border-radius:10px;">
            <tr><td style="padding:16px 18px 0;color:${FAINT};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Task details</td></tr>
            <tr><td style="padding:6px 18px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${metaRow('Assigned to', escape(task.assignee_name || '—'))}
                ${metaRow('Assigned by', escape(task.assigned_by_name || '—'))}
                ${metaRow('Client', escape(task.client_name || '—'))}
                ${metaRow('Project', escape(task.project_name || '—'))}
                ${metaRow('Assigned on', escape(task.assigned_date || '—'))}
                ${metaRow('Due date', task.due_date ? `<span style="color:#dc2626;font-weight:700;">${escape(task.due_date)}</span>` : '—', true)}
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td align="center" style="padding:26px 32px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="border-radius:8px;background:${ACCENT};">
              <a href="${APP_URL}" style="display:inline-block;padding:13px 36px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:8px;">View task &rarr;</a>
            </td>
          </tr></table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:22px 32px 28px;border-top:1px solid ${LINE};">
          <div style="color:${FAINT};font-size:12px;line-height:1.6;text-align:center;">
            You're receiving this because you're involved in this task.<br/>
            Employee App &middot; automated notification
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>`;
}

export interface OverdueTaskRow {
  title: string;
  due_date: string;
  status?: string;
  priority?: string;
  client_name?: string | null;
  project_name?: string | null;
  assigned_by_name?: string | null;
}

// The 6 AM digest: every task of yours that's past its due date, in one email,
// oldest first. One mail per person rather than one per task — a dozen separate
// reminders is how people learn to ignore reminders.
export function overdueTasksEmail(opts: { name: string; tasks: OverdueTaskRow[]; today: string }) {
  const { name, tasks, today } = opts;

  const daysLate = (due: string) =>
    Math.max(0, Math.round((new Date(today).getTime() - new Date(due).getTime()) / 86_400_000));

  const rows = tasks
    .map((t, i) => {
      const last = i === tasks.length - 1;
      const border = last ? '' : `border-bottom:1px solid ${LINE};`;
      const late = daysLate(String(t.due_date).slice(0, 10));
      const where = [t.project_name, t.client_name].filter(Boolean).map((x) => escape(String(x))).join(' · ') || '—';
      return `<tr>
        <td style="padding:13px 0;${border}vertical-align:top;">
          <div style="color:${INK};font-size:14px;font-weight:700;line-height:1.4;word-break:break-word;">${escape(t.title)}</div>
          <div style="margin-top:3px;color:${MUTE};font-size:12px;line-height:1.5;">
            ${where}${t.assigned_by_name ? ` &middot; by ${escape(String(t.assigned_by_name))}` : ''}
          </div>
          <div style="margin-top:5px;color:${MUTE};font-size:12px;">
            ${t.status ? `<span style="color:${STATUS_COLOR[t.status] || MUTE};font-weight:700;">${escape(t.status)}</span> &middot; ` : ''}
            ${t.priority ? `<span style="color:${PRIORITY_COLOR[t.priority] || MUTE};font-weight:700;">${escape(t.priority)}</span> &middot; ` : ''}
            due <span style="color:#dc2626;font-weight:700;">${escape(String(t.due_date).slice(0, 10))}</span>
            <span style="color:#dc2626;">(${late} day${late === 1 ? '' : 's'} late)</span>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};margin:0;padding:0;">
    <tr><td align="center" style="padding:32px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;overflow:hidden;">

        <tr><td style="height:4px;background:#dc2626;font-size:0;line-height:0;">&nbsp;</td></tr>

        <tr><td style="padding:26px 32px 4px;">
          <div style="color:${FAINT};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Employee App</div>
          <div style="margin-top:14px;color:${INK};font-size:21px;line-height:1.3;font-weight:700;">
            ${tasks.length} pending task${tasks.length === 1 ? '' : 's'}
          </div>
          <div style="margin-top:6px;color:${MUTE};font-size:14px;line-height:1.5;">
            Good morning ${escape(name)} — the following task${tasks.length === 1 ? ' is' : 's are'} overdue.
          </div>
        </td></tr>

        <tr><td style="padding:18px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
        </td></tr>

        <tr><td align="center" style="padding:26px 32px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="border-radius:8px;background:${ACCENT};">
              <a href="${APP_URL}/my-tasks?due=overdue" style="display:inline-block;padding:13px 36px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:8px;">View pending tasks &rarr;</a>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:22px 32px 28px;border-top:1px solid ${LINE};">
          <div style="color:${FAINT};font-size:12px;line-height:1.6;text-align:center;">
            You're receiving this because these tasks are assigned to you.<br/>
            Employee App &middot; automated notification
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>`;
}

function escape(s: string = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

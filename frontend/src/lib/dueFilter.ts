import type { AssignedTask } from '../types';

// The "Due" filter, shared by My Tasks (employee) and Assign Tasks (admin /
// manager) so both sides mean exactly the same thing by "Overdue".
export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

export const DUE_OPTIONS: { label: string; value: DueFilter }[] = [
  { label: 'Any due date', value: 'all' },
  { label: 'Overdue',      value: 'overdue' },
  { label: 'Due today',    value: 'today' },
  { label: 'Due in 7 days', value: 'week' },
  { label: 'No due date',  value: 'none' },
];

// Local calendar date, NOT toISOString() — that converts to UTC, so between
// midnight and 5:30 AM IST it returns yesterday and a task that just became
// overdue still reads as due-today.
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// A task is overdue only if it's past its due date AND still unfinished — a
// task completed after its deadline is late history, not outstanding work.
export function isOverdue(t: AssignedTask, today = ymd(new Date())): boolean {
  return !!t.due_date && String(t.due_date) < today && t.status !== 'Completed';
}

export function matchesDue(t: AssignedTask, f: DueFilter): boolean {
  if (f === 'all') return true;
  if (f === 'none') return !t.due_date;
  if (!t.due_date) return false;

  const today = ymd(new Date());
  const due = String(t.due_date).slice(0, 10);

  if (f === 'overdue') return isOverdue(t, today);
  if (f === 'today') return due === today;
  if (f === 'week') {
    // Next 7 days INCLUDING anything already overdue — "what needs attention
    // this week" is the question being asked, and a late task still needs it.
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    return due <= ymd(in7) && t.status !== 'Completed';
  }
  return true;
}

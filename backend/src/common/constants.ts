// Roles whose members log their own daily tasks: Employee and Manager. Used
// wherever a query means "people expected to submit daily work" — compliance
// reminders, admin digests, pending-submission lists, weekly/monthly totals.
// Admins are excluded (they don't log tasks). Keyed by role_name (not role_id)
// so it stays correct regardless of the Manager role's numeric id.
export const LOGGING_ROLE_NAMES = ['Employee', 'Manager'];

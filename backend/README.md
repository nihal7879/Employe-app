# Employee App — Backend

NestJS + Knex.js + MySQL backend for the Employee Daily Task Management System.

## Setup

```bash
cd backend
cp .env.example .env       # then fill in DB / Google OAuth / SMTP creds
npm install
```

Apply the schema (one-time):

```bash
mysql -u root -p < ../database/schema.sql
```

Run dev server:

```bash
npm run start:dev
```

API: http://localhost:4000  
Swagger: http://localhost:4000/docs

## Folder structure

```
src/
 ├── auth/           Google SSO + JWT
 ├── roles/
 ├── departments/
 ├── employees/
 ├── clients/
 ├── projects/
 ├── activities/
 ├── daily-tasks/    Core task submission
 ├── reports/        Daily / weekly / monthly admin reports
 ├── analytics/      Dashboard analytics
 ├── scheduler/      Cron jobs (12 PM daily email, reminders, weekly/monthly)
 ├── email/          Nodemailer + email_logs
 ├── database/       Knex provider
 └── common/         Guards, decorators, utils
```

## Scheduled jobs

| Job                          | Cron                | What it does                                       |
| ---------------------------- | ------------------- | -------------------------------------------------- |
| `daily-employee-report`      | every day 12:00 PM  | Emails every active employee their own day report  |
| `pending-submission-reminder`| every day 6:00 PM   | Emails employees who haven't submitted             |
| `weekly-admin-summary`       | every Monday 12 AM  | Weekly totals to ADMIN_EMAIL                       |
| `monthly-admin-summary`      | 1st of month 8 AM   | Previous month totals to ADMIN_EMAIL               |

Timezone defaults to `Asia/Kolkata` (override with `TZ` env var).

## Auth

- `GET  /auth/google` — redirect-based Google SSO (browser)
- `POST /auth/google` — `{ email, name }` (used by frontend after Google Identity SDK)
- `GET  /auth/me` — returns the authenticated user

The user must already exist in the `employees` table with `is_active=1`.

## Key endpoints

See full list in Swagger. Highlights:

- `POST /daily-tasks` — submit a task (captures `ip_address` automatically)
- `GET  /daily-tasks` — list (employee sees own, admin sees all)
- `GET  /daily-tasks/my/today` — current user, today
- `GET  /reports/daily?type=employee|client|project|pending|activity&date=YYYY-MM-DD`
- `GET  /reports/weekly?from=&to=`
- `GET  /reports/monthly?from=&to=`
- `GET  /analytics/dashboard`

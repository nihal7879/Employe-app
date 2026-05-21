import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface EmailLog {
  id: number;
  email_to: string;
  subject: string;
  email_type: string;
  status: string;
  error_message?: string;
  sent_at?: string;
  created_at: string;
}

export default function EmailLogs() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  useEffect(() => {
    // Reuse a knex-driven generic admin endpoint not built yet — show empty gracefully.
    api.get('/email-logs').then((r) => setLogs(r.data)).catch(() => setLogs([]));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Email Logs</h1>
      <div className="card p-4 overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="table-th">When</th>
            <th className="table-th">To</th>
            <th className="table-th">Subject</th>
            <th className="table-th">Type</th>
            <th className="table-th">Status</th>
          </tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="table-td">{l.sent_at || l.created_at}</td>
                <td className="table-td">{l.email_to}</td>
                <td className="table-td">{l.subject}</td>
                <td className="table-td">{l.email_type}</td>
                <td className="table-td">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    l.status === 'Sent' ? 'bg-green-100 text-green-700'
                    : l.status === 'Failed' ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
                  }`}>{l.status}</span>
                </td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={5} className="table-td text-center text-slate-400">No email logs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

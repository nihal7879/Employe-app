import { ReactNode } from 'react';

export default function StatCard({
  icon, label, value, accent = 'bg-brand-50 text-brand-700',
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  accent?: string;
}) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${accent}`}>
        {icon}
      </div>
      <div>
        <div className="text-sm text-slate-500">{label}</div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

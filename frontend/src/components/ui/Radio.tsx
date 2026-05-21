import { useId } from 'react';

export interface RadioOption {
  label: string;
  value: string;
  description?: string;
}

export function RadioGroup({
  options, value, onChange, name, className = '',
}: {
  options: RadioOption[];
  value: string;
  onChange: (v: string) => void;
  name?: string;
  className?: string;
}) {
  const id = useId();
  const groupName = name || id;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <label
            key={o.value}
            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all
              ${selected ? 'border-brand-500 bg-brand-50/60 shadow-[0_0_0_3px_rgba(124,58,237,0.12)]' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
          >
            <input
              type="radio"
              name={groupName}
              value={o.value}
              checked={selected}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0
              ${selected ? 'border-brand-600' : 'border-slate-300'}`}>
              <span className={`h-2.5 w-2.5 rounded-full transition-all
                ${selected ? 'bg-brand-600 scale-100' : 'bg-transparent scale-0'}`} />
            </span>
            <span className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900">{o.label}</div>
              {o.description && <div className="text-xs text-slate-500 mt-0.5">{o.description}</div>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

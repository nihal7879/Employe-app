import { useId } from 'react';
import { Check } from 'lucide-react';

export default function Checkbox({
  checked, onChange, label, disabled = false, className = '',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={`inline-flex items-center gap-2.5 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      <span className="relative">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className={`h-5 w-5 rounded-md border transition-all flex items-center justify-center
          ${checked ? 'bg-brand-600 border-brand-600 shadow-[0_2px_8px_-2px_rgba(124,58,237,0.5)]' : 'bg-white border-slate-300 hover:border-brand-400'}
          peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/30`}>
          {checked && <Check size={13} strokeWidth={3} className="text-white" />}
        </span>
      </span>
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </label>
  );
}

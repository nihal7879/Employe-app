import { forwardRef, InputHTMLAttributes, ReactNode, useId, useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  icon?: ReactNode;
  rightSlot?: ReactNode;
  floating?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, rightSlot, floating = true, className = '', value, defaultValue, placeholder, ...rest }, ref,
) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const hasValue = (value !== undefined && value !== '') || (defaultValue !== undefined && defaultValue !== '');
  const lifted = floating && (focused || hasValue);

  return (
    <div className="w-full">
      <div className={`relative group rounded-xl border bg-white transition-all
        ${error ? 'border-rose-400 focus-within:border-rose-500 focus-within:shadow-[0_0_0_3px_rgba(244,63,94,0.18)]'
               : 'border-slate-200 focus-within:border-brand-500 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.18)]'}`}
      >
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
        )}
        {floating && label && (
          <label
            htmlFor={id}
            className={`absolute pointer-events-none select-none transition-all bg-white px-1
              ${icon ? 'left-9' : 'left-3'}
              ${lifted
                ? 'top-0 -translate-y-1/2 text-[11px] font-semibold uppercase tracking-wider ' + (error ? 'text-rose-600' : focused ? 'text-brand-600' : 'text-slate-500')
                : 'top-1/2 -translate-y-1/2 text-sm text-slate-400'}`}
          >
            {label}
          </label>
        )}
        <input
          id={id}
          ref={ref}
          value={value}
          defaultValue={defaultValue}
          placeholder={floating ? '' : placeholder}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
          className={`w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400
            ${icon ? 'pl-9' : 'pl-3.5'} ${rightSlot ? 'pr-10' : 'pr-3.5'} py-2.5 outline-none border-0 focus:ring-0 ${className}`}
          {...rest}
        />
        {rightSlot && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</span>
        )}
      </div>
      {error ? (
        <div className="mt-1.5 text-xs text-rose-600 flex items-center gap-1"><AlertCircle size={12} /> {error}</div>
      ) : hint ? (
        <div className="mt-1.5 text-xs text-slate-500">{hint}</div>
      ) : null}
    </div>
  );
});

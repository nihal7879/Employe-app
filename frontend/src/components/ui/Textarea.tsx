import { forwardRef, TextareaHTMLAttributes, useId, useState } from 'react';
import { AlertCircle } from 'lucide-react';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { label, hint, error, value, defaultValue, className = '', ...rest }, ref,
) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const hasValue = (value !== undefined && value !== '') || (defaultValue !== undefined && defaultValue !== '');
  const lifted = focused || hasValue;

  return (
    <div className="w-full">
      <div className={`relative rounded-xl border bg-white transition-all
        ${error ? 'border-rose-400 focus-within:border-rose-500 focus-within:shadow-[0_0_0_3px_rgba(244,63,94,0.18)]'
               : 'border-slate-200 focus-within:border-brand-500 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.18)]'}`}
      >
        {label && (
          <label
            htmlFor={id}
            className={`absolute pointer-events-none transition-all bg-white px-1 left-3
              ${lifted
                ? 'top-0 -translate-y-1/2 text-[11px] font-semibold uppercase tracking-wider ' + (error ? 'text-rose-600' : focused ? 'text-brand-600' : 'text-slate-500')
                : 'top-3 text-sm text-slate-400'}`}
          >
            {label}
          </label>
        )}
        <textarea
          id={id}
          ref={ref}
          value={value}
          defaultValue={defaultValue}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
          className={`w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 px-3.5 py-2.5 outline-none border-0 focus:ring-0 resize-y ${className}`}
          {...rest}
        />
      </div>
      {error ? (
        <div className="mt-1.5 text-xs text-rose-600 flex items-center gap-1"><AlertCircle size={12} /> {error}</div>
      ) : hint ? (
        <div className="mt-1.5 text-xs text-slate-500">{hint}</div>
      ) : null}
    </div>
  );
});

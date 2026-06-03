import { ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Cursor-following tooltip rendered through a portal to document.body, so it is
 * never clipped by a scrollable/overflow-hidden ancestor (e.g. a wide table or
 * the drilldown's overflow-x-auto wrapper). Falls back to rendering children
 * untouched when there's no text.
 */
export function HoverTip({ text, children, className = '' }: { text?: string | null; children: ReactNode; className?: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  if (!text) return <>{children}</>;
  return (
    <span
      className={className || 'contents'}
      onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && createPortal(
        <div
          style={{ position: 'fixed', left: Math.min(pos.x + 14, window.innerWidth - 340), top: pos.y + 16, zIndex: 9999, maxWidth: 320 }}
          className="pointer-events-none rounded-lg bg-slate-900 text-white text-xs leading-relaxed px-3 py-2 shadow-xl whitespace-pre-line dark:bg-slate-700"
        >
          {text}
        </div>,
        document.body,
      )}
    </span>
  );
}

/** Reusable shimmer placeholders shown while data loads. */

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200/80 dark:bg-white/10 ${className}`}
    />
  );
}

const WIDTHS = ['w-20', 'w-32', 'w-40', 'w-24', 'w-28', 'w-16', 'w-36'];

/** Placeholder rows for a table body. Render inside <tbody> while loading. */
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="table-td">
              <Skeleton className={`h-4 ${WIDTHS[(r + c) % WIDTHS.length]}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Placeholder card block — handy for dashboards / stat tiles. */
export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`card p-4 space-y-3 ${className}`}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

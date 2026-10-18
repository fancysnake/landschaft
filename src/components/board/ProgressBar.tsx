export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-100">
      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
    </div>
  );
}

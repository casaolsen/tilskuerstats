// Small warning marker for a match with an attendance-affecting note (e.g. a
// stand closed due to a sanction) — icon + native tooltip, never color alone.
export function NoteBadge({ tooltip, className }: { tooltip: string; className?: string }) {
  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full text-[10px] leading-none font-bold text-white ${className ?? ""}`}
      style={{ background: "var(--status-warning)" }}
      title={tooltip}
      aria-label={tooltip}
    >
      !
    </span>
  );
}

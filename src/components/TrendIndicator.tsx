// Season-over-season % change, shown as an arrow + text — never color alone,
// per the fixed (never themed) status palette.
const FLAT_THRESHOLD = 0.5;

export function TrendIndicator({ pct }: { pct: number | null }) {
  if (pct == null || Math.abs(pct) < FLAT_THRESHOLD) {
    return (
      <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
        –
      </span>
    );
  }

  const isUp = pct > 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-medium tabular-nums"
      style={{ color: isUp ? "var(--status-good)" : "var(--status-critical)" }}
      title={`${isUp ? "Op" : "Ned"} ${Math.abs(pct).toFixed(1)}% ift. forrige sæson`}
    >
      <span aria-hidden>{isUp ? "▲" : "▼"}</span>
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

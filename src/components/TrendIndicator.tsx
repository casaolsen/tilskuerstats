// Season-over-season % change, shown as an arrow + text — never color alone,
// per the fixed (never themed) status palette.
//
// "–" means no previous season to compare against; "0%" means there IS a
// comparison and it rounds to flat — the two must never look identical, or a
// real (if tiny) data point reads as missing data.
export function TrendIndicator({ pct }: { pct: number | null }) {
  if (pct == null) {
    return (
      <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
        –
      </span>
    );
  }

  const rounded = Math.round(pct);
  if (rounded === 0) {
    return (
      <span
        className="text-xs tabular-nums"
        style={{ color: "var(--text-muted)" }}
        title={`${pct.toFixed(1)}% ift. forrige sæson`}
      >
        0%
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
      {Math.abs(rounded)}%
    </span>
  );
}

"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Row = {
  x: number;
  round: number | null;
  seasonLabel: string;
  opponent: string;
  attendance: number | null;
  date: string;
  note?: string | null;
};

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div
      className="rounded-md border px-3 py-2 text-xs shadow-sm"
      style={{ background: "var(--surface-1)", borderColor: "var(--border)", color: "var(--text-primary)" }}
    >
      <div className="font-medium">
        {row.seasonLabel} · {row.round != null ? `Runde ${row.round}` : "Kamp"} vs. {row.opponent}
      </div>
      <div style={{ color: "var(--text-secondary)" }}>{row.date}</div>
      <div className="mt-1 font-medium tabular-nums">
        {row.attendance?.toLocaleString("da-DK") ?? "–"} tilskuere
      </div>
      {row.note && (
        <div className="mt-1 max-w-56" style={{ color: "var(--status-warning)" }}>
          ⚠ {row.note}
        </div>
      )}
    </div>
  );
}

// Larger, warning-colored dot for matches with a note attached; the default
// small dot otherwise.
function CustomDot(props: { cx?: number; cy?: number; payload?: Row }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  if (payload?.note) {
    return <circle cx={cx} cy={cy} r={5} fill="var(--status-warning)" stroke="var(--surface-1)" strokeWidth={1.5} />;
  }
  return <circle cx={cx} cy={cy} r={3} fill="var(--seq-450)" strokeWidth={0} />;
}

export function AttendanceLineChart({ data, xAxisLabel = "Runde" }: { data: Row[]; xAxisLabel?: string }) {
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--gridline)" />
          <XAxis
            dataKey="x"
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            axisLine={{ stroke: "var(--baseline)" }}
            tickLine={false}
            label={{ value: xAxisLabel, position: "insideBottom", offset: -4, fill: "var(--text-muted)", fontSize: 12 }}
          />
          <YAxis
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--baseline)" }} />
          <Line
            type="monotone"
            dataKey="attendance"
            stroke="var(--seq-450)"
            strokeWidth={2}
            dot={<CustomDot />}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

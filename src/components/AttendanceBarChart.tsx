"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Row = { shortName: string | null; name: string; avgAttendance: number | null };

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div
      className="rounded-md border px-3 py-2 text-xs shadow-sm"
      style={{ background: "var(--surface-1)", borderColor: "var(--border)", color: "var(--text-primary)" }}
    >
      <div className="font-medium">{row.name}</div>
      <div style={{ color: "var(--text-secondary)" }}>
        {row.avgAttendance?.toLocaleString("da-DK") ?? "–"} tilskuere/kamp
      </div>
    </div>
  );
}

export function AttendanceBarChart({ data }: { data: Row[] }) {
  return (
    <div style={{ width: "100%", height: 340 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--gridline)" />
          <XAxis
            dataKey="shortName"
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            axisLine={{ stroke: "var(--baseline)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--gridline)" }} />
          <Bar dataKey="avgAttendance" fill="var(--seq-450)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

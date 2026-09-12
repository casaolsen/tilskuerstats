import Link from "next/link";

// Server-rendered — just a row of links toggling the ?season= query param, so
// no client JS is needed. `seasons` is expected newest-first; the newest one
// links back to `basePath` with no query param (that's the default view).
export function SeasonSelector({
  basePath,
  seasons,
  selected,
}: {
  basePath: string;
  seasons: string[];
  selected: string; // a Season.label, or "all"
}) {
  const pill = (label: string, href: string, active: boolean) => (
    <Link
      key={label}
      href={href}
      className="rounded-full border px-3 py-1 text-sm whitespace-nowrap"
      style={{
        borderColor: "var(--border)",
        background: active ? "var(--seq-450)" : "var(--surface-1)",
        color: active ? "#ffffff" : "var(--text-secondary)",
      }}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-wrap gap-2">
      {seasons.map((label, i) =>
        pill(label, i === 0 ? basePath : `${basePath}?season=${encodeURIComponent(label)}`, selected === label)
      )}
      {pill("Alle sæsoner", `${basePath}?season=all`, selected === "all")}
    </div>
  );
}

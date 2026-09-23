import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [countries, leagues, teams, venues, seasons, matches] = await Promise.all([
    prisma.country.count(),
    prisma.league.count(),
    prisma.team.count(),
    prisma.venue.count(),
    prisma.season.count(),
    prisma.match.count(),
  ]);

  const cards = [
    { href: "/admin/countries", label: "Lande", count: countries },
    { href: "/admin/leagues", label: "Ligaer", count: leagues },
    { href: "/admin/teams", label: "Hold", count: teams },
    { href: "/admin/venues", label: "Stadions", count: venues },
    { href: "/admin/seasons", label: "Sæsoner", count: seasons },
    { href: "/admin/matches", label: "Kampe", count: matches },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="rounded-lg border p-5 hover:bg-black/[.02] dark:hover:bg-white/[.03]"
          style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
        >
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>{c.label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{c.count}</div>
        </Link>
      ))}
    </div>
  );
}

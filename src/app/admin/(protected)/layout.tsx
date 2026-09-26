import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

async function logout() {
  "use server";
  (await cookies()).delete("admin_session");
  redirect("/admin/login");
}

const ADMIN_LINKS = [
  { href: "/admin", label: "Oversigt" },
  { href: "/admin/countries", label: "Lande" },
  { href: "/admin/leagues", label: "Ligaer" },
  { href: "/admin/teams", label: "Hold" },
  { href: "/admin/venues", label: "Stadions" },
  { href: "/admin/venue-links", label: "Stadion-links" },
  { href: "/admin/seasons", label: "Sæsoner" },
  { href: "/admin/matches", label: "Kampe" },
  { href: "/admin/quality", label: "Datakvalitet" },
  { href: "/admin/insights", label: "Insights" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <nav
        className="flex flex-wrap items-center gap-4 border-b pb-4"
        style={{ borderColor: "var(--border)" }}
      >
        {ADMIN_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded px-1.5 py-0.5 text-sm transition-colors hover:underline"
            style={{ color: "var(--text-secondary)" }}
          >
            {l.label}
          </Link>
        ))}
        <form action={logout} className="ml-auto">
          <button
            type="submit"
            className="cursor-pointer rounded px-1.5 py-0.5 text-sm transition-colors hover:underline"
            style={{ color: "var(--text-muted)" }}
          >
            Log ud
          </button>
        </form>
      </nav>
      {children}
    </div>
  );
}

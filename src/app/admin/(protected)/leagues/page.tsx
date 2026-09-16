import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { buttonClass, buttonStyle, dangerButtonClass, dangerButtonStyle, inputClass, inputStyle } from "@/lib/admin-ui";
import { slugify } from "@/lib/slugify";
import { ConfirmButton } from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

async function updateLeague(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  await prisma.league.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? ""),
      tier: Number(formData.get("tier") ?? 1) || 1,
      website: String(formData.get("website") ?? "") || null,
      logoUrl: String(formData.get("logoUrl") ?? "") || null,
    },
  });
  revalidatePath("/admin/leagues");
}

async function createLeague(formData: FormData) {
  "use server";
  const countryId = String(formData.get("countryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const tier = Number(formData.get("tier") ?? 1) || 1;
  if (!countryId || !name) return;
  await prisma.league.create({
    data: { countryId, name, tier, slug: `${slugify(name)}-${Date.now().toString(36)}` },
  });
  revalidatePath("/admin/leagues");
}

async function deleteLeague(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const seasonCount = await prisma.season.count({ where: { leagueId: id } });
  if (seasonCount > 0) {
    redirect(`/admin/leagues?deleteError=${encodeURIComponent("Ligaen har sæsoner og kan ikke slettes.")}`);
  }
  await prisma.league.delete({ where: { id } });
  revalidatePath("/admin/leagues");
  redirect("/admin/leagues?deleted=1");
}

export default async function LeaguesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ deleteError?: string; deleted?: string }>;
}) {
  const { deleteError, deleted } = await searchParams;
  const [leagues, countries] = await Promise.all([
    prisma.league.findMany({
      include: { country: true, _count: { select: { seasons: true } } },
      orderBy: [{ country: { code: "asc" } }, { tier: "asc" }],
    }),
    prisma.country.findMany({ orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Ligaer</h1>

      {deleted && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Ligaen er slettet.</p>
      )}
      {deleteError && (
        <p className="text-sm" style={{ color: "#e34948" }}>{deleteError}</p>
      )}

      <div className="overflow-x-auto">
      <div className="flex min-w-[840px] flex-col gap-3">
        {leagues.map((l) => {
          const inUse = l._count.seasons > 0;
          return (
          <div key={l.id} className="flex items-center gap-2">
          <form
            action={updateLeague}
            className="grid flex-1 grid-cols-[60px_1fr_70px_1fr_1fr_auto] items-center gap-2 rounded-lg border p-3"
            style={{ borderColor: "var(--border)" }}
          >
            <input type="hidden" name="id" value={l.id} />
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>{l.country.code}</div>
            <input name="name" defaultValue={l.name} className={inputClass} style={inputStyle} />
            <input
              name="tier"
              type="number"
              min={1}
              defaultValue={l.tier}
              title="Niveau (1 = øverste række)"
              className={inputClass}
              style={inputStyle}
            />
            <input
              name="website"
              defaultValue={l.website ?? ""}
              placeholder="https://..."
              className={inputClass}
              style={inputStyle}
            />
            <input
              name="logoUrl"
              defaultValue={l.logoUrl ?? ""}
              placeholder="Logo-URL"
              className={inputClass}
              style={inputStyle}
            />
            <button type="submit" className={buttonClass} style={buttonStyle}>Gem</button>
          </form>
          <form action={deleteLeague}>
            <input type="hidden" name="id" value={l.id} />
            {inUse ? (
              <button
                type="submit"
                disabled
                title="Ligaen har sæsoner og kan ikke slettes"
                className={dangerButtonClass}
                style={dangerButtonStyle}
              >
                Slet
              </button>
            ) : (
              <ConfirmButton
                confirmText={`Slet ligaen "${l.name}"? Dette kan ikke fortrydes.`}
                className={dangerButtonClass}
                style={dangerButtonStyle}
              >
                Slet
              </ConfirmButton>
            )}
          </form>
          </div>
          );
        })}
      </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Ny liga</h2>
        <form action={createLeague} className="grid grid-cols-[1fr_1fr_70px_auto] gap-2">
          <select name="countryId" required className={inputClass} style={inputStyle}>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input name="name" placeholder="1. Division" required className={inputClass} style={inputStyle} />
          <input name="tier" type="number" min={1} defaultValue={2} className={inputClass} style={inputStyle} />
          <button type="submit" className={buttonClass} style={buttonStyle}>Opret</button>
        </form>
      </section>
    </div>
  );
}

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { buttonClass, buttonStyle, dangerButtonClass, dangerButtonStyle, inputClass, inputStyle } from "@/lib/admin-ui";
import { ConfirmButton } from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

async function updateCountry(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  await prisma.country.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? ""),
      website: String(formData.get("website") ?? "") || null,
    },
  });
  revalidatePath("/admin/countries");
}

async function createCountry(formData: FormData) {
  "use server";
  const code = String(formData.get("code") ?? "").toUpperCase().trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!code || !name) return;
  await prisma.country.create({ data: { code, name } });
  revalidatePath("/admin/countries");
}

async function deleteCountry(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const [leagueCount, teamCount, venueCount] = await Promise.all([
    prisma.league.count({ where: { countryId: id } }),
    prisma.team.count({ where: { countryId: id } }),
    prisma.venue.count({ where: { countryId: id } }),
  ]);
  if (leagueCount > 0 || teamCount > 0 || venueCount > 0) {
    redirect(`/admin/countries?deleteError=${encodeURIComponent("Landet har ligaer, hold eller stadions og kan ikke slettes.")}`);
  }
  await prisma.country.delete({ where: { id } });
  revalidatePath("/admin/countries");
  redirect("/admin/countries?deleted=1");
}

export default async function CountriesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ deleteError?: string; deleted?: string }>;
}) {
  const { deleteError, deleted } = await searchParams;
  const countries = await prisma.country.findMany({
    include: { _count: { select: { leagues: true, teams: true, venues: true } } },
    orderBy: { code: "asc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Lande</h1>

      {deleted && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Landet er slettet.</p>
      )}
      {deleteError && (
        <p className="text-sm" style={{ color: "#e34948" }}>{deleteError}</p>
      )}

      <div className="flex flex-col gap-3">
        {countries.map((c) => {
          const inUse = c._count.leagues + c._count.teams + c._count.venues > 0;
          return (
          <div key={c.id} className="flex items-center gap-2">
          <form
            action={updateCountry}
            className="grid flex-1 grid-cols-[80px_1fr_1fr_auto] items-center gap-2 rounded-lg border p-3"
            style={{ borderColor: "var(--border)" }}
          >
            <input type="hidden" name="id" value={c.id} />
            <div className="text-sm font-mono" style={{ color: "var(--text-muted)" }}>{c.code}</div>
            <input name="name" defaultValue={c.name} className={inputClass} style={inputStyle} />
            <input
              name="website"
              defaultValue={c.website ?? ""}
              placeholder="https://..."
              className={inputClass}
              style={inputStyle}
            />
            <button type="submit" className={buttonClass} style={buttonStyle}>Gem</button>
          </form>
          <form action={deleteCountry}>
            <input type="hidden" name="id" value={c.id} />
            {inUse ? (
              <button
                type="submit"
                disabled
                title="Landet har ligaer, hold eller stadions og kan ikke slettes"
                className={dangerButtonClass}
                style={dangerButtonStyle}
              >
                Slet
              </button>
            ) : (
              <ConfirmButton
                confirmText={`Slet landet "${c.name}"? Dette kan ikke fortrydes.`}
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

      <section>
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Nyt land</h2>
        <form action={createCountry} className="grid grid-cols-[80px_1fr_auto] gap-2">
          <input name="code" placeholder="DK" required maxLength={2} className={inputClass} style={inputStyle} />
          <input name="name" placeholder="Danmark" required className={inputClass} style={inputStyle} />
          <button type="submit" className={buttonClass} style={buttonStyle}>Opret</button>
        </form>
      </section>
    </div>
  );
}

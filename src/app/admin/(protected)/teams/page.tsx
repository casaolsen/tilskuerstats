import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { buttonClass, buttonStyle, inputClass, inputStyle } from "@/lib/admin-ui";
import { slugify } from "@/lib/slugify";

export const dynamic = "force-dynamic";

async function updateTeam(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const homeVenueId = String(formData.get("homeVenueId") ?? "");
  await prisma.team.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? ""),
      shortName: String(formData.get("shortName") ?? "") || null,
      website: String(formData.get("website") ?? "") || null,
      logoUrl: String(formData.get("logoUrl") ?? "") || null,
      homeVenueId: homeVenueId || null,
    },
  });
  revalidatePath("/admin/teams");
}

async function createTeam(formData: FormData) {
  "use server";
  const countryId = String(formData.get("countryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!countryId || !name) return;
  await prisma.team.create({
    data: { countryId, name, slug: `${slugify(name)}-${Date.now().toString(36)}` },
  });
  revalidatePath("/admin/teams");
}

export default async function TeamsAdminPage() {
  const [teams, venues, countries] = await Promise.all([
    prisma.team.findMany({ include: { country: true }, orderBy: [{ country: { code: "asc" } }, { name: "asc" }] }),
    prisma.venue.findMany({ orderBy: { name: "asc" } }),
    prisma.country.findMany({ orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Hold</h1>

      <div className="overflow-x-auto">
      <div className="flex min-w-[900px] flex-col gap-3">
        {teams.map((t) => (
          <form
            key={t.id}
            action={updateTeam}
            className="grid grid-cols-[40px_1.2fr_0.6fr_1fr_1fr_1fr_auto] items-center gap-2 rounded-lg border p-3"
            style={{ borderColor: "var(--border)" }}
          >
            <input type="hidden" name="id" value={t.id} />
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>{t.country.code}</div>
            <input name="name" defaultValue={t.name} className={inputClass} style={inputStyle} />
            <input
              name="shortName"
              defaultValue={t.shortName ?? ""}
              placeholder="Kort navn"
              className={inputClass}
              style={inputStyle}
            />
            <select name="homeVenueId" defaultValue={t.homeVenueId ?? ""} className={inputClass} style={inputStyle}>
              <option value="">— Intet stadion —</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <input
              name="website"
              defaultValue={t.website ?? ""}
              placeholder="https://..."
              className={inputClass}
              style={inputStyle}
            />
            <input
              name="logoUrl"
              defaultValue={t.logoUrl ?? ""}
              placeholder="Logo-URL"
              className={inputClass}
              style={inputStyle}
            />
            <button type="submit" className={buttonClass} style={buttonStyle}>Gem</button>
          </form>
        ))}
      </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Nyt hold</h2>
        <form action={createTeam} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <select name="countryId" required className={inputClass} style={inputStyle}>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input name="name" placeholder="Holdnavn" required className={inputClass} style={inputStyle} />
          <button type="submit" className={buttonClass} style={buttonStyle}>Opret</button>
        </form>
      </section>
    </div>
  );
}

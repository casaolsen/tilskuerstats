import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { buttonClass, buttonStyle, dangerButtonClass, dangerButtonStyle, inputClass, inputStyle } from "@/lib/admin-ui";
import { ConfirmButton } from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

async function updateVenue(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const capacityRaw = String(formData.get("capacity") ?? "");
  await prisma.venue.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? ""),
      city: String(formData.get("city") ?? ""),
      address: String(formData.get("address") ?? "") || null,
      capacity: capacityRaw ? Number(capacityRaw) : null,
      imageUrl: String(formData.get("imageUrl") ?? "") || null,
      website: String(formData.get("website") ?? "") || null,
    },
  });
  revalidatePath("/admin/venues");
}

async function createVenue(formData: FormData) {
  "use server";
  const countryId = String(formData.get("countryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  if (!countryId || !name || !city) return;
  await prisma.venue.create({ data: { countryId, name, city } });
  revalidatePath("/admin/venues");
}

async function deleteVenue(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const [teamCount, matchCount] = await Promise.all([
    prisma.team.count({ where: { homeVenueId: id } }),
    prisma.match.count({ where: { venueId: id } }),
  ]);
  if (teamCount > 0 || matchCount > 0) {
    redirect(`/admin/venues?deleteError=${encodeURIComponent("Stadionet er tilknyttet hold eller kampe og kan ikke slettes.")}`);
  }
  await prisma.venue.delete({ where: { id } });
  revalidatePath("/admin/venues");
  redirect("/admin/venues?deleted=1");
}

export default async function VenuesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ deleteError?: string; deleted?: string }>;
}) {
  const { deleteError, deleted } = await searchParams;
  const [venues, countries] = await Promise.all([
    prisma.venue.findMany({
      include: { country: true, _count: { select: { teams: true, matches: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.country.findMany({ orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Stadions</h1>

      {deleted && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Stadionet er slettet.</p>
      )}
      {deleteError && (
        <p className="text-sm" style={{ color: "#e34948" }}>{deleteError}</p>
      )}

      <div className="overflow-x-auto">
      <div className="flex min-w-[1080px] flex-col gap-3">
        {venues.map((v) => {
          const inUse = v._count.teams + v._count.matches > 0;
          return (
          <div key={v.id} className="flex items-center gap-2">
          <form
            action={updateVenue}
            className="grid flex-1 grid-cols-[1fr_1fr_1.4fr_90px_1fr_1fr_auto] items-center gap-2 rounded-lg border p-3"
            style={{ borderColor: "var(--border)" }}
          >
            <input type="hidden" name="id" value={v.id} />
            <input name="name" defaultValue={v.name} className={inputClass} style={inputStyle} />
            <input name="city" defaultValue={v.city} placeholder="By" className={inputClass} style={inputStyle} />
            <input
              name="address"
              defaultValue={v.address ?? ""}
              placeholder="Adresse"
              className={inputClass}
              style={inputStyle}
            />
            <input
              name="capacity"
              type="number"
              min={0}
              defaultValue={v.capacity ?? ""}
              placeholder="Kapacitet"
              className={inputClass}
              style={inputStyle}
            />
            <input
              name="imageUrl"
              defaultValue={v.imageUrl ?? ""}
              placeholder="Billede-URL"
              className={inputClass}
              style={inputStyle}
            />
            <input
              name="website"
              defaultValue={v.website ?? ""}
              placeholder="https://..."
              className={inputClass}
              style={inputStyle}
            />
            <button type="submit" className={buttonClass} style={buttonStyle}>Gem</button>
          </form>
          <form action={deleteVenue}>
            <input type="hidden" name="id" value={v.id} />
            {inUse ? (
              <button
                type="submit"
                disabled
                title="Stadionet er tilknyttet hold eller kampe og kan ikke slettes"
                className={dangerButtonClass}
                style={dangerButtonStyle}
              >
                Slet
              </button>
            ) : (
              <ConfirmButton
                confirmText={`Slet stadionet "${v.name}"? Dette kan ikke fortrydes.`}
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
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Nyt stadion</h2>
        <form action={createVenue} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
          <select name="countryId" required className={inputClass} style={inputStyle}>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input name="name" placeholder="Stadionnavn" required className={inputClass} style={inputStyle} />
          <input name="city" placeholder="By" required className={inputClass} style={inputStyle} />
          <button type="submit" className={buttonClass} style={buttonStyle}>Opret</button>
        </form>
      </section>
    </div>
  );
}

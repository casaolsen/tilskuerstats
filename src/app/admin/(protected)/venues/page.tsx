import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { buttonClass, buttonStyle, inputClass, inputStyle } from "@/lib/admin-ui";

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

export default async function VenuesAdminPage() {
  const [venues, countries] = await Promise.all([
    prisma.venue.findMany({ include: { country: true }, orderBy: { name: "asc" } }),
    prisma.country.findMany({ orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Stadions</h1>

      <div className="overflow-x-auto">
      <div className="flex min-w-[900px] flex-col gap-3">
        {venues.map((v) => (
          <form
            key={v.id}
            action={updateVenue}
            className="grid grid-cols-[1fr_1fr_1.4fr_90px_1fr_auto] items-center gap-2 rounded-lg border p-3"
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
            <button type="submit" className={buttonClass} style={buttonStyle}>Gem</button>
          </form>
        ))}
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

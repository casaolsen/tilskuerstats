import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { buttonClass, buttonStyle, dangerButtonClass, dangerButtonStyle, inputClass, inputStyle } from "@/lib/admin-ui";
import { ConfirmButton } from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  { value: "official", label: "Officiel (hjemmeside, StadiumDB, ...)" },
  { value: "review", label: "Anmeldelse / video" },
  { value: "other", label: "Andet" },
];

async function createLink(formData: FormData) {
  "use server";
  const venueId = String(formData.get("venueId") ?? "");
  const category = String(formData.get("category") ?? "other");
  const title = String(formData.get("title") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!venueId || !title || !url) return;
  await prisma.venueLink.create({
    data: { venueId, category, title, url, description: description || null },
  });
  revalidatePath("/admin/venue-links");
  redirect(`/admin/venue-links?venue=${venueId}`);
}

async function deleteLink(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const venueId = String(formData.get("venueId"));
  await prisma.venueLink.delete({ where: { id } });
  revalidatePath("/admin/venue-links");
  redirect(`/admin/venue-links?venue=${venueId}`);
}

export default async function VenueLinksAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  const { venue: venueParam } = await searchParams;

  const venues = await prisma.venue.findMany({
    include: { country: true },
    orderBy: [{ country: { code: "asc" } }, { name: "asc" }],
  });
  const selectedVenueId = venueParam ?? venues[0]?.id;
  const selectedVenue = selectedVenueId ? venues.find((v) => v.id === selectedVenueId) : undefined;

  const links = selectedVenueId
    ? await prisma.venueLink.findMany({ where: { venueId: selectedVenueId }, orderBy: { createdAt: "asc" } })
    : [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Stadion-links</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Links vist på stadionsiden — hjemmeside, StadiumDB, anmeldelser og videoer om tilskueroplevelsen.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <select name="venue" defaultValue={selectedVenueId} className={inputClass} style={{ ...inputStyle, maxWidth: 360 }}>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.country.code} · {v.name} ({v.city})
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClass} style={buttonStyle}>Vis</button>
      </form>

      {selectedVenue && (
        <>
          <section>
            <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              {links.length} link(s) for {selectedVenue.name}
            </h2>
            <div className="flex flex-col gap-2">
              {links.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span
                    className="rounded-full border px-2 py-0.5 text-xs whitespace-nowrap"
                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    {CATEGORIES.find((c) => c.value === l.category)?.label ?? l.category}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{l.title}</div>
                    {l.description && (
                      <div className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>{l.description}</div>
                    )}
                    <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>{l.url}</div>
                  </div>
                  <form action={deleteLink}>
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="venueId" value={selectedVenue.id} />
                    <ConfirmButton
                      confirmText={`Slet linket "${l.title}"?`}
                      className={dangerButtonClass}
                      style={dangerButtonStyle}
                    >
                      Slet
                    </ConfirmButton>
                  </form>
                </div>
              ))}
              {links.length === 0 && (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Ingen links endnu.</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Nyt link</h2>
            <form action={createLink} className="grid grid-cols-[1fr_1fr] gap-2">
              <input type="hidden" name="venueId" value={selectedVenue.id} />
              <select name="category" required className={inputClass} style={inputStyle}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <input name="title" placeholder="Titel" required className={inputClass} style={inputStyle} />
              <input
                name="url"
                type="url"
                placeholder="https://..."
                required
                className={`${inputClass} col-span-full`}
                style={inputStyle}
              />
              <input
                name="description"
                placeholder="Beskrivelse (valgfri)"
                className={`${inputClass} col-span-full`}
                style={inputStyle}
              />
              <button type="submit" className={`${buttonClass} col-span-full`} style={buttonStyle}>Opret link</button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}

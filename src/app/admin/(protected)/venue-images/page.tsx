import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { buttonClass, buttonStyle, dangerButtonClass, dangerButtonStyle, inputClass, inputStyle } from "@/lib/admin-ui";
import { ConfirmButton } from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

async function addImage(formData: FormData) {
  "use server";
  const venueId = String(formData.get("venueId") ?? "");
  const mediaAssetId = String(formData.get("mediaAssetId") ?? "");
  if (!venueId || !mediaAssetId) return;

  const existing = await prisma.venueImage.findUnique({
    where: { venueId_mediaAssetId: { venueId, mediaAssetId } },
  });
  if (!existing) {
    const maxOrder = await prisma.venueImage.aggregate({
      where: { venueId },
      _max: { order: true },
    });
    await prisma.venueImage.create({
      data: { venueId, mediaAssetId, order: (maxOrder._max.order ?? -1) + 1 },
    });
  }
  revalidatePath("/admin/venue-images");
  redirect(`/admin/venue-images?venue=${venueId}`);
}

async function updateImage(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const venueId = String(formData.get("venueId"));
  const orderRaw = String(formData.get("order") ?? "0");
  const caption = String(formData.get("caption") ?? "").trim();
  await prisma.venueImage.update({
    where: { id },
    data: { order: Number(orderRaw) || 0, caption: caption || null },
  });
  revalidatePath("/admin/venue-images");
  redirect(`/admin/venue-images?venue=${venueId}`);
}

async function removeImage(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const venueId = String(formData.get("venueId"));
  await prisma.venueImage.delete({ where: { id } });
  revalidatePath("/admin/venue-images");
  redirect(`/admin/venue-images?venue=${venueId}`);
}

export default async function VenueImagesAdminPage({
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

  const [images, folders] = await Promise.all([
    selectedVenueId
      ? prisma.venueImage.findMany({
          where: { venueId: selectedVenueId },
          include: { mediaAsset: true },
          orderBy: { order: "asc" },
        })
      : Promise.resolve([]),
    prisma.mediaFolder.findMany({
      include: { assets: { orderBy: { createdAt: "desc" } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const rootAssets = await prisma.mediaAsset.findMany({
    where: { folderId: null },
    orderBy: { createdAt: "desc" },
  });
  const attachedAssetIds = new Set(images.map((i) => i.mediaAssetId));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Stadion-billeder</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Sæt et stadions billedgalleri sammen fra billeder uploadet i{" "}
          <span className="font-medium">Mediebibliotek</span>.
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
              Galleri for {selectedVenue.name} ({images.length} billede(r))
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {images.map((img) => (
                <div key={img.id} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- Vercel Blob URLs, no image domains configured */}
                  <img
                    src={img.mediaAsset.url}
                    alt={img.caption ?? img.mediaAsset.altText ?? img.mediaAsset.filename}
                    className="h-32 w-full rounded object-cover"
                    style={{ background: "var(--page-plane)" }}
                  />
                  <form action={updateImage} className="flex flex-col gap-2">
                    <input type="hidden" name="id" value={img.id} />
                    <input type="hidden" name="venueId" value={selectedVenue.id} />
                    <div className="flex items-center gap-2">
                      <input
                        name="order"
                        type="number"
                        defaultValue={img.order}
                        title="Rækkefølge (lavest først)"
                        className={inputClass}
                        style={{ ...inputStyle, width: 64 }}
                      />
                      <input
                        name="caption"
                        defaultValue={img.caption ?? ""}
                        placeholder="Billedtekst (valgfri)"
                        className={`${inputClass} flex-1`}
                        style={inputStyle}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="submit" className={buttonClass} style={buttonStyle}>Gem</button>
                      <span className="ml-auto" />
                    </div>
                  </form>
                  <form action={removeImage}>
                    <input type="hidden" name="id" value={img.id} />
                    <input type="hidden" name="venueId" value={selectedVenue.id} />
                    <ConfirmButton
                      confirmText="Fjern billedet fra galleriet? (Selve billedet slettes ikke fra mediebiblioteket.)"
                      className={`${dangerButtonClass} w-full`}
                      style={dangerButtonStyle}
                    >
                      Fjern fra galleri
                    </ConfirmButton>
                  </form>
                </div>
              ))}
              {images.length === 0 && (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Ingen billeder i galleriet endnu.</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Tilføj fra mediebiblioteket
            </h2>
            <form action={addImage} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="venueId" value={selectedVenue.id} />
              <select name="mediaAssetId" required className={inputClass} style={{ ...inputStyle, maxWidth: 420 }}>
                {rootAssets.length > 0 && (
                  <optgroup label="Ingen mappe">
                    {rootAssets.map((a) => (
                      <option key={a.id} value={a.id} disabled={attachedAssetIds.has(a.id)}>
                        {a.filename}{attachedAssetIds.has(a.id) ? " (allerede tilføjet)" : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {folders.map((f) => (
                  <optgroup key={f.id} label={f.name}>
                    {f.assets.map((a) => (
                      <option key={a.id} value={a.id} disabled={attachedAssetIds.has(a.id)}>
                        {a.filename}{attachedAssetIds.has(a.id) ? " (allerede tilføjet)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button type="submit" className={buttonClass} style={buttonStyle}>Tilføj til galleri</button>
              {rootAssets.length === 0 && folders.every((f) => f.assets.length === 0) && (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Ingen billeder i mediebiblioteket endnu — upload et under Mediebibliotek først.
                </p>
              )}
            </form>
          </section>
        </>
      )}
    </div>
  );
}

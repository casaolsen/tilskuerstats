import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { uploadMedia, deleteMedia } from "@/lib/blob";
import { slugify } from "@/lib/slugify";
import { buttonClass, buttonStyle, dangerButtonClass, dangerButtonStyle, inputClass, inputStyle } from "@/lib/admin-ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyButton } from "@/components/CopyButton";

export const dynamic = "force-dynamic";

// A GET query param can't carry `null`, so this stands in for "no folder"
// (the library's root) in the <select> and in server-action form fields.
const ROOT = "__root__";

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function createFolder(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await prisma.mediaFolder.create({
    data: { name, slug: `${slugify(name)}-${Date.now().toString(36)}` },
  });
  revalidatePath("/admin/media");
}

async function deleteFolder(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const assetCount = await prisma.mediaAsset.count({ where: { folderId: id } });
  if (assetCount > 0) {
    redirect(`/admin/media?deleteError=${encodeURIComponent("Mappen indeholder billeder og kan ikke slettes.")}`);
  }
  await prisma.mediaFolder.delete({ where: { id } });
  revalidatePath("/admin/media");
  redirect("/admin/media");
}

async function uploadAsset(formData: FormData) {
  "use server";
  const folderParam = String(formData.get("folderId") ?? ROOT);
  const folderId = folderParam === ROOT ? null : folderParam;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;

  const folder = folderId ? await prisma.mediaFolder.findUnique({ where: { id: folderId } }) : null;
  let url: string, pathname: string;
  try {
    ({ url, pathname } = await uploadMedia(file, folder?.slug ?? null));
  } catch {
    redirect(
      `/admin/media?folder=${folderParam}&deleteError=${encodeURIComponent(
        "Upload fejlede — mangler Vercel Blob er sat op for dette projekt? Se README under 'Billeder'."
      )}`
    );
  }
  const altText = String(formData.get("altText") ?? "").trim();
  await prisma.mediaAsset.create({
    data: {
      folderId,
      url,
      pathname,
      filename: file.name,
      altText: altText || null,
      sizeBytes: file.size,
      mimeType: file.type || null,
    },
  });
  revalidatePath("/admin/media");
  redirect(`/admin/media?folder=${folderParam}`);
}

async function deleteAsset(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const folderParam = String(formData.get("folderParam") ?? ROOT);
  const usageCount = await prisma.venueImage.count({ where: { mediaAssetId: id } });
  if (usageCount > 0) {
    redirect(
      `/admin/media?folder=${folderParam}&deleteError=${encodeURIComponent(
        "Billedet bruges i et stadion-galleri og kan ikke slettes derfra først."
      )}`
    );
  }
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (asset) {
    await deleteMedia(asset.pathname);
    await prisma.mediaAsset.delete({ where: { id } });
  }
  revalidatePath("/admin/media");
  redirect(`/admin/media?folder=${folderParam}`);
}

export default async function MediaAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; deleteError?: string }>;
}) {
  const { folder: folderParam, deleteError } = await searchParams;
  const selected = folderParam ?? ROOT;
  const selectedFolderId = selected === ROOT ? null : selected;

  const [folders, assets, counts] = await Promise.all([
    prisma.mediaFolder.findMany({ orderBy: { name: "asc" } }),
    prisma.mediaAsset.findMany({
      where: { folderId: selectedFolderId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { venueImages: true } } },
    }),
    prisma.mediaAsset.groupBy({ by: ["folderId"], _count: { _all: true } }),
  ]);
  const countByFolder = new Map(counts.map((c) => [c.folderId ?? ROOT, c._count._all]));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Mediebibliotek</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Upload billeder her, og brug dem derefter på fx et stadions billedgalleri under{" "}
          <span className="font-medium">Stadion-billeder</span> i menuen.
        </p>
      </div>

      {deleteError && <p className="text-sm" style={{ color: "#e34948" }}>{deleteError}</p>}

      <form method="get" className="flex flex-wrap items-center gap-2">
        <select name="folder" defaultValue={selected} className={inputClass} style={{ ...inputStyle, maxWidth: 320 }}>
          <option value={ROOT}>Ingen mappe (rod) — {countByFolder.get(ROOT) ?? 0} billede(r)</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} — {countByFolder.get(f.id) ?? 0} billede(r)
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClass} style={buttonStyle}>Vis</button>
      </form>

      <section>
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          {assets.length} billede(r)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a) => {
            const inUse = a._count.venueImages > 0;
            return (
              <div key={a.id} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- Vercel Blob URLs, no image domains configured */}
                <img
                  src={a.url}
                  alt={a.altText ?? a.filename}
                  className="h-36 w-full rounded object-cover"
                  style={{ background: "var(--page-plane)" }}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{a.filename}</div>
                  <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatSize(a.sizeBytes)}
                    {inUse && ` · bruges i ${a._count.venueImages} galleri(er)`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CopyButton value={a.url} className={buttonClass} style={buttonStyle}>
                    Kopiér URL
                  </CopyButton>
                  <form action={deleteAsset} className="ml-auto">
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="folderParam" value={selected} />
                    {inUse ? (
                      <button
                        type="submit"
                        disabled
                        title="Billedet bruges i et stadion-galleri og kan ikke slettes"
                        className={dangerButtonClass}
                        style={dangerButtonStyle}
                      >
                        Slet
                      </button>
                    ) : (
                      <ConfirmButton
                        confirmText={`Slet billedet "${a.filename}"? Dette kan ikke fortrydes.`}
                        className={dangerButtonClass}
                        style={dangerButtonStyle}
                      >
                        Slet
                      </ConfirmButton>
                    )}
                  </form>
                </div>
              </div>
            );
          })}
          {assets.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Ingen billeder i denne mappe endnu.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Upload billede</h2>
        <form action={uploadAsset} className="grid grid-cols-[1fr_1fr] gap-2">
          <select name="folderId" defaultValue={selected} className={inputClass} style={inputStyle}>
            <option value={ROOT}>Ingen mappe (rod)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <input name="altText" placeholder="Alt-tekst (valgfri, for tilgængelighed)" className={inputClass} style={inputStyle} />
          <input
            name="file"
            type="file"
            accept="image/*"
            required
            className={`${inputClass} col-span-full`}
            style={inputStyle}
          />
          <button type="submit" className={`${buttonClass} col-span-full`} style={buttonStyle}>Upload</button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Mapper</h2>
        <div className="flex flex-col gap-2">
          {folders.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="flex-1 text-sm font-medium">{f.name}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{countByFolder.get(f.id) ?? 0} billede(r)</div>
              <form action={deleteFolder}>
                <input type="hidden" name="id" value={f.id} />
                <ConfirmButton
                  confirmText={`Slet mappen "${f.name}"?`}
                  className={dangerButtonClass}
                  style={dangerButtonStyle}
                >
                  Slet
                </ConfirmButton>
              </form>
            </div>
          ))}
          {folders.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Ingen mapper endnu — billeder ligger i roden.</p>
          )}
        </div>
        <form action={createFolder} className="mt-3 flex gap-2">
          <input name="name" placeholder="Ny mappe (fx 'Parken', 'Logoer')" required className={inputClass} style={inputStyle} />
          <button type="submit" className={buttonClass} style={buttonStyle}>Opret mappe</button>
        </form>
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getVenueDetail } from "@/lib/queries";

// Data changes as admins edit it — render fresh per request instead of
// baking it in at build time.
export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<"official" | "review" | "other", string> = {
  official: "Officielle",
  review: "Anmeldelser & oplevelser",
  other: "Andre links",
};

export default async function VenuePage({
  params,
}: {
  params: Promise<{ country: string; venue: string }>;
}) {
  const { country, venue: venueSlug } = await params;
  const data = await getVenueDetail(country, venueSlug);
  if (!data) notFound();

  const { venue, clubs, links } = data;

  // The stadium's own website is a dedicated Venue field, but displays
  // alongside admin-added "official" links (e.g. a StadiumDB profile).
  const officialLinks = [
    ...(venue.website ? [{ title: "Stadionets hjemmeside", description: null as string | null, url: venue.website }] : []),
    ...links.official,
  ];
  const linkGroups = (
    [
      { key: "official" as const, items: officialLinks },
      { key: "review" as const, items: links.review },
      { key: "other" as const, items: links.other },
    ]
  ).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/${country}`} className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
          ← {venue.countryName}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{venue.name}</h1>
        <div className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {venue.city} · {venue.countryName}
          {clubs.length > 0 && (
            <>
              {" · Hjemmebane for "}
              {clubs.map((c, i) => (
                <span key={c.slug}>
                  {i > 0 && (i === clubs.length - 1 ? " og " : ", ")}
                  <Link href={`/${country}/${c.slug}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                </span>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-5" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Kapacitet</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {venue.capacity?.toLocaleString("da-DK") ?? "–"}
          </div>
        </div>
        <div className="rounded-lg border p-5" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Adresse</div>
          <div className="mt-1 text-lg font-medium">{venue.address ?? "–"}</div>
        </div>
      </div>

      {venue.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external, admin-supplied URLs; no image domains configured
        <img
          src={venue.imageUrl}
          alt={venue.name}
          className="w-full rounded-lg border object-cover"
          style={{ borderColor: "var(--border)", maxHeight: 320 }}
        />
      ) : (
        <div
          className="flex items-end rounded-lg border p-5"
          style={{
            borderColor: "var(--border)",
            height: 180,
            background: "linear-gradient(180deg, var(--surface-1), var(--page-plane))",
          }}
        >
          <div>
            <div className="text-sm font-medium">Billedgalleri på vej</div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              Stemningsbilleder fra stadion bliver en del af siden
            </div>
          </div>
        </div>
      )}

      {venue.description && (
        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Om stadion
          </h2>
          <div className="flex flex-col gap-2 text-sm" style={{ maxWidth: "65ch" }}>
            {venue.description.split(/\n+/).map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </section>
      )}

      {venue.transportInfo && (
        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Sådan kommer du frem
          </h2>
          <div className="flex flex-col gap-2 text-sm" style={{ color: "var(--text-secondary)", maxWidth: "65ch" }}>
            {venue.transportInfo.split(/\n+/).map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </section>
      )}

      {linkGroups.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Links
          </h2>
          <div className="flex flex-col gap-4">
            {linkGroups.map((group) => (
              <div key={group.key} className="flex flex-col gap-2">
                <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  {CATEGORY_LABELS[group.key]}
                </div>
                {group.items.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border p-3 transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03]"
                    style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
                  >
                    <div className="text-sm font-medium">{link.title}</div>
                    {link.description && (
                      <div className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                        {link.description}
                      </div>
                    )}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {clubs.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Klubber på stadion
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {clubs.map((c) => (
              <Link
                key={c.slug}
                href={`/${country}/${c.slug}`}
                className="rounded-lg border p-4 transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03]"
                style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
              >
                <div className="text-sm font-medium">{c.name}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

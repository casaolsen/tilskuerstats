import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { buttonClass, buttonStyle, inputClass, inputStyle } from "@/lib/admin-ui";

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

export default async function CountriesAdminPage() {
  const countries = await prisma.country.findMany({ orderBy: { code: "asc" } });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Lande</h1>

      <div className="flex flex-col gap-3">
        {countries.map((c) => (
          <form
            key={c.id}
            action={updateCountry}
            className="grid grid-cols-[80px_1fr_1fr_auto] items-center gap-2 rounded-lg border p-3"
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
        ))}
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

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { buttonClass, buttonStyle, dangerButtonClass, dangerButtonStyle, inputClass, inputStyle } from "@/lib/admin-ui";
import { countNewMatches, NEW_MATCH_WINDOW_DAYS, runInsights } from "@/insights/run";
import type { Evidence } from "@/insights/agent";

export const dynamic = "force-dynamic";
// "Kør agenten nu" kører agenten direkte i server-actionen - giv den tid nok.
export const maxDuration = 300;

const STATUSES = [
  { value: "pending", label: "Afventer" },
  { value: "approved", label: "Godkendt" },
  { value: "rejected", label: "Afvist" },
];

const KIND_LABELS: Record<string, string> = {
  record: "Rekord", outlier: "Afvigelse", trend: "Udvikling", milestone: "Milepæl", other: "Andet",
};

async function runNow() {
  "use server";
  let params: string;
  try {
    const r = await runInsights();
    params = `ran=${r.status}&drafts=${r.drafts}&matches=${r.newMatches}`;
  } catch (e) {
    params = `runError=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`;
  }
  revalidatePath("/admin/insights");
  redirect(`/admin/insights?${params}`);
}

// Sender en kørsels kampe tilbage til agenten, så den kan køre på dem igen -
// fx efter en fejl, eller for at se om en ændring i prompt/værktøjer hjælper.
async function requeueRun(formData: FormData) {
  "use server";
  const run = await prisma.insightRun.findUniqueOrThrow({ where: { id: String(formData.get("runId")) } });
  await prisma.match.updateMany({
    where: { id: { in: run.matchIds as string[] } },
    data: { insightCheckedAt: null },
  });
  revalidatePath("/admin/insights");
}

async function review(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const headline = String(formData.get("headline") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  await prisma.insightDraft.update({
    where: { id },
    data: {
      status,
      reviewNote: note,
      reviewedAt: status === "pending" ? null : new Date(),
      // Du kan rette teksten, før du godkender.
      ...(headline ? { headline } : {}),
      ...(body ? { body } : {}),
    },
  });
  revalidatePath("/admin/insights");
}

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-xs" style={{ color: "var(--text-muted)" }}>{children}</span>;
}

const fmt = (d: Date) =>
  d.toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", dateStyle: "medium", timeStyle: "short" });

export default async function InsightsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ran?: string; drafts?: string; matches?: string; runError?: string }>;
}) {
  const { status = "pending", ran, drafts: draftCount, matches: matchCount, runError } = await searchParams;
  const [drafts, counts, runs, waiting] = await Promise.all([
    prisma.insightDraft.findMany({ where: { status }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.insightDraft.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.insightRun.findMany({ orderBy: { startedAt: "desc" }, take: 10, include: { _count: { select: { drafts: true } } } }),
    countNewMatches(),
  ]);
  const countBy = new Map(counts.map((c) => [c.status, c._count._all]));
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Insights</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          AI-agenten gennemgår nye Superliga-kampe og skriver udkast. Intet vises på sitet, før du godkender det.
          Den kører automatisk mandag aften efter scraperen.
        </p>
      </div>

      <Box>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <strong className="tabular-nums">{waiting}</strong> nye kampe venter på agenten
            <br />
            <Muted>Kampe fra de seneste {NEW_MATCH_WINDOW_DAYS} dage, som agenten ikke har set endnu.</Muted>
          </div>
          <form action={runNow}>
            <button type="submit" className={buttonClass} style={buttonStyle} disabled={!hasKey || waiting === 0}>
              Kør agenten nu
            </button>
          </form>
        </div>
        {!hasKey && (
          <p className="mt-3 text-sm" style={{ color: "var(--status-critical)" }}>
            ⚠ ANTHROPIC_API_KEY er ikke sat i Vercel. Se README under &quot;Insight-agent&quot;.
          </p>
        )}
        {ran && (
          <p className="mt-3 text-sm">
            ✓ Kørsel færdig: {ran === "nothing_new" ? "ingen nye kampe" : `${ran}, ${matchCount} kampe gennemgået, ${draftCount} nye udkast`}.
          </p>
        )}
        {runError && (
          <p className="mt-3 text-sm" style={{ color: "var(--status-critical)" }}>⚠ Fejl: {runError}</p>
        )}
      </Box>

      <nav className="flex gap-4 text-sm">
        {STATUSES.map((s) => (
          <Link
            key={s.value}
            href={`/admin/insights?status=${s.value}`}
            className={s.value === status ? "font-semibold underline" : "hover:underline"}
          >
            {s.label} ({countBy.get(s.value) ?? 0})
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-4">
        {drafts.length === 0 && <Muted>Ingen udkast her.</Muted>}
        {drafts.map((d) => {
          const evidence = d.evidence as unknown as Evidence[];
          return (
            <Box key={d.id}>
              <div className="flex items-baseline justify-between gap-2">
                <Muted>{KIND_LABELS[d.kind] ?? d.kind} · {fmt(d.createdAt)}</Muted>
                {d.reviewedAt && <Muted>Behandlet {fmt(d.reviewedAt)}</Muted>}
              </div>

              {d.status === "pending" ? (
                <form action={review} className="mt-2 flex flex-col gap-2">
                  <input type="hidden" name="id" value={d.id} />
                  <input name="headline" defaultValue={d.headline} className={`${inputClass} font-medium`} style={inputStyle} />
                  <textarea name="body" defaultValue={d.body} rows={3} className={inputClass} style={inputStyle} />
                  <input
                    name="note"
                    placeholder="Note til agenten (valgfri) - fx hvorfor du afviser"
                    className={inputClass}
                    style={inputStyle}
                  />
                  <div className="flex gap-2">
                    <button type="submit" name="status" value="approved" className={buttonClass} style={buttonStyle}>
                      Godkend
                    </button>
                    <button type="submit" name="status" value="rejected" className={dangerButtonClass} style={dangerButtonStyle}>
                      Afvis
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-2">
                  <h2 className="font-medium">{d.headline}</h2>
                  <p className="mt-1 text-sm">{d.body}</p>
                  {d.reviewNote && <p className="mt-2"><Muted>Note: {d.reviewNote}</Muted></p>}
                  <form action={review} className="mt-2">
                    <input type="hidden" name="id" value={d.id} />
                    <button type="submit" name="status" value="pending" className="text-xs underline" style={{ color: "var(--text-muted)" }}>
                      Flyt tilbage til afventer
                    </button>
                  </form>
                </div>
              )}

              <details className="mt-3">
                <summary className="cursor-pointer text-xs" style={{ color: "var(--text-secondary)" }}>
                  Beviser ({evidence.length}) - de værktøjskald, tallene kommer fra
                </summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {evidence.map((e, i) => (
                    <li key={i} className="text-sm">
                      {e.claim}
                      <br />
                      <Muted>{e.tool}({JSON.stringify(e.input)})</Muted>
                      <details>
                        <summary className="cursor-pointer text-xs" style={{ color: "var(--text-muted)" }}>Vis rå data</summary>
                        <pre className="mt-1 max-h-64 overflow-auto rounded p-2 text-xs" style={{ background: "var(--page-plane)" }}>
                          {JSON.stringify(e.result, null, 2)}
                        </pre>
                      </details>
                    </li>
                  ))}
                </ul>
              </details>
            </Box>
          );
        })}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Seneste kørsler</h2>
        <Muted>Her kan du se, hvad agenten undersøgte, og hvorfor den skrev (eller ikke skrev) udkast.</Muted>
        {runs.length === 0 && <Muted>Agenten har ikke kørt endnu.</Muted>}
        {runs.map((r) => {
          const toolCalls = (r.toolCalls ?? []) as { turn: number; name: string; input: unknown; isError: boolean; output: string }[];
          const usage = r.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } | null;
          return (
            <details key={r.id} className="rounded border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
              <summary className="cursor-pointer">
                {fmt(r.startedAt)} · <strong>{r.status}</strong> · {(r.matchIds as string[]).length} kampe · {r._count.drafts} udkast
                {usage && (
                  <Muted> · {usage.input_tokens ?? 0} + {usage.cache_read_input_tokens ?? 0} cachede input-tokens, {usage.output_tokens ?? 0} output-tokens</Muted>
                )}
              </summary>
              {r.summary && <p className="mt-2 whitespace-pre-wrap">{r.summary}</p>}
              <ol className="mt-2 flex flex-col gap-1">
                {toolCalls.map((t, i) => (
                  <li key={i} className="text-xs">
                    <span style={{ color: t.isError ? "var(--status-critical)" : "var(--text-secondary)" }}>
                      {t.isError ? "✗" : "✓"} {t.name}({JSON.stringify(t.input)})
                    </span>
                    {t.isError && <div style={{ color: "var(--status-critical)" }}>{t.output}</div>}
                  </li>
                ))}
              </ol>
              <div className="mt-2 flex items-center justify-between gap-2">
                <Muted>Model: {r.model}</Muted>
                <form action={requeueRun}>
                  <input type="hidden" name="runId" value={r.id} />
                  <button type="submit" className="text-xs underline" style={{ color: "var(--text-secondary)" }}>
                    Giv disse kampe til agenten igen
                  </button>
                </form>
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}

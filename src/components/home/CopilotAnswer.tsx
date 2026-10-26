import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Braces,
  ChevronDown,
  Database,
  FlaskConical,
  Globe2,
  Info,
  Languages,
  Layers,
  MapPin,
  Satellite,
  Scale,
  Sparkles,
} from "lucide-react";
import type { ActionChip } from "@/copilot/actions";
import type { DataResult, EvidenceItem } from "@/server/copilot-data";
import type { PolicyQuote } from "@/server/policy-context";
import type { CopilotMeta } from "./CopilotBlocks";

// ---------------------------------------------------------------------------
// Provenance vocabulary (one colour per kind, used for dots, pills and tags)
// ---------------------------------------------------------------------------

const PROV: Record<string, { label: string; dot: string; pill: string; icon: typeof Database }> = {
  document: {
    label: "Official text",
    dot: "bg-emerald-600",
    pill: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    icon: Scale,
  },
  live: {
    label: "Live data",
    dot: "bg-sky-500",
    pill: "bg-sky-50 text-sky-800 ring-sky-200",
    icon: Satellite,
  },
  platform: {
    label: "Platform data",
    dot: "bg-green-600",
    pill: "bg-green-50 text-green-800 ring-green-200",
    icon: Database,
  },
  demo: {
    label: "Demo data",
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-800 ring-amber-200",
    icon: Database,
  },
  reference: {
    label: "Catalogue",
    dot: "bg-violet-500",
    pill: "bg-violet-50 text-violet-800 ring-violet-200",
    icon: Globe2,
  },
  unavailable: {
    label: "Not connected",
    dot: "bg-slate-400",
    pill: "bg-slate-100 text-slate-600 ring-slate-200",
    icon: Info,
  },
  ai: {
    label: "AI wording",
    dot: "bg-slate-400",
    pill: "bg-slate-50 text-slate-600 ring-slate-200",
    icon: Sparkles,
  },
};
const prov = (p: string) => PROV[p] ?? PROV["ai"]!;

function ProvTag({ p }: { p: string }) {
  const m = prov(p);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${m.pill}`}
    >
      <i className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Policy card — the visual for answers grounded in Act / policy text
// ---------------------------------------------------------------------------

const GROUNDING: Record<
  PolicyQuote["method"],
  { label: string; bar: string; dot: string; text: string }
> = {
  explicit: {
    label: "Stated in text",
    bar: "border-l-emerald-500",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
  },
  derived: {
    label: "Derived from text",
    bar: "border-l-sky-500",
    dot: "bg-sky-500",
    text: "text-sky-700",
  },
  inferred: {
    label: "Modelling value",
    bar: "border-l-amber-400",
    dot: "bg-amber-400",
    text: "text-amber-700",
  },
};

function QuoteBlock({ q }: { q: PolicyQuote }) {
  const [open, setOpen] = useState(false);
  const g = GROUNDING[q.method];
  const long = q.quote.length > 220;
  return (
    <figure
      className={`rounded-xl border border-slate-200 border-l-[3px] ${g.bar} bg-white px-3 py-2.5`}
    >
      <figcaption className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10.5px] font-semibold text-white">
          {q.clause}
        </span>
        {q.page > 0 && (
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-600">
            p. {q.page}
          </span>
        )}
        <span
          className={`ml-auto inline-flex items-center gap-1 text-[10.5px] font-semibold ${g.text}`}
        >
          <i className={`h-1.5 w-1.5 rounded-full ${g.dot}`} />
          {g.label}
        </span>
      </figcaption>
      <blockquote
        className={`text-[12.5px] leading-relaxed text-slate-700 ${open ? "" : "line-clamp-4"}`}
      >
        “{q.quote}”
      </blockquote>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-[11px] font-semibold text-emerald-700 hover:underline"
        >
          {open ? "Show less" : "Read full clause"}
        </button>
      )}
      {q.method === "inferred" && q.parameter && (
        <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-800">
          Policy Lab uses{" "}
          <b>
            {q.parameter} = {q.value}
          </b>{" "}
          here — a modelling choice, not a figure in the document.
        </p>
      )}
    </figure>
  );
}

function PolicyCard({ result }: { result: DataResult }) {
  const [more, setMore] = useState(false);
  const quotes = result.quotes ?? [];
  if (!quotes.length) {
    // No match: show what the library does hold
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-slate-800">
          <Scale className="h-4 w-4 text-emerald-700" /> Policy Lab library
        </div>
        <p className="text-[12px] leading-snug text-slate-600">{result.headline}</p>
        {result.table && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {result.table.rows.map((r) => (
              <li
                key={r[0]}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] text-slate-600"
              >
                {r[0]}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  const main = quotes[0]!.policy;
  const mainQuotes = quotes.filter((q) => q.policy === main);
  const others = Array.from(
    new Set(quotes.filter((q) => q.policy !== main).map((q) => q.shortName)),
  );
  const shown = more ? mainQuotes : mainQuotes.slice(0, 2);
  const tracked = result.rows?.[0]?.value.split("tracked in Policy Lab:")[1]?.trim();
  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/70 via-white to-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex items-start gap-2.5 px-3 pt-3 pb-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-800 text-white shadow-sm">
          <Scale className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-[13.5px] font-semibold leading-snug text-slate-900">{main}</h4>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">
            {quotes[0]!.reference}
          </p>
        </div>
        <ProvTag p="document" />
      </header>

      <div className="space-y-2 px-3 pb-3">
        {shown.map((q, i) => (
          <QuoteBlock key={`${q.clause}-${i}`} q={q} />
        ))}
        {mainQuotes.length > 2 && (
          <button
            type="button"
            onClick={() => setMore((m) => !m)}
            className="flex w-full items-center justify-center gap-1 rounded-lg py-1 text-[11.5px] font-semibold text-emerald-800 hover:bg-emerald-50"
          >
            {more
              ? "Show fewer excerpts"
              : `Show ${mainQuotes.length - 2} more excerpt${mainQuotes.length - 2 > 1 ? "s" : ""}`}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${more ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      {(tracked || others.length > 0) && (
        <dl className="space-y-1.5 border-t border-emerald-100 bg-white/70 px-3 py-2.5 text-[11px]">
          {tracked && (
            <div className="flex gap-2">
              <dt className="w-[74px] shrink-0 text-slate-400">Measured by</dt>
              <dd className="text-slate-700">{tracked}</dd>
            </div>
          )}
          {others.length > 0 && (
            <div className="flex gap-2">
              <dt className="w-[74px] shrink-0 text-slate-400">Also relevant</dt>
              <dd className="flex flex-wrap gap-1">
                {others.map((o) => (
                  <span
                    key={o}
                    className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700"
                  >
                    {o}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}

      <a
        href="/policy-lab?mode=existing"
        className="flex items-center justify-between gap-2 border-t border-emerald-100 bg-emerald-800 px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-900"
      >
        <span className="flex items-center gap-1.5">
          <FlaskConical className="h-3.5 w-3.5" /> Simulate this instrument in Policy Lab
        </span>
        <ArrowUpRight className="h-4 w-4" />
      </a>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Compact data card for GIS / indicator results
// ---------------------------------------------------------------------------

function DataCard({ d }: { d: DataResult }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-semibold leading-snug text-slate-800">{d.label}</span>
        <ProvTag p={d.provenance} />
      </div>
      <p className="mt-1 text-[12px] leading-snug text-slate-600">{d.headline}</p>
      {d.table && (
        <table className="mt-2 w-full text-[11px]">
          <thead>
            <tr className="text-slate-400">
              {d.table.columns.map((c, k) => (
                <th key={c} className={`pb-1 font-medium ${k === 0 ? "text-left" : "text-right"}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.table.rows.slice(0, 5).map((r, k) => (
              <tr key={k} className="border-t border-slate-100">
                {r.map((c, j) => (
                  <td
                    key={j}
                    className={`py-1 tabular-nums ${j === 0 ? "text-left text-slate-700" : "text-right font-semibold text-slate-900"}`}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {d.rows && !d.table && (
        <dl className="mt-2 space-y-1 text-[11px]">
          {d.rows.slice(0, 4).map((r, k) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="truncate text-slate-500">{r.label}</dt>
              <dd
                className={`truncate text-right ${r.emphasis ? "font-semibold text-emerald-800" : "font-medium text-slate-800"}`}
              >
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {d.note && (
        <p className="mt-2 rounded-md bg-slate-50 px-2 py-1 text-[10.5px] leading-snug text-slate-500">
          {d.note}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Answer
// ---------------------------------------------------------------------------

const STEP_LABEL: Record<string, string> = {
  detect_language: "Language",
  plan: "Understand",
  validate: "Validate",
  query_data: "Query data",
  explain: "Explain",
  act: "Act",
};

function riskLevel(text: string) {
  if (/high|उच्च|ज़्यादा|अधिक|जास्त/i.test(text)) return { n: 3, label: "High", c: "bg-red-500" };
  if (/moderate|medium|मध्यम/i.test(text)) return { n: 2, label: "Moderate", c: "bg-amber-500" };
  return { n: 1, label: "Low", c: "bg-emerald-600" };
}

const policyHasQuotes = (meta: CopilotMeta) =>
  !!meta.data?.some((d) => d.dataset === "policy_library" && (d.quotes?.length ?? 0) > 0);

export interface CopilotAnswerProps {
  summary: string;
  riskAssessment: string;
  framework: string[];
  limitation: string;
  /** Structured evidence classes returned by the agent (may be absent). */
  evidenceBreakdown?: { section: string; detail: string }[] | undefined;
  meta: CopilotMeta;
  onChip: (c: ActionChip) => void;
}

const BREAKDOWN_TONE: Record<string, string> = {
  OBSERVED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  DERIVED: "border-sky-200 bg-sky-50 text-sky-800",
  "LEGAL EVIDENCE": "border-indigo-200 bg-indigo-50 text-indigo-800",
  INTERPRETATION: "border-amber-200 bg-amber-50 text-amber-800",
  LIMITATIONS: "border-rose-200 bg-rose-50 text-rose-800",
  SOURCES: "border-slate-200 bg-slate-50 text-slate-700",
};
const DEFAULT_BREAKDOWN_TONE = BREAKDOWN_TONE["SOURCES"];

export function CopilotAnswer({
  summary,
  riskAssessment,
  framework,
  limitation,
  evidenceBreakdown,
  meta,
  onChip,
}: CopilotAnswerProps) {
  const [showMoreData, setShowMoreData] = useState(false);
  const data = meta.data ?? [];
  const policy = data.find((d) => d.dataset === "policy_library");
  // Primary visuals: real measurements first; catalogue / not-connected results go to the drawer
  const primary = data.filter(
    (d) => d !== policy && d.provenance !== "unavailable" && d.provenance !== "reference",
  );
  const secondary = data.filter(
    (d) => d !== policy && (d.provenance === "unavailable" || d.provenance === "reference"),
  );
  const visible = showMoreData ? primary : primary.slice(0, policy ? 1 : 2);
  const warnings = (meta.validation ?? []).filter((n) => n.level === "warning");
  const infos = (meta.validation ?? []).filter((n) => n.level !== "warning");
  const evidence: EvidenceItem[] = meta.evidence ?? [];
  const sourcePills = evidence.filter((e) => e.provenance !== "ai");
  // the policy card carries its own Policy Lab button
  const chips = (meta.chips ?? []).filter((c) => !(c.id === "policy-lab" && policyHasQuotes(meta)));
  const loc = meta.plan?.location;
  const showRisk = riskAssessment.trim() && !policy;
  const risk = riskLevel(riskAssessment);

  return (
    <div className="space-y-3">
      {/* context line */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
        {meta.language && (
          <span
            className="inline-flex items-center gap-1"
            title={`Language auto-detected (${meta.language.method})`}
          >
            <Languages className="h-3 w-3" /> {meta.language.native}
          </span>
        )}
        {loc && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {loc.name}
            {loc.state && loc.state !== loc.name ? `, ${loc.state}` : ""}
            {meta.plan?.compare_with ? ` vs ${meta.plan.compare_with.name}` : ""}
          </span>
        )}
        {meta.plan?.from_year && meta.plan.to_year && (
          <span>
            {meta.plan.from_year}–{meta.plan.to_year}
          </span>
        )}
        {policy && (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <Scale className="h-3 w-3" /> Policy Lab library
          </span>
        )}
      </div>

      {/* the answer */}
      <p className="select-text text-[14px] leading-[1.6] text-slate-800">{summary}</p>

      {warnings.map((n, i) => (
        <p
          key={i}
          className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11.5px] leading-snug text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {n.text}
        </p>
      ))}

      {showRisk && (
        <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
          <div className="pt-0.5">
            <div className="flex gap-0.5" aria-hidden="true">
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-3 w-1.5 rounded-sm ${i <= risk.n ? risk.c : "bg-slate-200"}`}
                />
              ))}
            </div>
          </div>
          <p className="text-[12px] leading-snug text-slate-600">
            <b className="font-semibold text-slate-800">{risk.label} risk · </b>
            <span className="line-clamp-2 inline">{riskAssessment}</span>
          </p>
        </div>
      )}

      {/* primary visual */}
      {policy && <PolicyCard result={policy} />}
      {visible.map((d, i) => (
        <DataCard key={`${d.dataset}-${i}`} d={d} />
      ))}
      {primary.length > visible.length && (
        <button
          type="button"
          onClick={() => setShowMoreData(true)}
          className="w-full rounded-lg py-1 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        >
          Show {primary.length - visible.length} more data result
          {primary.length - visible.length > 1 ? "s" : ""}
        </button>
      )}

      {(meta.applied?.length ?? 0) > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11.5px] leading-snug text-emerald-900">
          <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
          <span>
            <b className="font-semibold">Map updated · </b>
            {meta.applied!.join(" · ")}
          </span>
        </p>
      )}

      {/* structured evidence classes — what is proven vs inferred */}
      {(evidenceBreakdown?.length ?? 0) > 0 && (
        <div className="space-y-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            Evidence classes
          </span>
          <ul className="space-y-1">
            {evidenceBreakdown!.map((b, i) => (
              <li
                key={`${b.section}-${i}`}
                className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 ${BREAKDOWN_TONE[b.section] ?? DEFAULT_BREAKDOWN_TONE}`}
              >
                <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wide">
                  {b.section}
                </span>
                <span className="min-w-0 flex-1 text-[11.5px] leading-snug">{b.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* sources at a glance */}
      {sourcePills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            Sources
          </span>
          {sourcePills.slice(0, 2).map((e, i) => {
            const m = prov(e.provenance);
            return (
              <span
                key={i}
                title={`${e.label} — ${e.detail}`}
                className={`inline-flex max-w-[150px] items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ${m.pill}`}
              >
                <i className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`} />
                <span className="truncate">{e.label}</span>
              </span>
            );
          })}
          {sourcePills.length > 2 && (
            <span className="text-[10.5px] font-medium text-slate-400">
              +{sourcePills.length - 2}
            </span>
          )}
        </div>
      )}

      {/* actions */}
      {chips.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {chips.map((c) => {
            const lead = c.id === "policy-lab";
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChip(c)}
                className={`inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-medium transition-colors ${
                  lead
                    ? "bg-emerald-800 text-white hover:bg-emerald-900"
                    : "border border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900"
                }`}
              >
                {c.id === "policy-lab" ? (
                  <FlaskConical className="h-3 w-3" />
                ) : c.kind === "action" ? (
                  <Layers className="h-3 w-3" />
                ) : c.kind === "link" ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : null}
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {/* everything technical lives in one drawer */}
      <details className="group rounded-xl border border-slate-200 bg-slate-50/50">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[11.5px] font-medium text-slate-500 hover:text-slate-700">
          <Braces className="h-3.5 w-3.5" /> How this answer was made
          <span className="ml-auto text-slate-400">{evidence.length} sources</span>
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t border-slate-200 px-3 py-3 text-[11.5px]">
          {(meta.pipeline?.length ?? 0) > 0 && (
            <ol className="flex flex-wrap gap-1">
              {meta.pipeline!.map((p) => (
                <li
                  key={p.step}
                  className="rounded-md bg-white px-1.5 py-0.5 text-[10.5px] text-slate-600 ring-1 ring-inset ring-slate-200"
                >
                  {STEP_LABEL[p.step] ?? p.step} <span className="text-slate-400">{p.ms} ms</span>
                </li>
              ))}
            </ol>
          )}
          <ul className="space-y-1.5">
            {evidence.map((e, i) => {
              const m = prov(e.provenance);
              const Icon = m.icon;
              return (
                <li key={i} className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 leading-snug text-slate-700">
                    {e.label}
                    <span className="block text-[10.5px] text-slate-400">{e.detail}</span>
                  </span>
                  <ProvTag p={e.provenance} />
                </li>
              );
            })}
          </ul>
          {secondary.map((d, i) => (
            <p key={i} className="leading-snug text-slate-500">
              <b className="font-semibold text-slate-600">{d.label}: </b>
              {d.headline}
            </p>
          ))}
          {framework.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-slate-600">
              {framework.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
          {infos.map((n, i) => (
            <p key={i} className="flex items-start gap-1.5 text-slate-500">
              <Info className="mt-0.5 h-3 w-3 shrink-0" /> {n.text}
            </p>
          ))}
          {limitation.trim() && <p className="leading-snug text-slate-500">{limitation}</p>}
          {meta.plan && (
            <pre className="overflow-x-auto rounded-lg bg-slate-900 p-2.5 text-[10px] leading-relaxed text-emerald-100">
              {JSON.stringify(
                {
                  intent: meta.plan.intent,
                  location: meta.plan.location?.name ?? null,
                  state: meta.plan.location?.state ?? null,
                  years: meta.plan.from_year ? [meta.plan.from_year, meta.plan.to_year] : null,
                  classes: meta.plan.from_class ? [meta.plan.from_class, meta.plan.to_class] : null,
                  datasets: meta.plan.datasets,
                  topic: meta.plan.topic,
                  map_action: meta.plan.map_action,
                },
                null,
                2,
              )}
            </pre>
          )}
        </div>
      </details>
    </div>
  );
}

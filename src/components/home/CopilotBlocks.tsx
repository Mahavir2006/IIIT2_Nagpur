import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Braces,
  Check,
  CheckCircle2,
  Database,
  Globe2,
  Info,
  Languages,
  Layers,
  Loader2,
  MapPin,
  Satellite,
  Sparkles,
} from "lucide-react";
import type { QueryPlan, ValidationNote } from "@/copilot/plan";
import type { ActionChip } from "@/copilot/actions";
import type { DataResult, EvidenceItem } from "@/server/copilot-data";

/** Extra copilot fields returned by POST /api/ai (all optional for older replies). */
export interface CopilotMeta {
  language?:
    | {
        code: string;
        name: string;
        native: string;
        bcp47: string;
        confidence: number;
        method: string;
      }
    | undefined;
  plan?: QueryPlan;
  validation?: ValidationNote[];
  data?: DataResult[];
  evidence?: EvidenceItem[];
  chips?: ActionChip[];
  pipeline?: { step: string; ms: number }[];
  /** Map actions actually performed on the client */
  applied?: string[];
}

const PROVENANCE: Record<string, { label: string; cls: string }> = {
  live: { label: "Live data", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  platform: { label: "Platform data", cls: "bg-green-50 text-green-700 border-green-200" },
  demo: { label: "Demo data", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  reference: { label: "Catalogue", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  unavailable: { label: "Not connected", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  ai: { label: "AI explanation", cls: "bg-slate-50 text-slate-600 border-slate-200" },
};

const Tag = ({ p }: { p: string }) => {
  const m = PROVENANCE[p] ?? PROVENANCE["ai"]!;
  return (
    <span
      className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${m.cls}`}
    >
      {m.label}
    </span>
  );
};

const STEPS = [
  { key: "ask", label: "Ask" },
  { key: "plan", label: "Understand" },
  { key: "validate", label: "Validate" },
  { key: "query_data", label: "Query data" },
  { key: "explain", label: "Explain" },
  { key: "evidence", label: "Evidence" },
  { key: "act", label: "Act on map" },
];

/** Ask → Understand → Validate → Query data → Explain → Evidence → Act */
export function PipelineStrip({ meta }: { meta: CopilotMeta }) {
  const ms = Object.fromEntries((meta.pipeline ?? []).map((p) => [p.step, p.ms]));
  const acted = (meta.applied?.length ?? 0) > 0;
  return (
    <ol
      className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[9.5px] font-bold uppercase tracking-wide text-slate-400"
      aria-label="Copilot pipeline"
    >
      {STEPS.map((s, i) => {
        const done =
          s.key === "act" ? acted : s.key === "evidence" ? (meta.evidence?.length ?? 0) > 0 : true;
        return (
          <li
            key={s.key}
            className="flex items-center gap-1"
            title={ms[s.key] != null ? `${ms[s.key]} ms` : undefined}
          >
            {i > 0 && <span className="text-slate-300">›</span>}
            <span
              className={`inline-flex items-center gap-0.5 ${done ? "text-green-700" : "text-slate-400"}`}
            >
              {done && <Check className="w-2.5 h-2.5" />}
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Language + resolved-location indicators */
export function ContextBar({ meta }: { meta: CopilotMeta }) {
  const lang = meta.language;
  const loc = meta.plan?.location;
  const cmp = meta.plan?.compare_with;
  const src =
    loc?.source === "map_context"
      ? "your map selection"
      : loc?.source === "previous"
        ? "previous question"
        : "your question";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {lang && (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600"
          title={`Detected by ${lang.method}`}
        >
          <Languages className="w-3 h-3 text-green-600" /> {lang.native}
          <span className="font-medium text-slate-400">· auto-detected</span>
        </span>
      )}
      {loc && (
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600">
          <MapPin className="w-3 h-3 text-green-600" />
          {loc.name}
          {loc.state && loc.state !== loc.name ? `, ${loc.state}` : ""}
          {cmp ? ` vs ${cmp.name}` : ""}
          <span className="font-medium text-slate-400">· from {src}</span>
        </span>
      )}
      {meta.plan?.from_year && meta.plan.to_year && (
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600">
          {meta.plan.from_year}–{meta.plan.to_year}
        </span>
      )}
    </div>
  );
}

export function ValidationNotes({ notes }: { notes: ValidationNote[] }) {
  if (!notes.length) return null;
  return (
    <ul className="space-y-1">
      {notes.map((n, i) => (
        <li
          key={i}
          className={`flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-[11px] leading-snug ${
            n.level === "warning" ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600"
          }`}
        >
          {n.level === "warning" ? (
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          ) : (
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
          )}
          {n.text}
        </li>
      ))}
    </ul>
  );
}

/** Results returned by the platform's data layer (not the language model) */
export function DataResults({ data }: { data: DataResult[] }) {
  if (!data.length) return null;
  return (
    <div>
      <h4 className="flex items-center gap-1.5 font-bold text-slate-900 text-xs mb-1.5">
        <Database className="w-3.5 h-3.5 text-green-600" /> Platform data
      </h4>
      <div className="space-y-2">
        {data.map((d, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/40 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-800 leading-snug">{d.label}</span>
              <Tag p={d.provenance} />
            </div>
            <p className="mt-1 text-[11px] text-slate-600 leading-snug">{d.headline}</p>
            {d.table && (
              <table className="mt-1.5 w-full text-[10.5px]">
                <thead>
                  <tr className="text-slate-400">
                    {d.table.columns.map((c, k) => (
                      <th
                        key={c}
                        className={`pb-0.5 font-semibold ${k === 0 ? "text-left" : "text-right"}`}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.table.rows.map((r, k) => (
                    <tr key={k} className="border-t border-slate-200/70">
                      {r.map((c, j) => (
                        <td
                          key={j}
                          className={`py-0.5 tabular-nums ${j === 0 ? "text-left text-slate-700" : "text-right font-semibold text-slate-800"}`}
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
              <dl className="mt-1.5 grid grid-cols-1 gap-0.5 text-[10.5px]">
                {d.rows.slice(0, 5).map((r, k) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-slate-500 truncate">{r.label}</dt>
                    <dd
                      className={`text-right truncate ${r.emphasis ? "font-bold text-green-800" : "font-semibold text-slate-700"}`}
                    >
                      {r.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {d.note && (
              <p className="mt-1 text-[10px] text-slate-500 italic leading-snug">{d.note}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MapConfirmations({ applied }: { applied: string[] }) {
  if (!applied.length) return null;
  return (
    <div className="rounded-xl border border-green-200 bg-green-50/60 p-2.5">
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-green-700 mb-1">
        <Layers className="w-3 h-3" /> Map updated
      </span>
      <ul className="space-y-0.5">
        {applied.map((a, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11px] text-green-900 leading-snug">
            <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-green-600" /> {a}
          </li>
        ))}
      </ul>
    </div>
  );
}

const EV_ICON: Record<string, typeof Database> = {
  live: Satellite,
  platform: Database,
  demo: Database,
  reference: Globe2,
  unavailable: Info,
  ai: Sparkles,
};

/** Sources / evidence — built by the server from the data actually used */
export function EvidenceList({ items }: { items: EvidenceItem[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="font-bold text-slate-900 text-xs mb-1.5">Sources / Evidence</h4>
      <ul className="space-y-1">
        {items.map((e, i) => {
          const Icon = EV_ICON[e.provenance] ?? Database;
          return (
            <li key={i} className="flex items-start gap-2 text-[11px] leading-snug">
              <Icon className="w-3 h-3 mt-0.5 shrink-0 text-green-600" />
              <span className="flex-1 min-w-0 text-slate-700">
                {e.label}
                <span className="block text-[10px] text-slate-400">{e.detail}</span>
              </span>
              <Tag p={e.provenance} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PlanDetails({ plan }: { plan: QueryPlan }) {
  const compact = {
    intent: plan.intent,
    language: plan.language,
    location: plan.location?.name ?? null,
    state: plan.location?.state ?? null,
    compare_with: plan.compare_with?.name ?? null,
    from_year: plan.from_year,
    to_year: plan.to_year,
    from_class: plan.from_class,
    to_class: plan.to_class,
    operation: plan.operation,
    datasets: plan.datasets,
    map_action: plan.map_action,
    layer: plan.layer,
    follow_up: plan.refers_to_previous,
  };
  return (
    <details className="rounded-xl border border-slate-200 bg-white px-3 py-2 group">
      <summary className="cursor-pointer list-none flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-700">
        <Braces className="w-3.5 h-3.5 text-green-600" /> Query plan
        <span className="ml-auto font-medium text-slate-400">{plan.intent.replace(/_/g, " ")}</span>
      </summary>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-2.5 text-[10px] leading-relaxed text-green-100">
        {JSON.stringify(compact, null, 2)}
      </pre>
    </details>
  );
}

export function ActionChips({
  chips,
  onChip,
}: {
  chips: ActionChip[];
  onChip: (c: ActionChip) => void;
}) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChip(c)}
          className="group inline-flex items-center gap-1 rounded-full border border-green-200 bg-white px-2.5 py-1 text-[10.5px] font-bold text-green-800 hover:bg-green-50 hover:border-green-300 transition-colors"
        >
          {c.kind === "action" ? (
            <Layers className="w-3 h-3" />
          ) : c.kind === "link" ? (
            <Globe2 className="w-3 h-3" />
          ) : (
            <ArrowRight className="w-3 h-3" />
          )}
          {c.label}
        </button>
      ))}
    </div>
  );
}

const ANALYSING = [
  "Understanding your question…",
  "Validating place, years & datasets…",
  "Querying GIS & land datasets…",
  "Checking evidence…",
  "Composing the answer…",
];

/** Stepwise “Analysing GIS data…” indicator while the pipeline runs */
export function AnalysingSteps() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setStep((s) => Math.min(ANALYSING.length - 1, s + 1)), 900);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="rounded-2xl rounded-tl-md bg-slate-100 border border-slate-200 px-3.5 py-3 space-y-1.5">
      {ANALYSING.slice(0, step + 1).map((s, i) => (
        <div key={s} className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
          {i < step ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
          ) : (
            <Loader2 className="w-3.5 h-3.5 text-green-600 animate-spin" />
          )}
          {s}
        </div>
      ))}
    </div>
  );
}

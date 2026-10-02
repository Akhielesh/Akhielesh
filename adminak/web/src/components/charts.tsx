import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Table2, BarChart3 } from "lucide-react";
import type { MonthlySpend } from "@shared/types";
import { useFmt } from "../lib/prefs";
import { cn } from "../lib/utils";

function niceMax(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const s of steps) if (s * magnitude >= value) return s * magnitude;
  return 10 * magnitude;
}

/** Chart + table twin with a small toggle (tables are the accessible equivalent). */
export function ChartFrame({ title, children, table, action }: { title?: ReactNode; children: ReactNode; table: ReactNode; action?: ReactNode }) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 text-[13px] text-muted">{title}</div>
        <div className="flex items-center gap-1">
          {action}
          <button
            type="button"
            onClick={() => setMode(mode === "chart" ? "table" : "chart")}
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            aria-label={mode === "chart" ? "Show as table" : "Show as chart"}
            title={mode === "chart" ? "Show as table" : "Show as chart"}
          >
            {mode === "chart" ? <Table2 className="size-4" /> : <BarChart3 className="size-4" />}
          </button>
        </div>
      </div>
      {mode === "chart" ? children : table}
    </div>
  );
}

export function SpendBars({ data, currency, metric = "out", height = 168 }: { data: MonthlySpend[]; currency: string; metric?: "out" | "in"; height?: number }) {
  const fmt = useFmt();
  const [active, setActive] = useState<number | null>(null);
  const values = data.map((d) => d[metric]);
  const max = niceMax(Math.max(...values, 1));
  const width = 640;
  const left = 46;
  const plotW = width - left - 6;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.min(30, band * 0.62);
  const ticks = [0, max / 3, (max * 2) / 3, max];
  const label = `Monthly ${metric === "out" ? "spending" : "income"}: ${data.map((d) => `${d.label} ${fmt.money(d[metric], currency, { whole: true })}`).join(", ")}`;
  const current = data.length - 1;
  const tip = active !== null ? data[active] : null;

  return (
    <ChartFrame
      title={tip ? <span className="text-ink">{tip.label} · <strong className="tabular">{fmt.money(tip[metric], currency)}</strong>{metric === "out" && tip.subscriptions ? <span className="text-muted"> · {fmt.money(tip.subscriptions, currency)} subscriptions</span> : null}</span> : "Tap a bar for details"}
      table={
        <div className="max-h-72 overflow-auto rounded-xl border border-line">
          <table className="tabular w-full text-sm">
            <thead className="bg-surface-2 text-left text-[12px] text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Month</th>
                <th className="px-3 py-2 text-right font-medium">{metric === "out" ? "Spent" : "Income"}</th>
                {metric === "out" ? <th className="px-3 py-2 text-right font-medium">Subscriptions</th> : null}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.month} className="border-t border-line">
                  <td className="px-3 py-2">{d.label} {d.month.slice(0, 4)}</td>
                  <td className="px-3 py-2 text-right">{fmt.money(d[metric], currency)}</td>
                  {metric === "out" ? <td className="px-3 py-2 text-right text-muted">{fmt.money(d.subscriptions, currency)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    >
      <svg viewBox={`0 0 ${width} ${height + 26}`} className="w-full" role="img" aria-label={label} onMouseLeave={() => setActive(null)}>
        {ticks.map((t, i) => {
          const y = height - (t / max) * (height - 8);
          return (
            <g key={i}>
              <line x1={left} x2={width} y1={y} y2={y} stroke="var(--grid)" strokeWidth={1} />
              <text x={left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular">
                {fmt.money(t, currency, { compact: true })}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const value = d[metric];
          const h = value > 0 ? Math.max(3, (value / max) * (height - 8)) : 0;
          const x = left + i * band + (band - barW) / 2;
          const y = height - h;
          const r = Math.min(4, barW / 2, h);
          const isActive = active === i;
          return (
            <g key={d.month}>
              {h > 0 ? (
                <path
                  d={`M${x},${height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${height} Z`}
                  fill="var(--series)"
                  opacity={active === null ? (i === current ? 0.6 : 1) : isActive ? 1 : 0.35}
                />
              ) : null}
              <text x={left + i * band + band / 2} y={height + 18} textAnchor="middle" fontSize={11} fill={isActive ? "var(--text)" : "var(--muted)"} fontWeight={isActive ? 600 : 400}>
                {d.label}
              </text>
              <rect
                x={left + i * band}
                y={0}
                width={band}
                height={height + 24}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(isActive ? null : i)}
                onFocus={() => setActive(i)}
                tabIndex={0}
                role="button"
                aria-label={`${d.label}: ${fmt.money(value, currency)}`}
              />
            </g>
          );
        })}
        <line x1={left} x2={width} y1={height} y2={height} stroke="var(--border-strong)" strokeWidth={1} />
      </svg>
    </ChartFrame>
  );
}

export function CategoryBars({ rows, currency }: { rows: { label: string; value: number; hint?: string }[]; currency: string }) {
  const fmt = useFmt();
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ink-2">{r.label}</span>
            <span className="tabular shrink-0 font-medium text-ink">
              {fmt.money(r.value, currency)}
              <span className="ml-1.5 text-[12px] font-normal text-muted">{total ? Math.round((r.value / total) * 100) : 0}%</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-series" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Sparkline({ points, currency, className }: { points: { at: string; amount: number }[]; currency: string | null; className?: string }) {
  const fmt = useFmt();
  // Draw in real pixels so the line spans the container without stretching the markers.
  const box = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(300);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setMeasured(Math.max(120, Math.round(entry!.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const width = measured;
    const height = 70;
    const pad = 10;
    const min = Math.min(...points.map((p) => p.amount));
    const max = Math.max(...points.map((p) => p.amount));
    const span = max - min || Math.max(1, max * 0.2);
    const xs = points.map((_, i) => (points.length === 1 ? width / 2 : pad + (i / (points.length - 1)) * (width - pad * 2)));
    const ys = points.map((p) => height - pad - ((p.amount - min) / span) * (height - pad * 2));
    return { width, height, xs, ys };
  }, [points, measured]);
  if (!geometry) return null;
  const { width, height, xs, ys } = geometry;
  const path = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(" ");
  const last = points.length - 1;
  return (
    <div ref={box} className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[70px] w-full overflow-visible" role="img" aria-label={`Price history: ${points.map((p) => `${fmt.date(p.at, "monthDay")} ${fmt.money(p.amount, currency)}`).join(", ")}`}>
        <line x1={0} x2={width} y1={height - 1} y2={height - 1} stroke="var(--grid)" />
        <path d={path} fill="none" stroke="var(--series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {xs.map((x, i) => (
          <circle key={i} cx={x} cy={ys[i]} r={i === last ? 4.5 : 3} fill="var(--series)" stroke="var(--surface)" strokeWidth={2} />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11.5px] text-muted">
        <span>
          {fmt.date(points[0]!.at, "monthDay")} · {fmt.money(points[0]!.amount, currency)}
        </span>
        <span className="font-medium text-ink">
          {fmt.date(points[last]!.at, "monthDay")} · {fmt.money(points[last]!.amount, currency)}
        </span>
      </div>
    </div>
  );
}

/** One balance series over time (net worth, an account's balance), with a crosshair and table twin. */
export function BalanceChart({
  points,
  currency,
  label,
  height = 150,
  detail,
}: {
  points: { day: string; value: number }[];
  currency: string;
  label: string;
  height?: number;
  /** Extra line for the hovered day (e.g. "cash $x · owed $y"). */
  detail?: (index: number) => ReactNode;
}) {
  const fmt = useFmt();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.round(entry!.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    const pad = (max - min) * 0.12 || Math.max(1, Math.abs(max) * 0.05);
    min -= pad;
    max += pad;
    const left = 4;
    const right = width - 4;
    const top = 8;
    const bottom = height - 4;
    const xs = points.map((_, i) => left + (i / (points.length - 1)) * (right - left));
    const ys = points.map((p) => bottom - ((p.value - min) / (max - min)) * (bottom - top));
    return { xs, ys, bottom };
  }, [points, width, height]);
  const last = points.length - 1;
  const shown = active ?? last;
  const tip = points[shown];
  return (
    <ChartFrame
      title={
        tip ? (
          <span className={active === null ? undefined : "text-ink"}>
            {fmt.date(`${tip.day}T12:00:00Z`, "monthDay")} · <strong className="tabular text-ink">{fmt.money(tip.value, currency)}</strong>
            {detail ? <span className="text-muted"> · {detail(shown)}</span> : null}
          </span>
        ) : (
          label
        )
      }
      table={
        <div className="max-h-72 overflow-auto rounded-xl border border-line">
          <table className="tabular w-full text-sm">
            <thead className="bg-surface-2 text-left text-[12px] text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 text-right font-medium">{label}</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().filter((_, i) => i % 7 === 0).map((p) => (
                <tr key={p.day} className="border-t border-line">
                  <td className="px-3 py-2">{fmt.date(`${p.day}T12:00:00Z`, "medium")}</td>
                  <td className="px-3 py-2 text-right">{fmt.money(p.value, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    >
      <div ref={box} className="w-full">
        {geometry ? (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full touch-pan-y"
            style={{ height }}
            role="img"
            aria-label={`${label}: ${fmt.money(points[0]!.value, currency)} on ${points[0]!.day} to ${fmt.money(points[last]!.value, currency)} on ${points[last]!.day}`}
            onPointerMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * width;
              let best = 0;
              for (let i = 1; i < geometry.xs.length; i++) if (Math.abs(geometry.xs[i]! - x) < Math.abs(geometry.xs[best]! - x)) best = i;
              setActive(best);
            }}
            onPointerLeave={() => setActive(null)}
          >
            <line x1={0} x2={width} y1={geometry.bottom} y2={geometry.bottom} stroke="var(--border-strong)" />
            <path
              d={`M${geometry.xs[0]},${geometry.bottom} ${geometry.xs.map((x, i) => `L${x.toFixed(1)},${geometry.ys[i]!.toFixed(1)}`).join(" ")} L${geometry.xs[last]},${geometry.bottom} Z`}
              fill="var(--series)"
              opacity={0.09}
            />
            <path d={geometry.xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${geometry.ys[i]!.toFixed(1)}`).join(" ")} fill="none" stroke="var(--series)" strokeWidth={2} strokeLinejoin="round" />
            {active !== null ? <line x1={geometry.xs[active]} x2={geometry.xs[active]} y1={0} y2={geometry.bottom} stroke="var(--border-strong)" strokeDasharray="3 3" /> : null}
            <circle cx={geometry.xs[shown]} cy={geometry.ys[shown]} r={4.5} fill="var(--series)" stroke="var(--surface)" strokeWidth={2} />
          </svg>
        ) : (
          <p className="py-6 text-center text-sm text-muted">Not enough history yet.</p>
        )}
      </div>
    </ChartFrame>
  );
}

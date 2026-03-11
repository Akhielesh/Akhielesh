"use client";

import { ArrowRight, Globe2, LockKeyhole, Radar, RefreshCcw, Shield, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { FloatingParticles } from "@/components/animate/floating-particles";
import { Button } from "@/components/ui/button";
import {
  fetchAnalyticsSnapshot,
  type AnalyticsDashboardSnapshot,
  type AnalyticsRange,
  type DeviceMetric,
  type LocationPoint,
  type PulseItem,
  type ReferrerMetric,
  type TrendPoint
} from "@/lib/analytics";
import { cn } from "@/lib/utils";

const ADMIN_WORDMARKS = ["AKHIELESH", "AWESOMEST PERSON"];
const ADMIN_UNLOCK_KEY = "adminak-unlocked";
const ADMIN_PASSWORD_KEY = "adminak-password";
const DEFAULT_RANGE: AnalyticsRange = "7d";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: value >= 1000 ? "compact" : "standard" }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(0)}%`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
}

function formatRelativeTime(timestamp: string) {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.round(hours / 24)}d ago`;
}

function buildLinePath(points: TrendPoint[], key: "pageviews" | "visitors", width: number, height: number) {
  const values = points.map((point) => point[key]);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);

  return points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width;
      const normalized = (point[key] - min) / span;
      const y = height - normalized * height;
      return `${x},${y}`;
    })
    .join(" ");
}

function buildAreaPath(points: TrendPoint[], key: "pageviews" | "visitors", width: number, height: number) {
  const line = buildLinePath(points, key, width, height);
  const start = `0,${height}`;
  const end = `${width},${height}`;
  return `M${start} L${line.replace(/ /g, " L")} L${end} Z`;
}

function projectLocation(location: LocationPoint, width: number, height: number) {
  return {
    x: ((location.longitude + 180) / 360) * width,
    y: ((90 - location.latitude) / 180) * height
  };
}

function rangeLabel(range: AnalyticsRange) {
  if (range === "24h") return "Last 24 hours";
  if (range === "30d") return "Last 30 days";
  return "Last 7 days";
}

function StatusPill({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "warm" | "cool";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em]",
        tone === "warm" && "border-[#f0b56f]/28 bg-[#f0b56f]/10 text-[#f6d3a2]",
        tone === "cool" && "border-[#8ac5cf]/28 bg-[#8ac5cf]/10 text-[#b7e0e6]",
        tone === "neutral" && "border-white/10 bg-white/[0.04] text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  accent = "warm"
}: {
  label: string;
  value: string;
  detail: string;
  accent?: "warm" | "cool" | "neutral";
}) {
  return (
    <article className="panel-shell rounded-[1.8rem] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow-label">{label}</p>
        <div
          className={cn(
            "size-2 rounded-full",
            accent === "warm" && "bg-[#f0b56f]",
            accent === "cool" && "bg-[#8ac5cf]",
            accent === "neutral" && "bg-white/35"
          )}
        />
      </div>
      <p className="mt-5 font-display text-[clamp(1.75rem,3vw,2.7rem)] leading-none tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p>
    </article>
  );
}

function TrendChart({ trends, range }: { trends: TrendPoint[]; range: AnalyticsRange }) {
  const width = 640;
  const height = 240;
  const pageviewsPath = useMemo(() => buildLinePath(trends, "pageviews", width, height), [trends]);
  const visitorsPath = useMemo(() => buildLinePath(trends, "visitors", width, height), [trends]);
  const areaPath = useMemo(() => buildAreaPath(trends, "pageviews", width, height), [trends]);

  return (
    <section className="panel-shell rounded-[2rem] p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow-label">Traffic pulse</p>
          <h2 className="mt-3 font-display text-[clamp(1.6rem,4vw,2.8rem)] leading-[0.95] tracking-tight text-foreground">
            Live anonymous traffic trend
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
            Views and unique visitors are plotted together so you can spot peaks, recruiter attention windows, and whether
            product pages are carrying the session depth you want.
          </p>
        </div>
        <StatusPill tone="cool">{rangeLabel(range)}</StatusPill>
      </div>

      <div className="mt-8 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-4 sm:p-5">
        <svg viewBox={`0 0 ${width} ${height + 44}`} className="h-[18rem] w-full">
          <defs>
            <linearGradient id="adminak-area" x1="0%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(240,181,111,0.22)" />
              <stop offset="100%" stopColor="rgba(240,181,111,0.02)" />
            </linearGradient>
          </defs>

          {Array.from({ length: 4 }, (_, index) => (
            <line
              key={index}
              x1="0"
              x2={width}
              y1={index * (height / 3)}
              y2={index * (height / 3)}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="4 10"
            />
          ))}

          <path d={areaPath} fill="url(#adminak-area)" opacity="1" />
          <polyline points={pageviewsPath} fill="none" stroke="#f0b56f" strokeWidth="3" strokeLinecap="round" />
          <polyline points={visitorsPath} fill="none" stroke="#8ac5cf" strokeWidth="3" strokeLinecap="round" />

          {trends.map((point, index) => {
            const x = (index / Math.max(1, trends.length - 1)) * width;
            const yPage = height - (point.pageviews / Math.max(...trends.map((item) => item.pageviews), 1)) * height;
            const yVisitors = height - (point.visitors / Math.max(...trends.map((item) => item.visitors), 1)) * height;

            return (
              <g key={point.timestamp}>
                <circle cx={x} cy={yPage} r="3.5" fill="#f0b56f" />
                <circle cx={x} cy={yVisitors} r="3.5" fill="#8ac5cf" />
                <text
                  x={x}
                  y={height + 24}
                  textAnchor={index === 0 ? "start" : index === trends.length - 1 ? "end" : "middle"}
                  fill="rgba(255,255,255,0.48)"
                  fontSize="11"
                  letterSpacing="0.2em"
                >
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <StatusPill tone="warm">Pageviews</StatusPill>
        <StatusPill tone="cool">Unique visitors</StatusPill>
      </div>
    </section>
  );
}

function GeoPulseMap({ locations }: { locations: LocationPoint[] }) {
  const width = 640;
  const height = 320;
  const topLocations = [...locations].sort((left, right) => right.visits - left.visits).slice(0, 3);

  return (
    <section className="panel-shell rounded-[2rem] p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow-label">Geo telemetry</p>
          <h2 className="mt-3 font-display text-[clamp(1.55rem,4vw,2.8rem)] leading-[0.95] tracking-tight text-foreground">
            Region and city spread
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
            Cloudflare-style request geolocation gives country, region, city, and coordinates. This surface is meant to
            show where interest is forming without ever asking visitors for permission prompts.
          </p>
        </div>
        <StatusPill tone="warm">
          <Globe2 className="size-3.5" />
          {locations.length} active locations
        </StatusPill>
      </div>

      <div className="mt-8 overflow-hidden rounded-[1.8rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[18rem] w-full">
          <defs>
            <pattern id="adminak-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            </pattern>
          </defs>

          <rect width={width} height={height} rx="30" fill="url(#adminak-grid)" />

          {Array.from({ length: 5 }, (_, index) => (
            <path
              key={index}
              d={`M0 ${50 + index * 48} C 140 ${36 + index * 44}, 320 ${64 + index * 44}, ${width} ${48 + index * 48}`}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          ))}

          {Array.from({ length: 6 }, (_, index) => (
            <path
              key={`v-${index}`}
              d={`M${70 + index * 100} 0 C ${60 + index * 100} 88, ${82 + index * 100} 204, ${72 + index * 100} ${height}`}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          ))}

          <ellipse cx={width / 2} cy={height / 2} rx={width / 2.2} ry={height / 2.35} fill="rgba(255,255,255,0.02)" />

          {locations.map((location, index) => {
            const point = projectLocation(location, width, height);
            const radius = 4 + Math.min(10, location.visits * 0.18);
            const highlight = index === 0 ? "#f0b56f" : index === 1 ? "#8ac5cf" : "rgba(255,255,255,0.9)";

            return (
              <g key={`${location.city}-${location.region}-${location.country}`}>
                <circle cx={point.x} cy={point.y} r={radius * 1.8} fill={highlight} opacity="0.14" />
                <circle cx={point.x} cy={point.y} r={radius} fill={highlight} opacity="0.88" />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {topLocations.map((location, index) => (
          <article key={location.city} className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow-label">Hotspot {String(index + 1).padStart(2, "0")}</p>
              <StatusPill tone={index === 0 ? "warm" : "cool"}>{formatNumber(location.visits)} hits</StatusPill>
            </div>
            <p className="mt-4 font-display text-2xl leading-none tracking-tight text-foreground">{location.city}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {location.region}, {location.country}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function DeviceBars({ devices }: { devices: DeviceMetric[] }) {
  return (
    <section className="panel-shell rounded-[2rem] p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow-label">Device mix</p>
          <h2 className="mt-3 font-display text-[clamp(1.45rem,3vw,2.4rem)] leading-[0.96] tracking-tight text-foreground">
            Surface distribution
          </h2>
        </div>
        <StatusPill tone="cool">
          <Radar className="size-3.5" />
          Mobile-aware
        </StatusPill>
      </div>

      {devices.length > 0 ? (
        <div className="mt-7 space-y-4">
          {devices.map((device) => (
            <div key={device.label}>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground/84">{device.label}</span>
                <span className="text-muted-foreground">
                  {formatNumber(device.visits)} / {formatPercent(device.share * 100)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#f0b56f] via-white/80 to-[#8ac5cf]"
                  style={{ width: `${device.share * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-7 text-sm leading-7 text-muted-foreground">
          No device data has been recorded in the selected range yet.
        </p>
      )}
    </section>
  );
}

function ReferrerList({ referrers }: { referrers: ReferrerMetric[] }) {
  const max = Math.max(...referrers.map((referrer) => referrer.visits), 1);

  return (
    <section className="panel-shell rounded-[2rem] p-6">
      <p className="eyebrow-label">Referrer sources</p>
      <h2 className="mt-3 font-display text-[clamp(1.45rem,3vw,2.4rem)] leading-[0.96] tracking-tight text-foreground">
        Where traffic is coming from
      </h2>

      {referrers.length > 0 ? (
        <div className="mt-7 space-y-4">
          {referrers.map((referrer) => (
            <div key={referrer.source} className="rounded-[1.3rem] border border-white/10 bg-white/[0.03] px-4 py-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground/84">{referrer.source}</span>
                <span className="text-muted-foreground">{formatNumber(referrer.visits)} visits</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#8ac5cf] to-[#f0b56f]"
                  style={{ width: `${(referrer.visits / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-7 text-sm leading-7 text-muted-foreground">
          No referral sources have been recorded in the selected range yet.
        </p>
      )}
    </section>
  );
}

function PulseFeed({ pulse }: { pulse: PulseItem[] }) {
  return (
    <section className="panel-shell rounded-[2rem] p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow-label">Signal feed</p>
          <h2 className="mt-3 font-display text-[clamp(1.45rem,3vw,2.4rem)] leading-[0.96] tracking-tight text-foreground">
            Operator notes
          </h2>
        </div>
        <StatusPill>
          <Sparkles className="size-3.5" />
          Live feed
        </StatusPill>
      </div>

      <div className="mt-7 space-y-4">
        {pulse.map((item) => (
          <article key={`${item.label}-${item.timestamp}`} className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm uppercase tracking-[0.22em] text-foreground/72">{item.label}</p>
              <StatusPill tone={item.emphasis === "warm" ? "warm" : item.emphasis === "cool" ? "cool" : "neutral"}>
                {formatRelativeTime(item.timestamp)}
              </StatusPill>
            </div>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PageTable({ pages }: { pages: AnalyticsDashboardSnapshot["pages"] }) {
  return (
    <section className="panel-shell rounded-[2rem] p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow-label">Top paths</p>
          <h2 className="mt-3 font-display text-[clamp(1.45rem,3vw,2.4rem)] leading-[0.96] tracking-tight text-foreground">
            Pages carrying attention
          </h2>
        </div>
        <StatusPill tone="warm">{pages.length} tracked paths</StatusPill>
      </div>

      <div className="mt-7 overflow-hidden rounded-[1.5rem] border border-white/10">
        {pages.length > 0 ? (
          pages.map((page, index) => (
            <div
              key={page.path}
              className={cn(
                "grid gap-2 px-4 py-4 text-sm md:grid-cols-[minmax(0,1fr)_auto_auto]",
                index !== pages.length - 1 && "border-b border-white/10"
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-foreground/92">{page.title}</p>
                <p className="mt-1 truncate font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{page.path}</p>
              </div>
              <div className="text-muted-foreground">{formatNumber(page.views)} views</div>
              <div className="text-muted-foreground">{formatNumber(page.uniqueVisitors)} uniques</div>
            </div>
          ))
        ) : (
          <div className="px-4 py-6 text-sm leading-7 text-muted-foreground">
            No page traffic has been recorded in the selected range yet.
          </div>
        )}
      </div>
    </section>
  );
}

function ArcTelemetryCore({ snapshot }: { snapshot: AnalyticsDashboardSnapshot }) {
  const reduceMotion = useReducedMotion();

  return (
    <section className="panel-shell relative overflow-hidden rounded-[2rem] p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_58%)]" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow-label">Telemetry core</p>
            <h2 className="mt-3 font-display text-[clamp(1.5rem,3vw,2.35rem)] leading-[0.96] tracking-tight text-foreground">
              Adminak reactor
            </h2>
          </div>
          <StatusPill tone="cool">Live feed</StatusPill>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center">
          <div className="relative flex size-[18rem] items-center justify-center rounded-full border border-white/10 bg-[radial-gradient(circle,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] shadow-[0_40px_120px_-70px_rgba(0,0,0,0.95)]">
            {!reduceMotion ? (
              <>
                <motion.div
                  className="absolute inset-4 rounded-full border border-[#f0b56f]/20"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="absolute inset-8 rounded-full border border-[#8ac5cf]/18"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="absolute inset-12 rounded-full border border-white/10"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                />
              </>
            ) : null}

            <div className="relative flex size-28 flex-col items-center justify-center rounded-full border border-white/12 bg-[radial-gradient(circle,rgba(240,181,111,0.16),rgba(13,17,23,0.92))] text-center shadow-[0_0_38px_rgba(240,181,111,0.18)]">
              <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">Live ingress</p>
              <p className="mt-2 font-display text-4xl leading-none tracking-tight text-foreground">
                {formatNumber(snapshot.summary.liveVisitors)}
              </p>
            </div>
          </div>

          <div className="mt-7 grid w-full gap-3 sm:grid-cols-3">
            <MetricChip label="Top region" value={snapshot.summary.topRegion} />
            <MetricChip label="Refresh cadence" value="60s" />
            <MetricChip label="Last capture" value={formatRelativeTime(snapshot.collectedAt)} />
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.3rem] border border-white/10 bg-white/[0.03] px-4 py-4">
      <p className="eyebrow-label">{label}</p>
      <p className="mt-3 text-sm leading-6 text-foreground/84">{value}</p>
    </div>
  );
}

function RangeSelector({
  range,
  onChange
}: {
  range: AnalyticsRange;
  onChange: (next: AnalyticsRange) => void;
}) {
  const ranges: AnalyticsRange[] = ["24h", "7d", "30d"];

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#111720] p-1">
      {ranges.map((item) => {
        const active = item === range;

        return (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={cn(
              "rounded-full px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.22em] transition-colors duration-200",
              active ? "bg-white/[0.12] text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

function AdminSignalLoop() {
  const reduceMotion = useReducedMotion();
  const [wordIndex, setWordIndex] = useState(0);
  const word = ADMIN_WORDMARKS[wordIndex];

  useEffect(() => {
    if (reduceMotion) {
      return;
    }

    const interval = window.setInterval(() => {
      setWordIndex((current) => (current + 1) % ADMIN_WORDMARKS.length);
    }, 3200);

    return () => window.clearInterval(interval);
  }, [reduceMotion]);

  return (
    <div className="relative flex min-h-[17rem] items-center justify-center overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-5 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(240,181,111,0.14),transparent_32%),radial-gradient(circle_at_75%_75%,rgba(138,197,207,0.12),transparent_34%)]" />
      <div className="relative flex flex-col items-center text-center">
        <StatusPill tone="cool">Adminak // private telemetry core</StatusPill>
        <div className="mt-7 min-h-[6rem]">
          <AnimatePresence mode="wait">
            <motion.div
              key={word}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -22 }}
              transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2"
            >
              {word.split("").map((character, index) => (
                <motion.span
                  key={`${word}-${character}-${index}`}
                  initial={reduceMotion ? false : { opacity: 0, y: -80, rotate: -8 }}
                  animate={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, rotate: 0 }}
                  transition={{ delay: reduceMotion ? 0 : index * 0.045, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                  className="font-display text-[clamp(1.9rem,7vw,4.8rem)] uppercase leading-none tracking-[0.14em] text-foreground"
                >
                  {character === " " ? "\u00A0" : character}
                </motion.span>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground">
          A hidden command deck for anonymous traffic, geo spread, recruiter attention windows, and product-page signal
          health.
        </p>
      </div>
    </div>
  );
}

function EmptyDashboardState({ detail }: { detail: string }) {
  return (
    <div className="panel-shell rounded-[2rem] p-8 text-center">
      <p className="eyebrow-label">Telemetry hold</p>
      <p className="mt-4 font-display text-[clamp(1.6rem,3vw,2.6rem)] leading-[0.96] tracking-tight text-foreground">
        Dashboard is waiting for a valid analytics response
      </p>
      <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">{detail}</p>
    </div>
  );
}

export function AdminAkExperience() {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
  const [passwordInput, setPasswordInput] = useState("");
  const [range, setRange] = useState<AnalyticsRange>(DEFAULT_RANGE);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [snapshot, setSnapshot] = useState<AnalyticsDashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [transientUnlock, setTransientUnlock] = useState(false);
  const [transientPassword, setTransientPassword] = useState("");

  const persistedUnlocked = mounted ? window.sessionStorage.getItem(ADMIN_UNLOCK_KEY) === "1" : false;
  const persistedPassword = mounted ? window.sessionStorage.getItem(ADMIN_PASSWORD_KEY) ?? "" : "";
  const unlocked = transientUnlock || persistedUnlocked;
  const adminPassword = transientPassword || persistedPassword;

  useEffect(() => {
    if (!mounted || !unlocked || !adminPassword) {
      return;
    }

    const controller = new AbortController();

    const loadSnapshot = async () => {
      try {
        setLoadingSnapshot(true);
        setError(null);
        const nextSnapshot = await fetchAnalyticsSnapshot(range, adminPassword, controller.signal);
        setSnapshot(nextSnapshot);
      } catch (nextError) {
        if (!controller.signal.aborted) {
          setError(nextError instanceof Error ? nextError.message : "Unable to load analytics data.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingSnapshot(false);
        }
      }
    };

    void loadSnapshot();

    return () => controller.abort();
  }, [adminPassword, mounted, range, refreshIndex, unlocked]);

  useEffect(() => {
    if (!mounted || !unlocked) {
      return;
    }

    const interval = window.setInterval(() => {
      setRefreshIndex((current) => current + 1);
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [mounted, unlocked]);

  const topLocation = snapshot?.locations[0];
  const summaryCards = snapshot
    ? [
        {
          label: "Unique visitors",
          value: formatNumber(snapshot.summary.uniqueVisitors),
          detail: `Anonymous uniques for ${rangeLabel(snapshot.range).toLowerCase()}.`,
          accent: "warm" as const
        },
        {
          label: "Total pageviews",
          value: formatNumber(snapshot.summary.pageviews),
          detail: "Overall traffic depth across the public portfolio.",
          accent: "cool" as const
        },
        {
          label: "Avg visit duration",
          value: formatDuration(snapshot.summary.avgVisitDurationSeconds),
          detail: "How long visitors stay inside the current experience loop.",
          accent: "neutral" as const
        },
        {
          label: "Bounce rate",
          value: formatPercent(snapshot.summary.bounceRate),
          detail: "Single-page exits across the anonymous telemetry stream.",
          accent: "warm" as const
        }
      ]
    : [];
  const hasRecordedTraffic = (snapshot?.summary.pageviews ?? 0) > 0;

  const handleUnlock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const candidatePassword = passwordInput.trim();
      const nextSnapshot = await fetchAnalyticsSnapshot(range, candidatePassword);

      window.sessionStorage.setItem(ADMIN_UNLOCK_KEY, "1");
      window.sessionStorage.setItem(ADMIN_PASSWORD_KEY, candidatePassword);
      setTransientUnlock(true);
      setTransientPassword(candidatePassword);
      setSnapshot(nextSnapshot);
      setPasswordInput("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Incorrect Adminak password.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLock = () => {
    window.sessionStorage.removeItem(ADMIN_UNLOCK_KEY);
    window.sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
    setTransientUnlock(false);
    setTransientPassword("");
    setPasswordInput("");
    setSnapshot(null);
    setError(null);
  };

  if (!mounted) {
    return null;
  }

  if (!unlocked) {
    return (
      <div className="relative min-h-[100dvh] overflow-hidden px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <FloatingParticles className="opacity-60" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(240,181,111,0.12),transparent_20%),radial-gradient(circle_at_82%_12%,rgba(138,197,207,0.14),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_26%)]" />
        <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-7xl items-center">
          <div className="grid w-full gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              <AdminSignalLoop />
              <div className="grid gap-4 sm:grid-cols-3">
                <MetricChip label="Mode" value="Anonymous telemetry only" />
                <MetricChip label="Location depth" value="Country / region / city when available" />
                <MetricChip label="Visibility" value="Hidden route, not linked in the public nav" />
              </div>
            </div>

            <div className="panel-shell rounded-[2.2rem] p-6 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="eyebrow-label">Access gate</p>
                  <h1 className="mt-3 font-display text-[clamp(1.8rem,4vw,3.1rem)] leading-[0.94] tracking-tight text-foreground">
                    Unlock Adminak
                  </h1>
                </div>
                <StatusPill tone="warm">
                  <Shield className="size-3.5" />
                  Private
                </StatusPill>
              </div>

              <p className="mt-5 text-sm leading-7 text-muted-foreground">
                This deck is intentionally hidden from the public site. Use the Adminak password to open the telemetry
                dashboard and monitor visits, geo spread, traffic patterns, and product-page attention.
              </p>

              <form onSubmit={handleUnlock} className="mt-8 space-y-4">
                <label className="block">
                  <span className="eyebrow-label">Password</span>
                  <div className="mt-3 flex items-center gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <LockKeyhole className="size-4 text-muted-foreground" />
                    <input
                      type="password"
                      value={passwordInput}
                      onChange={(event) => setPasswordInput(event.target.value)}
                      className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                      placeholder="Enter Adminak password"
                      autoComplete="current-password"
                    />
                  </div>
                </label>

                <Button
                  type="submit"
                  size="lg"
                  disabled={submitting || passwordInput.trim().length === 0}
                  className="w-full justify-center border border-white/10 bg-white/[0.06] hover:bg-white/[0.1]"
                >
                  Enter command deck
                  <ArrowRight className="size-4" />
                </Button>
              </form>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <StatusPill tone="cool">Cloudflare D1 + Pages Functions</StatusPill>
                <StatusPill tone="neutral">No cookie prompt required for anonymous telemetry</StatusPill>
              </div>

              {error ? (
                <div className="mt-5 rounded-[1.2rem] border border-[#f0b56f]/22 bg-[#f0b56f]/8 px-4 py-3 text-sm text-[#f6d3a2]">
                  {error}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <FloatingParticles count={36} className="opacity-60" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(240,181,111,0.14),transparent_22%),radial-gradient(circle_at_82%_14%,rgba(138,197,207,0.16),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_32%)]" />

      <div className="mx-auto max-w-7xl py-6 sm:py-8">
        <div className="panel-shell rounded-[2.2rem] px-6 py-6 sm:px-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <StatusPill tone="warm">Adminak // telemetry command deck</StatusPill>
                <StatusPill tone="cool">Live geo analytics</StatusPill>
              </div>
              <h1 className="mt-5 font-display text-[clamp(2.4rem,6vw,5rem)] leading-[0.92] tracking-tight text-foreground">
                Recruiter signal, product attention, and regional traffic in one deck.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
                Anonymous analytics only. No permission banner. This view is built to feel cinematic but still answer the
                practical questions: how many visits, from where, on which pages, and at what times.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <RangeSelector range={range} onChange={setRange} />
              <Button
                type="button"
                variant="outline"
                onClick={() => setRefreshIndex((current) => current + 1)}
                className="border-white/10 bg-white/[0.04]"
              >
                <RefreshCcw className="size-4" />
                Refresh
              </Button>
              <Button type="button" variant="outline" onClick={handleLock} className="border-white/10 bg-white/[0.04]">
                Lock
              </Button>
            </div>
          </div>
        </div>

        {error && !snapshot ? (
          <div className="mt-6">
            <EmptyDashboardState detail={error} />
          </div>
        ) : null}

        {snapshot && hasRecordedTraffic ? (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map((card) => (
                <MetricCard key={card.label} {...card} />
              ))}
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <TrendChart trends={snapshot.trends} range={snapshot.range} />
              <ArcTelemetryCore snapshot={snapshot} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <GeoPulseMap locations={snapshot.locations} />
              <div className="grid gap-6">
                <MetricCard
                  label="Top location"
                  value={topLocation ? `${topLocation.city}, ${topLocation.region}` : "No geo data"}
                  detail={
                    topLocation
                      ? `${formatNumber(topLocation.visits)} visits from the strongest geo hotspot in the current range.`
                      : "Cloudflare has not attached location coordinates to any recorded visits in the current range."
                  }
                  accent="cool"
                />
                <DeviceBars devices={snapshot.devices} />
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.85fr]">
              <PageTable pages={snapshot.pages} />
              <ReferrerList referrers={snapshot.referrers} />
            </div>

            <div className="mt-6">
              <PulseFeed pulse={snapshot.pulse} />
            </div>
          </>
        ) : snapshot ? (
          <div className="mt-6">
            <EmptyDashboardState detail="No anonymous traffic has been recorded yet. Open the public portfolio from a normal browser tab and the live dashboard will begin filling with actual visits, timestamps, referrers, pages, and regions." />
          </div>
        ) : loadingSnapshot ? (
          <div className="mt-6">
            <EmptyDashboardState detail="Telemetry is loading. The dashboard is waiting for the first snapshot." />
          </div>
        ) : null}
      </div>
    </div>
  );
}

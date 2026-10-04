import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ActivityDescription } from "@gtb/shared";
import { authedFetch } from "@/lib/api";
import { env } from "@/lib/env";

/**
 * Team Pulse data (founders only). Types mirror packages/db/src/server/pulse.ts;
 * the web app cannot import that module (it pulls in Prisma).
 */

export interface PulseStaff {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  isActive: boolean;
}

export interface PulseMetric {
  key: string;
  label: string;
  value: string;
  hint?: string;
}

export interface PulseSummary {
  daysActive: number;
  avgStart: number | null;
  avgEnd: number | null;
  totalActiveMinutes: number;
  avgActiveMinutesPerDay: number;
  actions: number;
  views: number;
}

export type Block = [string, string];

export interface PulseDayRow {
  staff: PulseStaff;
  stats: { firstSeenAt: string; lastSeenAt: string; activeMinutes: number; viewCount: number } | null;
  actions: number;
  blocks: Block[];
  ticks: Array<{ at: string; tone: ActivityDescription["tone"] }>;
  outputs: PulseMetric[];
  presence: { state: "active" | "idle"; module: string; since: string } | null;
}

export interface PulsePeriodRow {
  staff: PulseStaff;
  byDay: Record<string, number>;
  summary: PulseSummary;
  outputs: PulseMetric[];
  timeliness: PulseMetric[];
}

export interface PulseDayStats {
  day: string;
  firstSeenAt: string;
  lastSeenAt: string;
  activeMinutes: number;
  blocks: Block[];
}

export interface PulseStaffDetail {
  staff: PulseStaff;
  from: string;
  to: string;
  summary: PulseSummary;
  previous: PulseSummary;
  outputs: PulseMetric[];
  timeliness: PulseMetric[];
  modules: Array<{ module: string; minutes: number }>;
  days: PulseDayStats[];
}

export interface PulseFeedDetail {
  id: string;
  verb: string | null;
  entityType: string;
  changes: unknown;
  description: ActivityDescription;
}

export interface PulseFeedEntry extends PulseFeedDetail {
  at: string;
  kind: "change" | "view" | "export" | "auth";
  module: string | null;
  entityId: string;
  summary: string | null;
  meta: unknown;
  actor: { id: string; name: string; role: string } | null;
  client: { id: string; name: string } | null;
  details: PulseFeedDetail[];
}

export interface PulseReport {
  detail: PulseStaffDetail;
  entries: PulseFeedEntry[];
  truncated: boolean;
  hideClients: boolean;
  generatedAt: string;
}

async function getJson<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
  const qs = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();
  const res = await authedFetch(`${env.apiUrl}${path}${qs ? `?${qs}` : ""}`);
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !json) throw new Error(json?.error || `Request failed (${res.status})`);
  return json;
}

export function usePulseDay(date: string) {
  return useQuery({
    queryKey: ["pulse", "day", date],
    queryFn: () => getJson<{ day: string; isToday: boolean; rows: PulseDayRow[] }>("/api/pulse/day", { date }),
    placeholderData: keepPreviousData,
    // "Working now" stays fresh while the founder watches.
    refetchInterval: 30_000,
  });
}

export function usePulsePeriod(from: string, to: string) {
  return useQuery({
    queryKey: ["pulse", "period", from, to],
    queryFn: () =>
      getJson<{ from: string; to: string; days: string[]; rows: PulsePeriodRow[] }>("/api/pulse/period", { from, to }),
    placeholderData: keepPreviousData,
  });
}

export function usePulseStaff(id: string, from: string, to: string) {
  return useQuery({
    queryKey: ["pulse", "staff", id, from, to],
    queryFn: () => getJson<PulseStaffDetail>(`/api/pulse/staff/${encodeURIComponent(id)}`, { from, to }),
    placeholderData: keepPreviousData,
  });
}

export interface FeedFilters {
  userId?: string;
  clientId?: string;
  kinds?: string;
  module?: string;
  q?: string;
  from?: string;
  to?: string;
  includeFounders?: boolean;
}

export function usePulseFeed(f: FeedFilters) {
  return useInfiniteQuery({
    queryKey: ["pulse", "feed", f],
    queryFn: ({ pageParam }) =>
      getJson<{ entries: PulseFeedEntry[]; nextCursor: string | null }>("/api/pulse/feed", {
        userId: f.userId,
        clientId: f.clientId,
        kinds: f.kinds,
        module: f.module,
        q: f.q,
        from: f.from,
        to: f.to,
        includeFounders: f.includeFounders ? "1" : undefined,
        cursor: pageParam ?? undefined,
        limit: "100",
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function usePulseReport(userId: string, from: string, to: string, hideClients: boolean) {
  return useQuery({
    queryKey: ["pulse", "report", userId, from, to, hideClients],
    queryFn: () =>
      getJson<PulseReport>("/api/pulse/report", {
        userId,
        from,
        to,
        hideClients: hideClients ? "1" : undefined,
        format: "json",
      }),
    staleTime: Infinity,
    refetchOnMount: false,
  });
}

/** Download the CSV report (auth header means a plain link cannot be used). */
export async function downloadPulseCsv(args: {
  userId: string;
  name: string;
  from: string;
  to: string;
  hideClients: boolean;
}): Promise<void> {
  const qs = new URLSearchParams({
    userId: args.userId,
    from: args.from,
    to: args.to,
    format: "csv",
    ...(args.hideClients ? { hideClients: "1" } : {}),
  });
  const res = await authedFetch(`${env.apiUrl}/api/pulse/report?${qs.toString()}`);
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const slug = args.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `team-pulse-${slug}-${args.from}-to-${args.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

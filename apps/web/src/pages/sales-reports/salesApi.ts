import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SalesReportCountKey, SalesReportStatus } from "@gtb/shared";
import { authedFetch } from "@/lib/api";
import { env } from "@/lib/env";

/**
 * CRO daily sales reports (SALES_REPORTS_DESIGN.md). Types mirror
 * packages/db/src/server/salesReports.ts; the web app cannot import that
 * module (it pulls in Prisma).
 */

export interface SalesCro {
  id: string;
  name: string;
  avatarUrl: string | null;
  isActive: boolean;
}

export interface SalesReportFields {
  dayOff: boolean;
  enquiries: number | null;
  leadFollowUps: number | null;
  hotLeads: number | null;
  plannedFollowUps: number | null;
  challenges: string | null;
  submittedAt: string;
  editedAt: string | null;
}

export interface SalesFigures {
  leadsAdded: number;
  sales: number;
  salesValue: number;
  pricePending: number;
  payments: number;
  paymentsReceived: number;
}

export interface SalesDayCell {
  day: string;
  status: SalesReportStatus | null;
  report: SalesReportFields | null;
  figures: SalesFigures;
  plannedYesterday: number | null;
}

export interface ReportedTotals {
  enquiries: number;
  leadFollowUps: number;
  hotLeads: number;
  plannedFollowUps: number;
  plannedYesterday: number;
}

export interface SalesDayView {
  day: string;
  today: string;
  rows: Array<{ cro: SalesCro; cell: SalesDayCell }>;
  totals: { expected: number; filed: number; reported: ReportedTotals; figures: SalesFigures };
  unassigned: SalesFigures;
}

export interface SalesPeriodRow {
  cro: SalesCro;
  counts: Record<SalesReportStatus, number>;
  onTimeRate: number | null;
  reported: ReportedTotals;
  figures: SalesFigures;
}

export interface SalesPeriodView {
  from: string;
  to: string;
  today: string;
  rows: SalesPeriodRow[];
  series: Array<{ day: string; enquiries: number; leadsAdded: number; sales: number }>;
  challenges: Array<{ cro: { id: string; name: string }; day: string; text: string; submittedAt: string }>;
  totals: { reported: ReportedTotals; figures: SalesFigures };
  unassigned: SalesFigures;
}

export interface MySalesReports {
  today: string;
  yesterday: string;
  /** Newest first, last 30 work days. */
  days: SalesDayCell[];
  /** This IST month so far, credited the same way as the reports. */
  monthToDate: SalesFigures;
}

export type SalesReportBody =
  | { day: string; dayOff: true }
  | ({ day: string; challenges: string | null } & Record<SalesReportCountKey, number>);

async function request<T>(path: string, init?: { method: string; body: unknown }): Promise<T> {
  const res = await authedFetch(`${env.apiUrl}${path}`, init
    ? { method: init.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) }
    : undefined);
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !json) throw new Error(json?.error || `Request failed (${res.status})`);
  return json;
}

const qs = (params: Record<string, string>) => new URLSearchParams(params).toString();

export function useMySalesReports() {
  return useQuery({
    queryKey: ["sales-reports", "mine"],
    queryFn: () => request<MySalesReports>("/api/sales-reports/mine"),
  });
}

export function useSaveSalesReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SalesReportBody) =>
      request<{ day: SalesDayCell | null }>("/api/sales-reports/mine", { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales-reports", "mine"] }),
  });
}

export function useSalesDay(date: string) {
  return useQuery({
    queryKey: ["sales-reports", "day", date],
    queryFn: () => request<SalesDayView>(`/api/sales-reports/day?${qs({ date })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useSalesPeriod(from: string, to: string) {
  return useQuery({
    queryKey: ["sales-reports", "period", from, to],
    queryFn: () => request<SalesPeriodView>(`/api/sales-reports/period?${qs({ from, to })}`),
    placeholderData: keepPreviousData,
  });
}

/** Download the CSV (auth header means a plain link cannot be used). */
export async function downloadSalesCsv(from: string, to: string): Promise<void> {
  const res = await authedFetch(`${env.apiUrl}/api/sales-reports/export?${qs({ from, to })}`);
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `sales-reports-${from}-to-${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Display formatting helpers shared by both portals. */
import { CLIENT_CODE_PREFIX, type ClientType } from "./enums.js";

/**
 * Generate a human-friendly client code, e.g. "GTB1256" / "GLW4821".
 * Random 4-digit suffix; the DB enforces uniqueness, so callers should retry on
 * the rare collision.
 */
export function generateClientCode(type: ClientType): string {
  return `${CLIENT_CODE_PREFIX[type]}${Math.floor(1000 + Math.random() * 9000)}`;
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const BUSINESS_TZ = "Asia/Kolkata"; // SRS §22.6 — the business runs on IST.

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  // DATA-7/MISC-9: pin to IST so a UTC server or an overseas staffer can never
  // render a "2026-11-01" session as Oct 31.
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: BUSINESS_TZ,
  }).format(d);
}

/** IST has no DST — a fixed +05:30 offset, so day math is uniform. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The calendar date (y/m/d) a timestamp shows in the business timezone (IST). */
export function istDateParts(d: Date): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { y: get("year"), m: get("month"), day: get("day") };
}

/** The instant at which the given timestamp's IST calendar day began. */
export function istStartOfDay(d: Date = new Date()): Date {
  const { y, m, day } = istDateParts(d);
  return new Date(Date.UTC(y, m - 1, day) - IST_OFFSET_MS);
}

/** The instant at which the given timestamp's IST calendar month began. */
export function istMonthStart(d: Date = new Date()): Date {
  const { y, m } = istDateParts(d);
  return new Date(Date.UTC(y, m - 1, 1) - IST_OFFSET_MS);
}

/** Add n calendar days (safe in IST: fixed offset, no DST transitions). */
export function istAddDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

export function daysUntil(date: Date | string): number {
  const target = typeof date === "string" ? new Date(date) : date;
  const a = istDateParts(target);
  const b = istDateParts(new Date());
  const ms =
    Date.UTC(a.y, a.m - 1, a.day) - Date.UTC(b.y, b.m - 1, b.day);
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** Title-case a snake_case enum value for display, e.g. "bank_transfer" -> "Bank Transfer". */
export function humanize(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

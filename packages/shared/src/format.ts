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

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function daysUntil(date: Date | string): number {
  const target = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  const ms =
    new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime() -
    new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** Title-case a snake_case enum value for display, e.g. "bank_transfer" -> "Bank Transfer". */
export function humanize(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

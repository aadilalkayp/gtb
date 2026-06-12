/**
 * Session schedule generation (SRS §7.3).
 *
 * Pure date math — no DB access — so it can run on both the backend (when
 * activating a client) and the frontend (to preview a schedule before commit).
 */
import type { ServiceType } from "./enums.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PlanServiceRule {
  serviceType: ServiceType;
  totalSessions: number;
  /** Days before the wedding this service should start. */
  startOffsetDays: number;
  /** Days between sessions. `null` => only the first session is auto-scheduled. */
  frequencyDays: number | null;
}

export interface GeneratedSession {
  serviceType: ServiceType;
  sessionNumber: number;
  scheduledDate: Date;
  /** True when the plan's intended start could not fit and the schedule was compressed. */
  compressed: boolean;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((stripTime(to).getTime() - stripTime(from).getTime()) / MS_PER_DAY);
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Generate session dates for a single service.
 *
 * Normal case: first session = wedding - startOffsetDays, then every
 * `frequencyDays`. If the enrollment date is already past the intended start
 * (late enrollment), the window is compressed to fit between enrollment and
 * wedding, distributing sessions evenly.
 */
export function generateServiceSessions(
  rule: PlanServiceRule,
  weddingDate: Date,
  enrollmentDate: Date,
): GeneratedSession[] {
  const sessions: GeneratedSession[] = [];
  if (rule.totalSessions <= 0) return sessions;

  const wedding = stripTime(weddingDate);
  const enrollment = stripTime(enrollmentDate);
  const intendedStart = addDays(wedding, -rule.startOffsetDays);
  const compressed = intendedStart < enrollment;

  // Manual-frequency services (e.g. styling): only auto-schedule the first session.
  if (rule.frequencyDays == null) {
    const first = compressed ? enrollment : intendedStart;
    sessions.push({
      serviceType: rule.serviceType,
      sessionNumber: 1,
      scheduledDate: first,
      compressed,
    });
    return sessions;
  }

  if (!compressed) {
    for (let i = 0; i < rule.totalSessions; i++) {
      const date = addDays(intendedStart, i * rule.frequencyDays);
      // Don't schedule past the wedding; clamp the last sessions to the wedding day.
      sessions.push({
        serviceType: rule.serviceType,
        sessionNumber: i + 1,
        scheduledDate: date > wedding ? wedding : date,
        compressed: false,
      });
    }
    return sessions;
  }

  // Compressed: distribute totalSessions evenly across [enrollment, wedding].
  const windowDays = Math.max(daysBetween(enrollment, wedding), 0);
  const step = rule.totalSessions > 1 ? windowDays / (rule.totalSessions - 1) : 0;
  for (let i = 0; i < rule.totalSessions; i++) {
    sessions.push({
      serviceType: rule.serviceType,
      sessionNumber: i + 1,
      scheduledDate: addDays(enrollment, Math.round(i * step)),
      compressed: true,
    });
  }
  return sessions;
}

export function generateSchedule(
  rules: PlanServiceRule[],
  weddingDate: Date,
  enrollmentDate: Date,
): GeneratedSession[] {
  return rules.flatMap((rule) => generateServiceSessions(rule, weddingDate, enrollmentDate));
}

/**
 * Build an evenly-spaced installment schedule for a plan (SRS §8.2).
 * First installment is due on the enrollment date; the rest are spread across
 * the plan duration.
 */
export interface GeneratedInstallment {
  installmentNumber: number;
  amount: number;
  dueDate: Date;
}

export function generateInstallments(
  totalPrice: number,
  installmentCount: number,
  durationMonths: number,
  enrollmentDate: Date,
): GeneratedInstallment[] {
  const count = Math.max(installmentCount, 1);
  // Split into whole rupees, putting any remainder on the first installment.
  const base = Math.floor(totalPrice / count);
  const remainder = totalPrice - base * count;
  const start = stripTime(enrollmentDate);
  const spanDays = durationMonths * 30;
  const step = count > 1 ? spanDays / count : 0;

  return Array.from({ length: count }, (_, i) => ({
    installmentNumber: i + 1,
    amount: i === 0 ? base + remainder : base,
    dueDate: addDays(start, Math.round(i * step)),
  }));
}

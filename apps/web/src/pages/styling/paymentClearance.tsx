import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, CircleAlert } from "lucide-react";
import { authedFetch } from "@/lib/api";
import { env } from "@/lib/env";
import { Badge, type Tone } from "@/components/ui/Badge";

/**
 * Has the client paid in full, so the stylist can go out for the offline
 * session? Stylists can't read the payment ledger, so this comes from
 * /api/styling/payment-status, which returns only a status per client id
 * (mirrors apps/api/src/app/api/styling/payment-status/route.ts).
 */
export type StylingPaymentStatus =
  | "paid_in_full"
  | "under_review"
  | "balance_due"
  | "price_pending"
  | "not_enrolled";

export function useStylingPaymentStatus(enabled = true) {
  return useQuery({
    queryKey: ["styling-payment-status"],
    enabled,
    queryFn: async () => {
      const res = await authedFetch(`${env.apiUrl}/api/styling/payment-status`);
      const json = (await res.json().catch(() => null)) as {
        statuses?: Record<string, StylingPaymentStatus>;
        error?: string;
      } | null;
      if (!res.ok || !json?.statuses) throw new Error(json?.error || `Request failed (${res.status})`);
      return json.statuses;
    },
  });
}

const DISPLAY: Record<StylingPaymentStatus, { tone: Tone; label: string; hint: string }> = {
  paid_in_full: {
    tone: "success",
    label: "Paid in full",
    hint: "Payment complete. Clear for the styling session.",
  },
  under_review: {
    tone: "info",
    label: "Payment under review",
    hint: "The client has submitted the remaining amount. GTB is verifying it.",
  },
  balance_due: {
    tone: "danger",
    label: "Payment pending",
    hint: "The client still has a balance. Hold the styling session until it is cleared.",
  },
  price_pending: {
    tone: "warning",
    label: "Fee not recorded",
    hint: "GTB has not recorded the agreed fee yet, so payment can't be confirmed.",
  },
  not_enrolled: {
    tone: "neutral",
    label: "No plan",
    hint: "The client is not enrolled in a plan.",
  },
};

export function PaymentClearanceBadge({
  status,
  className,
}: {
  status: StylingPaymentStatus | undefined;
  className?: string;
}) {
  if (!status) return null;
  const d = DISPLAY[status];
  const Icon = status === "paid_in_full" ? CheckCircle2 : status === "under_review" ? Clock : CircleAlert;
  return (
    <span title={d.hint} className={className}>
      <Badge tone={d.tone}>
        <Icon className="mr-1 h-3 w-3" /> {d.label}
      </Badge>
    </span>
  );
}

export function paymentClearanceHint(status: StylingPaymentStatus): string {
  return DISPLAY[status].hint;
}

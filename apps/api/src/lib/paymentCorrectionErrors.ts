import { PaymentCorrectionError } from "@gtb/db/server";

/** Map payment-correction failures to an HTTP status + user-facing message. */
export function correctionErrorResponse(e: unknown): { status: number; error: string } | null {
  if (e instanceof PaymentCorrectionError) return { status: 400, error: e.message };
  const msg = (e as Error).message;
  if (msg === "NOT_FOUND") return { status: 404, error: "Payment not found" };
  if (msg === "NOT_ASSIGNED") return { status: 403, error: "You are not assigned to this client" };
  if (msg === "FORBIDDEN") {
    return { status: 403, error: "Only the founder or ops head can change waivers" };
  }
  return null;
}

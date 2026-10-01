import { formatDate } from "@gtb/shared";
import { Badge } from "@/components/ui";

/** Staff-facing markers on a payment record: corrected, or carried over from the old system. */
export function PaymentMarkers({
  editedAt,
  legacyImported,
}: {
  editedAt: string | Date | null;
  legacyImported: boolean;
}) {
  if (!editedAt && !legacyImported) return null;
  return (
    <>
      {editedAt && (
        <span title={`Last edited ${formatDate(editedAt)}`}>
          <Badge tone="neutral">Edited</Badge>
        </span>
      )}
      {legacyImported && (
        <span title="Carried over from the old installment system. Check the amount matches what was actually paid.">
          <Badge tone="warning">Imported</Badge>
        </span>
      )}
    </>
  );
}

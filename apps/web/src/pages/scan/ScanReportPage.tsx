import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { fetchScanReport, type ScanReport } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { PRODUCT_NAME, ScanReportView } from "@/components/ScanReportView";
import { ScanShell } from "./ScanShell";

/**
 * Permanent home of a scan report: /scan/r/:scanId. Linked from the report
 * email and every share; the scanId is a bearer secret, so no login. The
 * post-claim screen navigates here with the report in route state to avoid a
 * refetch; direct visits (email, shares) load it from the API.
 */
export function ScanReportPage() {
  const { scanId } = useParams<{ scanId: string }>();
  const location = useLocation();
  const initial = (location.state as { report?: ScanReport; emailed?: boolean } | null) ?? null;
  const [report, setReport] = useState<ScanReport | null>(initial?.report ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (report || !scanId) return;
    fetchScanReport(scanId)
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Report not found"));
  }, [scanId, report]);

  return (
    <ScanShell>
      {error ? (
        <div className="card p-10 text-center">
          <p className="font-display text-lg font-semibold">We couldn't find that report</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Unclaimed scans are deleted after 24 hours. Take a fresh {PRODUCT_NAME} — it only takes
            a minute.
          </p>
          <Link
            to="/scan"
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            Start a new scan
          </Link>
        </div>
      ) : !report ? (
        <div className="flex justify-center py-24">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <ScanReportView report={report} emailed={initial?.emailed} />
      )}
    </ScanShell>
  );
}

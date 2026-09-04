import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, Share2 } from "lucide-react";
import type { ScanReport } from "@/lib/api";
import { env } from "@/lib/env";
import { Button, Modal } from "@/components/ui";
import {
  AttributeList,
  FocusAreas,
  GroomScoreGrid,
  HighlightsAndSuggestions,
  ReadinessHero,
  RoadmapList,
  ScoreBars,
} from "@/components/ScanResults";
import { SelfReportForm } from "@/components/SelfReportForm";

export const PRODUCT_NAME = "Transformation Readiness Scan";

export function scanReportUrl(scanId: string): string {
  return `${window.location.origin}/scan/r/${scanId}`;
}

export function scanCardUrl(scanId: string): string {
  return `${env.apiUrl}/api/scan/card?scanId=${encodeURIComponent(scanId)}`;
}

/**
 * Share the score card: native share sheet where available (mobile), copy
 * link elsewhere. The card image itself is rendered server-side and doubles
 * as the link's Open Graph preview (injected by the web Worker on /scan/r/*).
 */
export function ShareScore({ report }: { report: ScanReport }) {
  const [copied, setCopied] = useState(false);
  const url = scanReportUrl(report.scanId);
  const readiness = report.scores?.readiness ?? 0;
  const text = `I'm ${readiness}% wedding-ready with ${report.daysToWedding} days to go — take the free ${PRODUCT_NAME}`;

  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: PRODUCT_NAME, text, url });
        return;
      } catch {
        // user dismissed the sheet — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy your report link", url);
    }
  };

  return (
    <div className="card overflow-hidden">
      <img
        src={`${scanCardUrl(report.scanId)}&v=${readiness}`}
        alt={`${PRODUCT_NAME} score card: ${readiness} ready`}
        className="aspect-[1200/630] w-full bg-muted object-cover"
        loading="lazy"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          Share your score — friends can scan free too.
        </p>
        <Button variant="secondary" onClick={() => void share()}>
          {copied ? (
            <>
              <Check className="mr-1.5 h-4 w-4" /> Link copied
            </>
          ) : typeof navigator.share === "function" ? (
            <>
              <Share2 className="mr-1.5 h-4 w-4" /> Share
            </>
          ) : (
            <>
              <Copy className="mr-1.5 h-4 w-4" /> Copy link
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * The full report — rendered identically on the post-claim screen, the
 * emailed permalink (/scan/r/:id), and anywhere else a scan is shown to its
 * owner. Everything comes from the scan itself; no client-record data.
 *
 * `onReportChange` lets the self-assessment update the score in place.
 */
export function ScanReportView({
  report,
  emailed,
  onReportChange,
}: {
  report: ScanReport;
  emailed?: boolean;
  onReportChange?: (next: ScanReport) => void;
}) {
  const [showSelfReport, setShowSelfReport] = useState(false);

  if (!report.scores || !report.groomScore) {
    return (
      <p className="card p-10 text-center text-sm text-muted-foreground">
        This scan doesn't have a result yet.
      </p>
    );
  }
  const g = report.groomScore;

  return (
    <div className="animate-fade-up space-y-5">
      {emailed && (
        <p className="rounded-lg bg-success/10 px-4 py-2.5 text-sm text-success">
          Your report is in your inbox — this page is its permanent home.
        </p>
      )}

      <div className="card p-6">
        <ReadinessHero
          readiness={report.scores.readiness}
          appearance={report.scores.appearance}
          daysToWedding={report.daysToWedding}
          weddingDate={report.weddingDate}
        />
        <div className="mt-6">
          <GroomScoreGrid
            score={{
              appearance: g.appearance,
              fitness: g.fitness,
              confidence: g.confidence,
              prepProgress: g.prepProgress,
              scores: report.scores,
              labels: report.categoryLabels,
            }}
            onUnlockSelfReport={onReportChange ? () => setShowSelfReport(true) : undefined}
          />
        </div>
        {report.scores.style == null && (
          <p className="mt-3 text-xs text-muted-foreground">
            Style is scored from a full-body photo —{" "}
            <Link to="/scan" className="text-primary underline">
              rescan with one
            </Link>{" "}
            to unlock it (use the same email so your history stays together).
          </p>
        )}
      </div>

      <ShareScore report={report} />

      <div className="card space-y-5 p-6">
        <ScoreBars scores={report.scores} labels={report.categoryLabels} />
        <FocusAreas areas={report.focusAreas} />
        <AttributeList attributes={report.attributes} />
        <HighlightsAndSuggestions highlights={report.highlights} suggestions={report.suggestions} />
      </div>

      {report.roadmap.length > 0 && (
        <div className="card p-6">
          <h2 className="font-display text-lg font-semibold">Your prep roadmap</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Week-by-week focus built from your scan, plus the milestones every wedding needs.
          </p>
          <div className="mt-4">
            <RoadmapList items={report.roadmap} />
          </div>
        </div>
      )}

      <div className="card bg-gradient-to-br from-primary via-primary to-primary/80 p-6 text-primary-foreground">
        <h2 className="font-display text-xl font-semibold">Want the score to move?</h2>
        <p className="mt-1.5 text-sm leading-relaxed opacity-90">
          The scan shows where you stand — the GTB program is how the number climbs. Our team has
          your report and will reach out, or reply to your report email any time.
        </p>
        <p className="mt-4 text-xs opacity-80">
          Rescan monthly to watch your progress — use the same email so your history stays together.
        </p>
      </div>

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        Scores rate appearance only and are never a medical assessment. Fitness and Confidence come
        from your own answers, not your photo.{" "}
        <a href="/privacy" className="underline">
          Privacy
        </a>{" "}
        ·{" "}
        <a href="/terms" className="underline">
          Terms
        </a>
      </p>

      {onReportChange && (
        <Modal
          open={showSelfReport}
          onClose={() => setShowSelfReport(false)}
          title="Complete your Groom Score"
          size="md"
        >
          <p className="mb-4 text-sm text-muted-foreground">
            Eight quick questions. Fitness and Confidence can't be read from a photo, so they come
            from you — and they count toward your headline readiness.
          </p>
          <SelfReportForm
            scanId={report.scanId}
            initial={report.selfReport}
            onSaved={(next) => {
              onReportChange(next);
              setShowSelfReport(false);
            }}
            onCancel={() => setShowSelfReport(false)}
          />
        </Modal>
      )}
    </div>
  );
}

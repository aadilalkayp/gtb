import { useMemo, useState } from "react";
import { Camera, ScanFace, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFindManyRoadmapItem, useFindManyScan, useUpdateRoadmapItem } from "@gtb/db/hooks";
import {
  computeGroomScore,
  computePrepProgress,
  formatDate,
  scanCategoryLabels,
  type SelfReport,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { startScan } from "@/lib/api";
import { Button, Modal, Spinner } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import {
  AttributeList,
  FocusAreas,
  GroomScoreGrid,
  HighlightsAndSuggestions,
  ReadinessHero,
  RoadmapList,
  ScoreBars,
  type RoadmapEntry,
} from "@/components/ScanResults";
import { EMPTY_PHOTOS, ScanCapture, type CapturedPhotos } from "@/components/ScanCapture";
import { SelfReportForm } from "@/components/SelfReportForm";

/**
 * Portal home for the Transformation Readiness Scan: the composite Groom Score
 * (appearance + self-reported fitness/confidence + prep progress), the progress
 * graph (self-comparison only — the product never compares users to each
 * other), the tickable roadmap, and multi-photo rescans.
 */
export function PortalScan() {
  const { user } = useAuth();
  const clientId = user?.client?.id;
  const type = user?.client?.type ?? "groom";
  const labels = scanCategoryLabels(type);

  const [rescanOpen, setRescanOpen] = useState(false);
  const [selfReportOpen, setSelfReportOpen] = useState(false);
  const [photos, setPhotos] = useState<CapturedPhotos>(EMPTY_PHOTOS);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    data: scans,
    isLoading,
    refetch: refetchScans,
  } = useFindManyScan(
    {
      where: { clientId: clientId ?? "", status: "scored" },
      orderBy: { createdAt: "asc" },
    },
    { enabled: Boolean(clientId) },
  );
  const { data: roadmap, refetch: refetchRoadmap } = useFindManyRoadmapItem(
    { where: { clientId: clientId ?? "" }, orderBy: { dueDate: "asc" } },
    { enabled: Boolean(clientId) },
  );
  const updateItem = useUpdateRoadmapItem();

  const latest = scans?.[scans.length - 1];
  const previous = scans && scans.length > 1 ? scans[scans.length - 2] : undefined;

  // Composite score: recomputed live so ticking a roadmap item moves the number.
  const prepProgress = useMemo(() => computePrepProgress(roadmap ?? []), [roadmap]);
  const groom = useMemo(
    () =>
      latest?.readinessScore != null
        ? computeGroomScore({
            appearance: latest.readinessScore,
            fitness: latest.fitnessScore,
            confidence: latest.confidenceScore,
            prepProgress,
          })
        : null,
    [latest, prepProgress],
  );

  const rescan = async () => {
    if (!photos.front) return;
    setScanning(true);
    setError(null);
    try {
      await startScan({
        file: photos.front,
        fullBody: photos.fullBody,
        left: photos.left,
        right: photos.right,
      });
      await Promise.all([refetchScans(), refetchRoadmap()]);
      setRescanOpen(false);
      setPhotos(EMPTY_PHOTOS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed. Please try again.");
    } finally {
      setScanning(false);
    }
  };

  const toggleItem = (item: RoadmapEntry) => {
    updateItem.mutate({
      where: { id: item.id },
      data: { isDone: !item.isDone, doneAt: item.isDone ? null : new Date() },
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const chartData = (scans ?? [])
    .filter((s) => s.readinessScore != null)
    .map((s) => ({ label: formatDate(s.createdAt), appearance: s.readinessScore }));

  const delta =
    latest?.readinessScore != null && previous?.readinessScore != null
      ? latest.readinessScore - previous.readinessScore
      : null;

  const rescanModal = (
    <Modal
      open={rescanOpen}
      onClose={() => !scanning && setRescanOpen(false)}
      title="Rescan"
      size="md"
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Same angle, same light as last time for the truest comparison. Add a full-body photo to
        score Style.
      </p>
      <ScanCapture photos={photos} onChange={setPhotos} onError={setError} compact />
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <Button
        onClick={() => void rescan()}
        disabled={!photos.front || scanning}
        className="mt-4 w-full"
      >
        <Camera className="mr-1.5 h-4 w-4" /> {scanning ? "Scanning…" : "Scan"}
      </Button>
    </Modal>
  );

  if (!latest) {
    return (
      <>
        <EmptyState
          icon={ScanFace}
          title="No scan yet"
          hint="Take your first Transformation Readiness Scan — a selfie is all it takes."
          action={
            <Button onClick={() => setRescanOpen(true)}>
              <Camera className="mr-1.5 h-4 w-4" /> Scan now
            </Button>
          }
        />
        {rescanModal}
      </>
    );
  }

  const scores = {
    skin: latest.skinScore ?? 0,
    hair: latest.hairScore ?? 0,
    beard: latest.beardScore ?? 0,
    style: latest.styleScore,
  };

  return (
    <div className="animate-fade-up space-y-5">
      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <ReadinessHero
            readiness={groom?.overall ?? latest.readinessScore ?? 0}
            appearance={latest.readinessScore ?? undefined}
            daysToWedding={Math.max(
              0,
              Math.ceil(
                (new Date(latest.weddingDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
              ),
            )}
          />
          <Button variant="secondary" onClick={() => setRescanOpen(true)}>
            <Camera className="mr-1.5 h-4 w-4" /> Rescan
          </Button>
        </div>
        {delta != null && delta !== 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-success">
            <TrendingUp className="h-4 w-4" />
            {delta > 0
              ? `Your appearance score improved by ${delta} points since your last scan.`
              : `Down ${Math.abs(delta)} points since last scan — this week's roadmap gets you back.`}
          </p>
        )}
        <div className="mt-6">
          <GroomScoreGrid
            score={{
              appearance: latest.readinessScore ?? 0,
              fitness: latest.fitnessScore,
              confidence: latest.confidenceScore,
              prepProgress,
              scores,
              labels,
            }}
            onUnlockStyle={() => setRescanOpen(true)}
            onUnlockSelfReport={() => setSelfReportOpen(true)}
          />
        </div>
        {(latest.fitnessScore != null || latest.confidenceScore != null) && (
          <button
            type="button"
            onClick={() => setSelfReportOpen(true)}
            className="mt-3 text-xs font-medium text-primary hover:underline"
          >
            Update my fitness & confidence answers
          </button>
        )}
      </section>

      {chartData.length > 1 && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Your progress</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Appearance score, scan after scan — compared with yourself only.
          </p>
          <div className="mt-3 h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradReadiness" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--surface))",
                    borderRadius: 10,
                    border: "1px solid hsl(var(--border))",
                    fontSize: 13,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="appearance"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  fill="url(#gradReadiness)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="card space-y-5 p-6">
        <ScoreBars scores={scores} labels={labels} />
        <FocusAreas
          areas={(latest.focusAreas as { area: string; weight: number }[] | null) ?? []}
        />
        <AttributeList
          attributes={
            (latest.attributes as { key: string; label: string; score: number }[] | null) ?? []
          }
        />
        <HighlightsAndSuggestions highlights={latest.highlights} suggestions={latest.suggestions} />
      </section>

      {(roadmap?.length ?? 0) > 0 && (
        <section className="card p-6">
          <h2 className="font-display text-lg font-semibold">Your prep roadmap</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tick items off as you go — every on-time tick lifts your readiness, and weekly focus
            refreshes with every rescan.
          </p>
          <div className="mt-4">
            <RoadmapList items={roadmap ?? []} onToggle={toggleItem} />
          </div>
        </section>
      )}

      {rescanModal}

      <Modal
        open={selfReportOpen}
        onClose={() => setSelfReportOpen(false)}
        title="Complete your Groom Score"
        size="md"
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Fitness and Confidence can't be read from a photo, so they come from you — and they count
          toward your headline readiness.
        </p>
        <SelfReportForm
          scanId={latest.id}
          initial={(latest.selfReport as SelfReport | null) ?? null}
          onSaved={() => {
            void refetchScans();
            setSelfReportOpen(false);
          }}
          onCancel={() => setSelfReportOpen(false)}
        />
      </Modal>
    </div>
  );
}

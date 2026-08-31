import { useRef, useState } from "react";
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
import { formatDate } from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { startScan } from "@/lib/api";
import { checkFraming } from "@/lib/framing";
import { Button, Spinner } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import {
  FocusAreas,
  HighlightsAndSuggestions,
  ReadinessHero,
  RoadmapList,
  ScoreBars,
  type RoadmapEntry,
} from "@/components/ScanResults";

/**
 * Portal home for the Transformation Readiness Scan: latest scores, the progress
 * graph (self-comparison only — the product never compares users to each
 * other), the tickable roadmap, and monthly rescan.
 */
export function PortalScan() {
  const { user } = useAuth();
  const clientId = user?.client?.id;
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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

  const rescan = async (file: File | null) => {
    if (!file) return;
    setScanning(true);
    setError(null);
    try {
      const framingError = await checkFraming(file);
      if (framingError) {
        setError(framingError);
        return;
      }
      await startScan({ file });
      await Promise.all([refetchScans(), refetchRoadmap()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed. Please try again.");
    } finally {
      setScanning(false);
      if (fileInput.current) fileInput.current.value = "";
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
    .map((s) => ({
      label: formatDate(s.createdAt),
      readiness: s.readinessScore,
      skin: s.skinScore,
    }));

  const delta =
    latest?.readinessScore != null && previous?.readinessScore != null
      ? latest.readinessScore - previous.readinessScore
      : null;

  return (
    <div className="animate-fade-up space-y-5">
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        className="hidden"
        onChange={(e) => void rescan(e.target.files?.[0] ?? null)}
      />

      {!latest ? (
        <EmptyState
          icon={ScanFace}
          title="No scan yet"
          hint="Take your first Transformation Readiness Scan — a selfie is all it takes."
          action={
            <Button onClick={() => fileInput.current?.click()} disabled={scanning}>
              <Camera className="mr-1.5 h-4 w-4" /> {scanning ? "Scanning…" : "Scan now"}
            </Button>
          }
        />
      ) : (
        <>
          <section className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <ReadinessHero
                readiness={latest.readinessScore ?? 0}
                daysToWedding={Math.max(
                  0,
                  Math.ceil(
                    (new Date(latest.weddingDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
                  ),
                )}
              />
              <Button
                variant="secondary"
                onClick={() => fileInput.current?.click()}
                disabled={scanning}
              >
                <Camera className="mr-1.5 h-4 w-4" /> {scanning ? "Scanning…" : "Rescan"}
              </Button>
            </div>
            {delta != null && delta !== 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-success">
                <TrendingUp className="h-4 w-4" />
                {delta > 0
                  ? `Your readiness improved by ${delta} points since your last scan.`
                  : `Down ${Math.abs(delta)} points since last scan — this week's roadmap gets you back.`}
              </p>
            )}
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <ScoreBars
              scores={{
                skin: latest.skinScore ?? 0,
                hair: latest.hairScore ?? 0,
                beard: latest.beardScore ?? 0,
                style: latest.styleScore ?? 0,
              }}
              className="mt-6"
            />
          </section>

          {chartData.length > 1 && (
            <section className="card p-5">
              <h2 className="text-sm font-semibold">Your progress</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Compared with yourself, scan after scan.
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
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
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
                      dataKey="readiness"
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
            <FocusAreas
              areas={(latest.focusAreas as { area: string; weight: number }[] | null) ?? []}
            />
            <HighlightsAndSuggestions
              highlights={latest.highlights}
              suggestions={latest.suggestions}
            />
          </section>

          {(roadmap?.length ?? 0) > 0 && (
            <section className="card p-6">
              <h2 className="font-display text-lg font-semibold">Your prep roadmap</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tick items off as you go — weekly focus refreshes with every rescan.
              </p>
              <div className="mt-4">
                <RoadmapList items={roadmap ?? []} onToggle={toggleItem} />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

import { useState } from "react";
import { Camera, ScanFace } from "lucide-react";
import { useFindManyRoadmapItem, useFindManyScan } from "@gtb/db/hooks";
import { formatDate, scanCategoryLabels } from "@gtb/shared";
import { getScanPhotoUrl } from "@/lib/api";
import { Badge, Button, Modal, Spinner } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { RoadmapList, ScoreBars } from "@/components/ScanResults";

/** Read-only scan history + roadmap on the staff 360° view. */
export function ClientScansTab({ clientId }: { clientId: string }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState<string | null>(null);

  const { data: scans, isLoading } = useFindManyScan({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
  const { data: roadmap } = useFindManyRoadmapItem({
    where: { clientId },
    orderBy: { dueDate: "asc" },
  });

  const viewPhoto = async (scanId: string) => {
    setPhotoLoading(scanId);
    try {
      setPhotoUrl(await getScanPhotoUrl(scanId));
    } finally {
      setPhotoLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!scans?.length) {
    return (
      <EmptyState
        icon={ScanFace}
        title="No readiness scans"
        hint="Scans from the public funnel and portal rescans will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {scans.map((scan, i) => (
          <div key={scan.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium">{formatDate(scan.createdAt)}</p>
                {i === 0 && <Badge tone="info">Latest</Badge>}
                {scan.status !== "scored" && <StatusNote status={scan.status} />}
                <span className="text-xs text-muted-foreground">
                  via {scan.source} · {scan.modelVersion ?? "—"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {scan.readinessScore != null && (
                  <p className="font-num text-sm">
                    Appearance <span className="text-lg font-bold">{scan.readinessScore}</span>
                    {scan.fitnessScore != null && (
                      <span className="ml-3 text-xs text-muted-foreground">
                        Fitness {scan.fitnessScore}
                      </span>
                    )}
                    {scan.confidenceScore != null && (
                      <span className="ml-3 text-xs text-muted-foreground">
                        Confidence {scan.confidenceScore}
                      </span>
                    )}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void viewPhoto(scan.id)}
                  disabled={photoLoading === scan.id}
                >
                  <Camera className="mr-1 h-3.5 w-3.5" />
                  {photoLoading === scan.id ? "Loading…" : "Photo"}
                </Button>
              </div>
            </div>
            {scan.status === "scored" && (
              <ScoreBars
                scores={{
                  skin: scan.skinScore ?? 0,
                  hair: scan.hairScore ?? 0,
                  beard: scan.beardScore ?? 0,
                  style: scan.styleScore,
                }}
                labels={scanCategoryLabels(scan.type)}
                className="mt-4 max-w-md"
              />
            )}
          </div>
        ))}
      </div>

      {(roadmap?.length ?? 0) > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold">Readiness roadmap</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Self-serve prep plan generated from the client's scans (read-only).
          </p>
          <div className="mt-3">
            <RoadmapList items={roadmap ?? []} />
          </div>
        </div>
      )}

      {photoUrl && (
        <Modal open title="Scan photo" onClose={() => setPhotoUrl(null)}>
          <img src={photoUrl} alt="Scan selfie" className="w-full rounded-lg" />
        </Modal>
      )}
    </div>
  );
}

function StatusNote({ status }: { status: string }) {
  return <Badge tone={status === "failed" ? "danger" : "warning"}>{status}</Badge>;
}

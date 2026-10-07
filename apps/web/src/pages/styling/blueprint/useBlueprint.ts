import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFindUniqueStylingBlueprint } from "@gtb/db/hooks";
import {
  buildBlueprintSnapshot,
  snapshotsEqual,
  type BlueprintDraft,
  type BlueprintSnapshot,
} from "@gtb/shared";
import { stylingMediaKey, useStylingMedia } from "@/lib/stylingApi";

/**
 * Everything the staff Styling tab needs: the draft (gateway, policy-scoped),
 * the latest published version, the client's photos and stylist images with
 * signed URLs, and derived draft / published snapshots.
 */
export function useBlueprint(clientId: string) {
  const qc = useQueryClient();
  const query = useFindUniqueStylingBlueprint({
    where: { clientId },
    include: {
      looks: { orderBy: { sortOrder: "asc" } },
      palettes: { orderBy: { sortOrder: "asc" } },
      items: { orderBy: { sortOrder: "asc" } },
      essentials: { orderBy: { sortOrder: "asc" } },
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        include: { publishedBy: { select: { name: true } } },
      },
      client: {
        select: {
          id: true,
          name: true,
          clientCode: true,
          status: true,
          weddingDate: true,
          clientPlan: { select: { planNameSnapshot: true } },
          assignments: {
            where: { isActive: true, role: "styling_consultant" },
            select: { staffId: true, staff: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  const media = useStylingMedia(clientId);

  const bp = query.data ?? null;
  const latest = bp?.versions[0] ?? null;

  const images = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const i of media.data?.images ?? []) out[i.id] = i.url;
    return out;
  }, [media.data]);

  const draft: BlueprintSnapshot | null = useMemo(() => {
    if (!bp) return null;
    // Same normalisation the server applies on publish; only the client's own
    // styling images survive (unknown ids would be dropped there too).
    const allowed = new Set((media.data?.images ?? []).map((i) => i.id));
    return buildBlueprintSnapshot(
      bp as unknown as BlueprintDraft,
      media.data ? allowed : undefined,
    );
  }, [bp, media.data]);

  const published = (latest?.snapshot ?? null) as BlueprintSnapshot | null;
  const hasDraftChanges = Boolean(published && draft && !snapshotsEqual(draft, published));

  return {
    query,
    media,
    bp,
    latest,
    published,
    draft,
    images,
    hasDraftChanges,
    refreshMedia: () => qc.invalidateQueries({ queryKey: stylingMediaKey(clientId) }),
  };
}

export type BlueprintData = NonNullable<ReturnType<typeof useBlueprint>["bp"]>;

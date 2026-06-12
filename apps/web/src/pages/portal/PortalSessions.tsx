import { useMemo, useState } from "react";
import { useFindManySession, useUpdateSession } from "@gtb/db/hooks";
import {
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  formatDate,
  daysUntil,
  type ServiceType,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { RatingStars, RatingInput } from "@/components/RatingStars";
import { EmptyState } from "@/components/EmptyState";
import { Button, Modal, Spinner, StatusBadge, Tabs, Textarea, type TabDef } from "@/components/ui";
import { CalendarCheck } from "lucide-react";

type Filter = "all" | ServiceType;

const SERVICE_DOT: Record<ServiceType, string> = {
  skincare: "bg-info",
  fitness: "bg-success",
  styling: "bg-bride",
};

export function PortalSessions() {
  const { user } = useAuth();
  const clientId = user?.client?.id;
  const [filter, setFilter] = useState<Filter>("all");
  const [rating, setRating] = useState<{ id: string; label: string } | null>(null);

  const {
    data: sessions,
    isLoading,
    refetch,
  } = useFindManySession(
    {
      where: { clientId: clientId ?? "" },
      orderBy: { scheduledDate: "asc" },
    },
    { enabled: Boolean(clientId) },
  );

  const tabs: TabDef<Filter>[] = useMemo(() => {
    const present = new Set(sessions?.map((s) => s.serviceType));
    return [
      { id: "all" as Filter, label: "All" },
      ...SERVICE_TYPES.filter((s) => present.has(s)).map((s) => ({
        id: s as Filter,
        label: SERVICE_TYPE_LABELS[s],
      })),
    ];
  }, [sessions]);

  const visible = (sessions ?? []).filter((s) => filter === "all" || s.serviceType === filter);
  const upcoming = visible.filter((s) => s.status === "scheduled" || s.status === "delayed");
  const past = visible.filter((s) => s.status !== "scheduled" && s.status !== "delayed").reverse();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">My sessions</h1>

      {tabs.length > 1 && <Tabs tabs={tabs} active={filter} onChange={setFilter} />}

      {!visible.length ? (
        <EmptyState
          icon={CalendarCheck}
          title="No sessions yet"
          hint="Your schedule appears here once your team activates your program."
        />
      ) : (
        <>
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Upcoming</h2>
              <div className="card divide-y divide-border">
                {upcoming.map((s) => (
                  <SessionRow key={s.id} session={s} onRate={() => undefined} />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Past</h2>
              <div className="card divide-y divide-border">
                {past.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    onRate={() =>
                      setRating({
                        id: s.id,
                        label: `${SERVICE_TYPE_LABELS[s.serviceType as ServiceType]} session ${s.sessionNumber}`,
                      })
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {rating && (
        <RateSessionModal
          sessionId={rating.id}
          label={rating.label}
          onClose={() => setRating(null)}
          onDone={() => {
            setRating(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

function SessionRow({
  session: s,
  onRate,
}: {
  session: {
    id: string;
    serviceType: string;
    sessionNumber: number;
    scheduledDate: Date | string;
    actualDate?: Date | string | null;
    status: string;
    rating: number | null;
  };
  onRate: () => void;
}) {
  const svc = s.serviceType as ServiceType;
  const isUpcoming = s.status === "scheduled" || s.status === "delayed";
  const dl = daysUntil(s.scheduledDate);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${SERVICE_DOT[svc]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {SERVICE_TYPE_LABELS[svc]} · Session {s.sessionNumber}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDate(s.actualDate ?? s.scheduledDate)}
          {isUpcoming && dl === 0 && " · Today"}
          {isUpcoming && dl === 1 && " · Tomorrow"}
          {isUpcoming && dl > 1 && ` · in ${dl} days`}
        </p>
      </div>
      {s.status === "completed" &&
        (s.rating != null ? (
          <RatingStars value={s.rating} />
        ) : (
          <Button size="sm" variant="outline" onClick={onRate}>
            Rate
          </Button>
        ))}
      <StatusBadge status={s.status} />
    </div>
  );
}

function RateSessionModal({
  sessionId,
  label,
  onClose,
  onDone,
}: {
  sessionId: string;
  label: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const updateSession = useUpdateSession();
  const [stars, setStars] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string>();

  async function submit() {
    if (!stars) {
      setError("Tap a star to rate.");
      return;
    }
    setError(undefined);
    try {
      await updateSession.mutateAsync({
        where: { id: sessionId },
        data: { rating: stars, ratingFeedback: feedback.trim() || null },
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your rating");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Rate your session"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={updateSession.isPending}>
            Submit
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex justify-center py-2">
          <RatingInput value={stars} onChange={setStars} size="lg" />
        </div>
        <Textarea
          rows={3}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Anything you'd like to share? (optional)"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

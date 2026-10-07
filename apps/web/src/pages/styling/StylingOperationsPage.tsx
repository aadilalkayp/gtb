import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, MapPin, Plane, Scissors } from "lucide-react";
import {
  useFindManyStylingOperation,
  useUpdateStylingOperation,
  useCreateStylingOperation,
  useFindManyClient,
  useFindManyUser,
} from "@gtb/db/hooks";
import { formatDate, daysUntil } from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  PillFilter,
  Select,
  Spinner,
  StatusBadge,
  Tabs,
  Textarea,
} from "@/components/ui";
import { BlueprintQueue } from "./BlueprintQueue";
import { StylingLibrary } from "./StylingLibrary";
import { cn } from "@/lib/utils";
import {
  PaymentClearanceBadge,
  paymentClearanceHint,
  useStylingPaymentStatus,
} from "./paymentClearance";

type Filter = "all" | "upcoming" | "in_progress" | "completed";

const CHECKLIST: { key: ChecklistKey; doneAtKey: string; label: string }[] = [
  { key: "consultationDone", doneAtKey: "consultationDoneAt", label: "Consultation done" },
  { key: "outfitFinalized", doneAtKey: "outfitFinalizedAt", label: "Outfit finalized" },
  {
    key: "accessoriesFinalized",
    doneAtKey: "accessoriesFinalizedAt",
    label: "Accessories finalized",
  },
  { key: "guideDelivered", doneAtKey: "guideDeliveredAt", label: "Styling guide delivered" },
  { key: "finalConfirmation", doneAtKey: "finalConfirmationAt", label: "Final confirmation" },
];

type ChecklistKey =
  | "consultationDone"
  | "outfitFinalized"
  | "accessoriesFinalized"
  | "guideDelivered"
  | "finalConfirmation";

type PageTab = "blueprints" | "days" | "library";

/**
 * Styling Operations: the Blueprint queue (STYLING_BLUEPRINT.md, S1), the
 * styling-day logistics checklist, and the styling team's library.
 */
export function StylingOperationsPage() {
  const { role } = useAuth();
  const isAdmin = role === "founder" || role === "ops_head";
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("tab");
  const tab: PageTab = fromUrl === "days" || fromUrl === "library" ? fromUrl : "blueprints";
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="page">
      <PageHeader
        title="Styling Operations"
        subtitle="Styling Blueprints, styling-day logistics and the styling library."
        actions={
          isAdmin &&
          tab === "days" && (
            <Button onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4" /> New operation
            </Button>
          )
        }
      />
      <Tabs
        className="mt-5"
        tabs={[
          { id: "blueprints", label: "Blueprints" },
          { id: "days", label: "Styling days" },
          { id: "library", label: "Library" },
        ]}
        active={tab}
        onChange={(next) =>
          setParams(next === "blueprints" ? {} : { tab: next }, { replace: true })
        }
      />
      <div className="mt-5">
        {tab === "blueprints" && <BlueprintQueue />}
        {tab === "days" && <StylingDays showNew={showNew} onCloseNew={() => setShowNew(false)} />}
        {tab === "library" && <StylingLibrary />}
      </div>
    </div>
  );
}

function StylingDays({ showNew, onCloseNew }: { showNew: boolean; onCloseNew: () => void }) {
  const { user, role } = useAuth();
  const isAdmin = role === "founder" || role === "ops_head";
  const [filter, setFilter] = useState<Filter>("all");

  const {
    data: ops,
    isLoading,
    refetch,
  } = useFindManyStylingOperation({
    where: filter === "all" ? undefined : { status: filter },
    include: {
      client: { select: { id: true, name: true, clientCode: true, weddingDate: true } },
      stylist: { select: { id: true, name: true } },
    },
    orderBy: { stylingDate: "asc" },
  });

  const updateOp = useUpdateStylingOperation();
  const { data: paymentStatus } = useStylingPaymentStatus();

  async function toggleItem(
    op: { id: string } & Record<string, unknown>,
    item: (typeof CHECKLIST)[number],
  ) {
    const next = !op[item.key];
    const updated = { ...op, [item.key]: next };
    const checkedCount = CHECKLIST.filter((c) => updated[c.key]).length;
    const status =
      checkedCount === CHECKLIST.length
        ? "completed"
        : checkedCount > 0
          ? "in_progress"
          : "upcoming";
    await updateOp.mutateAsync({
      where: { id: op.id },
      data: {
        [item.key]: next,
        [item.doneAtKey]: next ? new Date() : null,
        status,
      },
    });
    await refetch();
  }

  return (
    <div>
      <PillFilter
        options={[
          { id: "all", label: "All" },
          { id: "upcoming", label: "Upcoming" },
          { id: "in_progress", label: "In progress" },
          { id: "completed", label: "Completed" },
        ]}
        active={filter}
        onChange={setFilter}
      />

      <div className="mt-5">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        ) : !ops?.length ? (
          <EmptyState
            icon={Scissors}
            title="No styling operations"
            hint="Create one to start tracking outfits, travel, and delivery."
          />
        ) : (
          <div className="stagger-children grid gap-4 lg:grid-cols-2">
            {ops.map((op) => {
              const checked = CHECKLIST.filter((c) => op[c.key]).length;
              const canEdit = isAdmin || op.stylistId === user?.id;
              const dl = op.stylingDate ? daysUntil(op.stylingDate) : null;
              const payment = paymentStatus?.[op.client.id];
              return (
                <div key={op.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/clients/${op.client.id}`}
                          className="font-semibold hover:underline"
                        >
                          {op.client.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {op.client.clientCode}
                        </span>
                        <StatusBadge status={op.status} />
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {op.stylingDate ? formatDate(op.stylingDate) : "Date TBC"}
                          {dl != null && dl >= 0 && dl <= 7 && (
                            <span className="ml-1 font-medium text-warning">
                              ({dl === 0 ? "today" : `in ${dl}d`})
                            </span>
                          )}
                        </span>
                        {op.stylingLocation && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {op.stylingLocation}
                          </span>
                        )}
                        {op.stylist && <span>Stylist: {op.stylist.name}</span>}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PaymentClearanceBadge status={payment} />
                      {op.travelRequired && (
                        <Badge tone="warning">
                          <Plane className="mr-1 h-3 w-3" /> Travel
                        </Badge>
                      )}
                    </div>
                  </div>

                  {payment && payment !== "paid_in_full" && op.status !== "completed" && (
                    <p
                      className={cn(
                        "mt-2 rounded-lg px-3 py-1.5 text-xs",
                        payment === "balance_due"
                          ? "bg-danger/5 text-danger"
                          : "bg-muted/60 text-muted-foreground",
                      )}
                    >
                      {paymentClearanceHint(payment)}
                    </p>
                  )}

                  {op.travelRequired && op.travelDetails && (
                    <p className="mt-2 rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
                      {op.travelDetails}
                    </p>
                  )}

                  {/* Checklist */}
                  <div className="mt-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Checklist</span>
                      <span className="font-num font-medium">
                        {checked}/{CHECKLIST.length}
                      </span>
                    </div>
                    <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${(checked / CHECKLIST.length) * 100}%` }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      {CHECKLIST.map((item) => {
                        const done = Boolean(op[item.key]);
                        const at = op[item.doneAtKey as keyof typeof op] as Date | string | null;
                        return (
                          <label
                            key={item.key}
                            className={cn(
                              "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm",
                              canEdit
                                ? "cursor-pointer transition-colors hover:bg-muted/60"
                                : "cursor-default",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={done}
                              disabled={!canEdit || updateOp.isPending}
                              onChange={() => void toggleItem(op, item)}
                              className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
                            />
                            <span className={cn(done && "text-muted-foreground line-through")}>
                              {item.label}
                            </span>
                            {done && at && (
                              <span className="ml-auto text-[11px] text-muted-foreground">
                                {formatDate(at)}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showNew && (
        <NewOperationModal
          onClose={onCloseNew}
          onDone={() => {
            onCloseNew();
            void refetch();
          }}
        />
      )}
    </div>
  );
}

function NewOperationModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const createOp = useCreateStylingOperation();
  const { data: clients } = useFindManyClient({
    where: { status: { in: ["converted", "active"] } },
    select: { id: true, name: true, clientCode: true },
    orderBy: { name: "asc" },
  });
  const { data: stylists } = useFindManyUser({
    where: { role: "styling_consultant", isActive: true },
    orderBy: { name: "asc" },
  });

  const [clientId, setClientId] = useState("");
  const [stylistId, setStylistId] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [travel, setTravel] = useState(false);
  const [travelDetails, setTravelDetails] = useState("");
  const [error, setError] = useState<string>();

  async function create() {
    if (!clientId) {
      setError("Pick a client.");
      return;
    }
    setError(undefined);
    try {
      await createOp.mutateAsync({
        data: {
          clientId,
          stylistId: stylistId || undefined,
          stylingDate: date ? new Date(date) : undefined,
          stylingLocation: location.trim() || undefined,
          travelRequired: travel,
          travelDetails: travel ? travelDetails.trim() || undefined : undefined,
        },
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the operation");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New styling operation"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} loading={createOp.isPending}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Client" required>
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— Select —</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.clientCode})
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Stylist">
            <Select value={stylistId} onChange={(e) => setStylistId(e.target.value)}>
              <option value="">— Unassigned —</option>
              {stylists?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Styling date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Location">
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City or venue"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={travel}
            onChange={(e) => setTravel(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Stylist needs to travel
        </label>
        {travel && (
          <Field label="Travel details">
            <Textarea
              rows={2}
              value={travelDetails}
              onChange={(e) => setTravelDetails(e.target.value)}
              placeholder="Flights, stay, logistics…"
            />
          </Field>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

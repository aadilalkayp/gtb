import { useMemo, useRef, useState } from "react";
import { Plus, Clapperboard, CalendarClock, GripVertical } from "lucide-react";
import {
  useFindManyContentItem,
  useCreateContentItem,
  useUpdateContentItem,
  useFindManyUser,
} from "@gtb/db/hooks";
import {
  CONTENT_STAGES,
  CONTENT_TYPES,
  CONTENT_PLATFORMS,
  CAMPAIGNS,
  formatDate,
  daysUntil,
  humanize,
  type ContentStage,
  type ContentType,
  type ContentPlatform,
  type Campaign,
} from "@gtb/shared";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import {
  Avatar,
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { cn } from "@/lib/utils";

interface ContentRow {
  id: string;
  title: string;
  contentType: string;
  campaign: string;
  platform: string;
  status: string;
  deadline: string | Date | null;
  ownerId: string | null;
  owner: { id: string; name: string; avatarUrl: string | null } | null;
}

const STAGE_BAR: Record<ContentStage, string> = {
  planned: "bg-border",
  shooting: "bg-info",
  editing: "bg-warning",
  review: "bg-bride",
  posted: "bg-success",
};

export function MediaPage() {
  const [showNew, setShowNew] = useState(false);
  const [campaign, setCampaign] = useState<"all" | Campaign>("all");
  const [platform, setPlatform] = useState<"all" | ContentPlatform>("all");
  const [owner, setOwner] = useState<"all" | string>("all");
  const [dragOver, setDragOver] = useState<ContentStage | null>(null);
  const draggingId = useRef<string | null>(null);

  const { data, isLoading, refetch } = useFindManyContentItem({
    include: { owner: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { deadline: "asc" },
  });
  const updateItem = useUpdateContentItem();

  const { data: owners } = useFindManyUser({
    where: { role: { in: ["media", "founder"] }, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const items = (data ?? []) as unknown as ContentRow[];

  const filtered = useMemo(
    () =>
      items.filter((c) => {
        if (campaign !== "all" && c.campaign !== campaign) return false;
        if (platform !== "all" && c.platform !== platform) return false;
        if (owner !== "all" && c.ownerId !== owner) return false;
        return true;
      }),
    [items, campaign, platform, owner],
  );

  const byStage = useMemo(() => {
    const map = {} as Record<ContentStage, ContentRow[]>;
    for (const s of CONTENT_STAGES) map[s] = [];
    for (const c of filtered) (map[c.status as ContentStage] ?? map.planned).push(c);
    return map;
  }, [filtered]);

  async function moveTo(id: string, status: ContentStage) {
    const item = items.find((c) => c.id === id);
    if (!item || item.status === status) return;
    await updateItem.mutateAsync({ where: { id }, data: { status } });
    await refetch();
  }

  function onDrop(status: ContentStage) {
    const id = draggingId.current;
    draggingId.current = null;
    setDragOver(null);
    if (id) void moveTo(id, status);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Media"
        subtitle="Plan, produce, and publish content across campaigns."
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" /> New content
          </Button>
        }
      />

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Select
          value={campaign}
          onChange={(e) => setCampaign(e.target.value as typeof campaign)}
          className="w-auto"
        >
          <option value="all">All campaigns</option>
          {CAMPAIGNS.map((c) => (
            <option key={c} value={c}>
              {humanize(c)}
            </option>
          ))}
        </Select>
        <Select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as typeof platform)}
          className="w-auto"
        >
          <option value="all">All platforms</option>
          {CONTENT_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {humanize(p)}
            </option>
          ))}
        </Select>
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-auto">
          <option value="all">All owners</option>
          {owners?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : !items.length ? (
        <div className="mt-6">
          <EmptyState
            icon={Clapperboard}
            title="No content yet"
            hint="Create your first content item to start the pipeline."
          />
        </div>
      ) : (
        <div className="mt-5 flex gap-4 overflow-x-auto pb-2">
          {CONTENT_STAGES.map((stage) => {
            const list = byStage[stage];
            const active = dragOver === stage;
            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOver !== stage) setDragOver(stage);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
                }}
                onDrop={() => onDrop(stage)}
                className={cn(
                  "w-[270px] shrink-0 rounded-card border bg-muted/30 p-3 transition-colors",
                  active ? "border-primary/50 bg-primary/5" : "border-border",
                )}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="flex items-center gap-2 text-sm font-semibold capitalize">
                    <span className={cn("h-2.5 w-2.5 rounded-full", STAGE_BAR[stage])} />
                    {stage}
                  </span>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">
                    {list.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {list.map((c) => (
                    <ContentCard
                      key={c.id}
                      item={c}
                      onDragStart={() => (draggingId.current = c.id)}
                    />
                  ))}
                  {!list.length && (
                    <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                      Drop here
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew && (
        <NewContentModal
          owners={owners ?? []}
          onClose={() => setShowNew(false)}
          onDone={() => {
            setShowNew(false);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

function ContentCard({ item: c, onDragStart }: { item: ContentRow; onDragStart: () => void }) {
  const overdue = c.deadline && c.status !== "posted" && daysUntil(c.deadline) < 0;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="card group cursor-grab p-3 active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{c.title}</p>
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="info">{humanize(c.contentType)}</Badge>
        <Badge tone="neutral">{humanize(c.campaign)}</Badge>
        <span className="text-xs capitalize text-muted-foreground">{humanize(c.platform)}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
        {c.owner ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Avatar
              name={c.owner.name}
              src={c.owner.avatarUrl}
              size="sm"
              className="h-5 w-5 text-[10px]"
            />
            <span className="truncate">{c.owner.name.split(" ")[0]}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Unassigned</span>
        )}
        {c.deadline && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
              overdue ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground",
            )}
          >
            <CalendarClock className="h-3 w-3" />
            {overdue ? "Overdue" : formatDate(c.deadline)}
          </span>
        )}
      </div>
    </div>
  );
}

function NewContentModal({
  owners,
  onClose,
  onDone,
}: {
  owners: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const createItem = useCreateContentItem();
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<ContentType>("reel");
  const [campaign, setCampaign] = useState<Campaign>("gtb");
  const [platform, setPlatform] = useState<ContentPlatform>("instagram");
  const [ownerId, setOwnerId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>();

  async function create() {
    if (!title.trim()) return setError("Add a title.");
    setError(undefined);
    try {
      await createItem.mutateAsync({
        data: {
          title: title.trim(),
          contentType,
          campaign,
          platform,
          ownerId: ownerId || undefined,
          deadline: deadline ? new Date(deadline) : undefined,
          notes: notes.trim() || undefined,
        },
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the content item");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New content"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} loading={createItem.isPending}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's the content?"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type" required>
            <Select
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType)}
            >
              {CONTENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Campaign" required>
            <Select value={campaign} onChange={(e) => setCampaign(e.target.value as Campaign)}>
              {CAMPAIGNS.map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Platform" required>
            <Select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as ContentPlatform)}
            >
              {CONTENT_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {humanize(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Owner">
            <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">— Unassigned —</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Deadline">
          <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Brief, references…"
          />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

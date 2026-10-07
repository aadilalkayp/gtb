import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Library,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useCreateStylingEssential,
  useCreateStylingItem,
  useCreateStylingLook,
  useCreateStylingPalette,
  useDeleteStylingEssential,
  useDeleteStylingItem,
  useDeleteStylingLook,
  useDeleteStylingPalette,
  useFindManyStylingLibraryItem,
  useUpdateStylingBlueprint,
  useUpdateStylingEssential,
  useUpdateStylingItem,
  useUpdateStylingLook,
  useUpdateStylingPalette,
} from "@gtb/db/hooks";
import {
  BLUEPRINT_SECTION_LABELS,
  EYEWEAR_RECOMMENDATIONS,
  ITEM_KIND_SECTION,
  SHOPPING_CATEGORIES,
  STYLING_ITEM_PRIORITY_LABELS,
  isHexColor,
  type BlueprintSection,
  type StylingItemKind,
  type StylingLibraryKind,
} from "@gtb/shared";
import { uploadStylingImage } from "@/lib/stylingApi";
import { Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { BlueprintImage } from "@/components/styling/BlueprintView";
import { cn } from "@/lib/utils";
import type { BlueprintData, useBlueprint } from "./useBlueprint";

type Data = ReturnType<typeof useBlueprint>;

interface EditorProps {
  clientId: string;
  data: Data;
  bp: BlueprintData;
  canEdit: boolean;
}

const ITEM_SECTIONS: Partial<Record<BlueprintSection, StylingItemKind>> = {
  outfits: "outfit",
  shopping: "product",
  footwear: "footwear",
  eyewear: "eyewear",
};

/** One Blueprint section in a modal, with "Mark section done" in the footer. */
export function SectionEditor({
  section,
  clientId,
  data,
  canEdit,
  onClose,
}: {
  section: BlueprintSection;
  clientId: string;
  data: Data;
  canEdit: boolean;
  onClose: () => void;
}) {
  const bp = data.bp!;
  const update = useUpdateStylingBlueprint();
  const done = bp.sectionsDone.includes(section);
  const props: EditorProps = { clientId, data, bp, canEdit };
  const itemKind = ITEM_SECTIONS[section];

  async function toggleDone() {
    const next = done
      ? bp.sectionsDone.filter((s) => s !== section)
      : [...bp.sectionsDone, section];
    await update.mutateAsync({ where: { id: bp.id }, data: { sectionsDone: next } });
    await data.query.refetch();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={BLUEPRINT_SECTION_LABELS[section]}
      size="lg"
      footer={
        <>
          {canEdit && (
            <label className="mr-auto flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={done}
                disabled={update.isPending}
                onChange={() => void toggleDone()}
                className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
              />
              Mark section done
            </label>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <fieldset disabled={!canEdit} className="min-w-0 space-y-4">
        {section === "profile" && <ProfileEditor {...props} />}
        {section === "direction" && <DirectionEditor {...props} />}
        {section === "looks" && <LooksEditor {...props} />}
        {section === "hair" && <HairEditor {...props} />}
        {section === "colours" && <ColoursEditor {...props} />}
        {itemKind && <ItemsEditor {...props} kind={itemKind} />}
        {section === "essentials" && <EssentialsEditor {...props} />}
      </fieldset>
    </Modal>
  );
}

// ---- Shared bits ------------------------------------------------------------------

function SaveRow({
  saving,
  saved,
  error,
  onSave,
}: {
  saving: boolean;
  saved: boolean;
  error?: string;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-3">
      {error && <span className="text-sm text-danger">{error}</span>}
      {saved && !error && <span className="text-sm text-success">Saved as draft</span>}
      <Button onClick={onSave} loading={saving}>
        Save draft
      </Button>
    </div>
  );
}

function useSaver() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  async function run(fn: () => Promise<unknown>) {
    setSaving(true);
    setSaved(false);
    setError(undefined);
    try {
      await fn();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }
  return { saving, saved, error, run };
}

const blank = (v: string) => (v.trim() ? v.trim() : null);

/** Pick one of the client's styling images, or upload a new one. */
function ImagePicker({
  clientId,
  data,
  value,
  onChange,
  label,
  className,
}: {
  clientId: string;
  data: Data;
  value: string | null;
  onChange: (id: string | null) => void;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const images = data.media.data?.images ?? [];

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(undefined);
    try {
      const r = await uploadStylingImage(clientId, file);
      await data.refreshMedia();
      onChange(r.document.id);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={cn("space-y-1", className)}>
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative block aspect-[3/4] w-24 overflow-hidden rounded-lg border border-dashed border-border-strong bg-muted/40 transition-colors hover:border-primary/50"
          aria-label={value ? `Change ${label}` : `Choose ${label}`}
        >
          {value ? (
            <BlueprintImage src={data.images[value]} alt={label} className="h-full w-full" />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <ImagePlus className="h-4 w-4" /> Add image
            </span>
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-muted-foreground hover:text-danger"
          >
            Remove
          </button>
        )}
      </div>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={`Choose ${label.toLowerCase()}`}
          size="md"
        >
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
          <div className="space-y-3">
            <Button variant="outline" onClick={() => input.current?.click()} loading={uploading}>
              <Upload className="h-4 w-4" /> Upload edited image
            </Button>
            <p className="text-xs text-muted-foreground">
              JPG or PNG, up to 10 MB. The client sees it only once you publish.
            </p>
            {error && <p className="text-sm text-danger">{error}</p>}
            {images.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No images uploaded for this client yet.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {images.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => {
                      onChange(img.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "aspect-[3/4] overflow-hidden rounded-lg ring-offset-2 transition",
                      value === img.id
                        ? "ring-2 ring-primary"
                        : "hover:ring-2 hover:ring-border-strong",
                    )}
                    title={img.fileName}
                  >
                    <BlueprintImage src={img.url} alt={img.fileName} className="h-full w-full" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function ColorList({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((c, i) => (
        <span
          key={i}
          className="flex items-center gap-1 rounded-full border border-border bg-surface py-0.5 pl-0.5 pr-1.5"
        >
          <input
            type="color"
            value={isHexColor(c) ? c : "#000000"}
            onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))}
            className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
            aria-label={`Colour ${i + 1}`}
          />
          <span className="font-num text-[11px] text-muted-foreground">{c}</span>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label="Remove colour"
          >
            <X className="h-3 w-3 text-muted-foreground hover:text-danger" />
          </button>
        </span>
      ))}
      {value.length < 6 && (
        <button
          type="button"
          onClick={() => onChange([...value, "#7a5c3e"])}
          className="flex items-center gap-1 rounded-full border border-dashed border-border-strong px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Colour
        </button>
      )}
    </div>
  );
}

/** Up / down / edit / delete controls for an ordered row. */
function RowControls({
  index,
  count,
  onMove,
  onEdit,
  onDelete,
}: {
  index: number;
  count: number;
  onMove: (dir: -1 | 1) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const btn =
    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30";
  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        className={btn}
        disabled={index === 0}
        onClick={() => onMove(-1)}
        aria-label="Move up"
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={btn}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
        aria-label="Move down"
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={btn} onClick={onEdit} aria-label="Edit">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={cn(btn, "hover:text-danger")}
        onClick={onDelete}
        aria-label="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function nextSort(rows: { sortOrder: number }[]): number {
  return rows.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;
}

/** Swap two rows' sortOrder. */
async function swap<T extends { id: string; sortOrder: number }>(
  rows: T[],
  index: number,
  dir: -1 | 1,
  update: (id: string, sortOrder: number) => Promise<unknown>,
) {
  const a = rows[index];
  const b = rows[index + dir];
  if (!a || !b) return;
  // Equal sortOrders (e.g. rows created together) still need distinct values.
  const aOrder = a.sortOrder === b.sortOrder ? index : a.sortOrder;
  const bOrder = a.sortOrder === b.sortOrder ? index + dir : b.sortOrder;
  await update(a.id, bOrder);
  await update(b.id, aOrder);
}

function LibraryPicker({
  kind,
  onPick,
  onClose,
}: {
  kind: StylingLibraryKind;
  onPick: (
    items: {
      title: string;
      category: string | null;
      priceRange: string | null;
      url: string | null;
      notes: string | null;
    }[],
  ) => Promise<void>;
  onClose: () => void;
}) {
  const { data, isLoading } = useFindManyStylingLibraryItem({
    where: { kind, isActive: true },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Add from library"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={chosen.size === 0}
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onPick((data ?? []).filter((i) => chosen.has(i.id)));
                onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            Add {chosen.size || ""}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5" />
        </div>
      ) : !data?.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          The library is empty. Add items under Styling Operations, then Library.
        </p>
      ) : (
        <div className="max-h-[50vh] divide-y divide-border overflow-y-auto">
          {data.map((i) => (
            <label
              key={i.id}
              className="flex cursor-pointer items-start gap-3 px-1 py-2.5 hover:bg-muted/40"
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
                checked={chosen.has(i.id)}
                onChange={() =>
                  setChosen((prev) => {
                    const next = new Set(prev);
                    if (next.has(i.id)) next.delete(i.id);
                    else next.add(i.id);
                    return next;
                  })
                }
              />
              <span className="min-w-0 text-sm">
                <span className="font-medium">{i.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {[i.category, i.priceRange, i.notes].filter(Boolean).join(" · ")}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---- Style Profile -------------------------------------------------------------------

function ProfileEditor({ data, bp }: EditorProps) {
  const update = useUpdateStylingBlueprint();
  const saver = useSaver();
  const [f, setF] = useState({
    faceShape: bp.faceShape ?? "",
    skinTone: bp.skinTone ?? "",
    skinToneHex: bp.skinToneHex ?? "",
    hairType: bp.hairType ?? "",
    beardType: bp.beardType ?? "",
    bodyType: bp.bodyType ?? "",
    heightCm: bp.heightCm ? String(bp.heightCm) : "",
    existingStyle: bp.existingStyle ?? "",
    stylePreferences: bp.stylePreferences ?? "",
  });
  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Face shape">
          <Input value={f.faceShape} onChange={set("faceShape")} placeholder="Oval" />
        </Field>
        <Field label="Skin tone">
          <div className="flex gap-2">
            <Input value={f.skinTone} onChange={set("skinTone")} placeholder="Medium brown" />
            <input
              type="color"
              aria-label="Skin tone swatch"
              value={isHexColor(f.skinToneHex) ? f.skinToneHex : "#a0714f"}
              onChange={(e) => setF((p) => ({ ...p, skinToneHex: e.target.value }))}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1"
            />
          </div>
        </Field>
        <Field label="Hair type">
          <Input value={f.hairType} onChange={set("hairType")} placeholder="Thick, dense" />
        </Field>
        <Field label="Beard type">
          <Input value={f.beardType} onChange={set("beardType")} placeholder="Short boxed" />
        </Field>
        <Field label="Build">
          <Input value={f.bodyType} onChange={set("bodyType")} placeholder="Average" />
        </Field>
        <Field label="Height (cm)">
          <Input type="number" min={100} max={250} value={f.heightCm} onChange={set("heightCm")} />
        </Field>
      </div>
      <Field label="How they dress today">
        <Textarea rows={2} value={f.existingStyle} onChange={set("existingStyle")} />
      </Field>
      <Field label="Style preferences" hint="Pre-filled from the onboarding assessment.">
        <Textarea rows={2} value={f.stylePreferences} onChange={set("stylePreferences")} />
      </Field>
      <SaveRow
        {...saver}
        onSave={() =>
          void saver.run(async () => {
            const h = Number(f.heightCm);
            await update.mutateAsync({
              where: { id: bp.id },
              data: {
                faceShape: blank(f.faceShape),
                skinTone: blank(f.skinTone),
                skinToneHex: isHexColor(f.skinToneHex) ? f.skinToneHex : null,
                hairType: blank(f.hairType),
                beardType: blank(f.beardType),
                bodyType: blank(f.bodyType),
                heightCm: Number.isFinite(h) && h > 0 ? Math.round(h) : null,
                existingStyle: blank(f.existingStyle),
                stylePreferences: blank(f.stylePreferences),
              },
            });
            await data.query.refetch();
          })
        }
      />
    </div>
  );
}

// ---- Style Direction -----------------------------------------------------------------

const TAG_SUGGESTIONS = [
  "Clean",
  "Masculine",
  "Elegant",
  "Understated",
  "Classic",
  "Modern",
  "Bold",
  "Relaxed",
  "Sharp",
  "Minimal",
];

function DirectionEditor({ data, bp }: EditorProps) {
  const update = useUpdateStylingBlueprint();
  const saver = useSaver();
  const [tags, setTags] = useState<string[]>(bp.styleTags);
  const [input, setInput] = useState("");
  const [description, setDescription] = useState(bp.styleDescription ?? "");
  const add = (t: string) => {
    const v = t.trim();
    if (v && !tags.some((x) => x.toLowerCase() === v.toLowerCase())) setTags([...tags, v]);
    setInput("");
  };

  return (
    <div className="space-y-4">
      <Field label="Style tags" hint="Press Enter to add. Four to six works best.">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary"
              >
                {t}
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  aria-label={`Remove ${t}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add(input);
              }
            }}
            placeholder="Add a tag"
          />
          <div className="flex flex-wrap gap-1.5">
            {TAG_SUGGESTIONS.filter((s) => !tags.includes(s)).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="rounded-full border border-dashed border-border-strong px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      </Field>
      <Field label="Description" hint="One or two sentences the client reads first.">
        <Textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A timeless style that looks great on your big day and beyond."
        />
      </Field>
      <SaveRow
        {...saver}
        onSave={() =>
          void saver.run(async () => {
            const pending = input.trim() ? [...tags, input.trim()] : tags;
            setInput("");
            setTags(pending);
            await update.mutateAsync({
              where: { id: bp.id },
              data: { styleTags: pending, styleDescription: blank(description) },
            });
            await data.query.refetch();
          })
        }
      />
    </div>
  );
}

// ---- Best Looks ---------------------------------------------------------------------

type LookRow = BlueprintData["looks"][number];

function LooksEditor({ clientId, data, bp }: EditorProps) {
  const create = useCreateStylingLook();
  const update = useUpdateStylingLook();
  const del = useDeleteStylingLook();
  const [editing, setEditing] = useState<LookRow | "new" | null>(null);
  const looks = bp.looks;

  return (
    <div className="space-y-3">
      {looks.length === 0 && !editing && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No looks yet. Add one per occasion, ideally on the client's edited photo.
        </p>
      )}
      {!editing &&
        looks.map((l, i) => (
          <div key={l.id} className="flex items-center gap-3 rounded-lg border border-border p-2">
            <BlueprintImage
              src={l.imageDocId ? data.images[l.imageDocId] : null}
              alt={l.title}
              className="h-16 w-12 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{l.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[l.eventLabel, l.outfit].filter(Boolean).join(" · ")}
              </p>
            </div>
            <RowControls
              index={i}
              count={looks.length}
              onMove={(dir) =>
                void swap(looks, i, dir, (id, sortOrder) =>
                  update.mutateAsync({ where: { id }, data: { sortOrder } }),
                ).then(() => data.query.refetch())
              }
              onEdit={() => setEditing(l)}
              onDelete={() =>
                void del.mutateAsync({ where: { id: l.id } }).then(() => data.query.refetch())
              }
            />
          </div>
        ))}
      {editing ? (
        <LookForm
          clientId={clientId}
          data={data}
          look={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (values) => {
            if (editing === "new") {
              await create.mutateAsync({
                data: { ...values, blueprintId: bp.id, sortOrder: nextSort(looks) },
              });
            } else {
              await update.mutateAsync({ where: { id: editing.id }, data: values });
            }
            await data.query.refetch();
            setEditing(null);
          }}
        />
      ) : (
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add look
        </Button>
      )}
    </div>
  );
}

function LookForm({
  clientId,
  data,
  look,
  onCancel,
  onSave,
}: {
  clientId: string;
  data: Data;
  look: LookRow | null;
  onCancel: () => void;
  onSave: (v: {
    title: string;
    eventLabel: string | null;
    imageDocId: string | null;
    description: string | null;
    outfit: string | null;
    footwear: string | null;
    accessories: string | null;
    colors: string[];
    stylistNote: string | null;
  }) => Promise<void>;
}) {
  const saver = useSaver();
  const [f, setF] = useState({
    title: look?.title ?? "",
    eventLabel: look?.eventLabel ?? "",
    description: look?.description ?? "",
    outfit: look?.outfit ?? "",
    footwear: look?.footwear ?? "",
    accessories: look?.accessories ?? "",
    stylistNote: look?.stylistNote ?? "",
  });
  const [imageDocId, setImage] = useState<string | null>(look?.imageDocId ?? null);
  const [colors, setColors] = useState<string[]>(look?.colors ?? []);
  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <ImagePicker
          clientId={clientId}
          data={data}
          value={imageDocId}
          onChange={setImage}
          label="Look image"
        />
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <Field label="Title" required>
            <Input value={f.title} onChange={set("title")} placeholder="Look 01 · Ceremony" />
          </Field>
          <Field label="Occasion" hint="Event-neutral: Big day, Reception, Dinner">
            <Input value={f.eventLabel} onChange={set("eventLabel")} placeholder="Big day" />
          </Field>
          <Field label="Outfit">
            <Input
              value={f.outfit}
              onChange={set("outfit")}
              placeholder="Ivory sherwani, gold buttons"
            />
          </Field>
          <Field label="Footwear">
            <Input value={f.footwear} onChange={set("footwear")} placeholder="Tan mojaris" />
          </Field>
          <Field label="Accessories" className="sm:col-span-2">
            <Input
              value={f.accessories}
              onChange={set("accessories")}
              placeholder="Gold brooch, silk pocket square"
            />
          </Field>
        </div>
      </div>
      <Field label="Colours">
        <ColorList value={colors} onChange={setColors} />
      </Field>
      <Field label="Description">
        <Textarea rows={2} value={f.description} onChange={set("description")} />
      </Field>
      <Field label="Stylist note">
        <Textarea
          rows={2}
          value={f.stylistNote}
          onChange={set("stylistNote")}
          placeholder="Keep the stole simple so the buttons stand out."
        />
      </Field>
      <div className="flex justify-end gap-2">
        {saver.error && <span className="self-center text-sm text-danger">{saver.error}</span>}
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          loading={saver.saving}
          disabled={!f.title.trim()}
          onClick={() =>
            void saver.run(() =>
              onSave({
                title: f.title.trim(),
                eventLabel: blank(f.eventLabel),
                imageDocId,
                description: blank(f.description),
                outfit: blank(f.outfit),
                footwear: blank(f.footwear),
                accessories: blank(f.accessories),
                colors: colors.filter(isHexColor),
                stylistNote: blank(f.stylistNote),
              }),
            )
          }
        >
          Save look
        </Button>
      </div>
    </div>
  );
}

// ---- Hair & Beard --------------------------------------------------------------------

function HairEditor({ clientId, data, bp }: EditorProps) {
  const update = useUpdateStylingBlueprint();
  const saver = useSaver();
  const [front, setFront] = useState(bp.hairFrontDocId);
  const [side, setSide] = useState(bp.hairSideDocId);
  const [back, setBack] = useState(bp.hairBackDocId);
  const [lines, setLines] = useState<string[]>(bp.barberBrief.length ? bp.barberBrief : [""]);
  const [notes, setNotes] = useState(bp.hairNotes ?? "");
  const [library, setLibrary] = useState(false);

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium">Edited reference photos</p>
        <div className="flex flex-wrap gap-4">
          <ImagePicker
            clientId={clientId}
            data={data}
            value={front}
            onChange={setFront}
            label="Front"
          />
          <ImagePicker
            clientId={clientId}
            data={data}
            value={side}
            onChange={setSide}
            label="Side"
          />
          <ImagePicker
            clientId={clientId}
            data={data}
            value={back}
            onChange={setBack}
            label="Back"
          />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Barber brief</p>
        {lines.map((line, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={line}
              onChange={(e) => setLines(lines.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder="Sides clean, not too tight."
              aria-label={`Brief line ${i + 1}`}
            />
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              disabled={i === 0}
              onClick={() => {
                const next = [...lines];
                [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                setLines(next);
              }}
              aria-label="Move up"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-danger"
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
              aria-label="Remove line"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setLines([...lines, ""])}>
            <Plus className="h-4 w-4" /> Add line
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLibrary(true)}>
            <Library className="h-4 w-4" /> Insert from library
          </Button>
        </div>
      </div>
      <Field label="Stylist note (the client sees this)">
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Book your trim 5 to 7 days before the big day."
        />
      </Field>
      <SaveRow
        {...saver}
        onSave={() =>
          void saver.run(async () => {
            await update.mutateAsync({
              where: { id: bp.id },
              data: {
                hairFrontDocId: front,
                hairSideDocId: side,
                hairBackDocId: back,
                barberBrief: lines.map((l) => l.trim()).filter(Boolean),
                hairNotes: blank(notes),
              },
            });
            await data.query.refetch();
          })
        }
      />
      {library && (
        <LibraryPicker
          kind="barber_line"
          onClose={() => setLibrary(false)}
          onPick={async (items) => {
            setLines([...lines.filter((l) => l.trim()), ...items.map((i) => i.title)]);
          }}
        />
      )}
    </div>
  );
}

// ---- Outfit Colours ------------------------------------------------------------------

type PaletteRow = BlueprintData["palettes"][number];

function ColoursEditor({ data, bp }: EditorProps) {
  const create = useCreateStylingPalette();
  const update = useUpdateStylingPalette();
  const del = useDeleteStylingPalette();
  const [editing, setEditing] = useState<PaletteRow | "new" | null>(null);
  const rows = bp.palettes;
  return (
    <div className="space-y-3">
      {!editing &&
        rows.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
            <span className="flex">
              {p.colors.map((c, j) => (
                <span
                  key={j}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 border-surface ring-1 ring-border",
                    j > 0 && "-ml-2",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.label}</p>
              {p.notes && <p className="truncate text-xs text-muted-foreground">{p.notes}</p>}
            </div>
            <RowControls
              index={i}
              count={rows.length}
              onMove={(dir) =>
                void swap(rows, i, dir, (id, sortOrder) =>
                  update.mutateAsync({ where: { id }, data: { sortOrder } }),
                ).then(() => data.query.refetch())
              }
              onEdit={() => setEditing(p)}
              onDelete={() =>
                void del.mutateAsync({ where: { id: p.id } }).then(() => data.query.refetch())
              }
            />
          </div>
        ))}
      {editing ? (
        <PaletteForm
          palette={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (v) => {
            if (editing === "new")
              await create.mutateAsync({
                data: { ...v, blueprintId: bp.id, sortOrder: nextSort(rows) },
              });
            else await update.mutateAsync({ where: { id: editing.id }, data: v });
            await data.query.refetch();
            setEditing(null);
          }}
        />
      ) : (
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add colour combination
        </Button>
      )}
    </div>
  );
}

function PaletteForm({
  palette,
  onCancel,
  onSave,
}: {
  palette: PaletteRow | null;
  onCancel: () => void;
  onSave: (v: { label: string; colors: string[]; notes: string | null }) => Promise<void>;
}) {
  const saver = useSaver();
  const [label, setLabel] = useState(palette?.label ?? "");
  const [notes, setNotes] = useState(palette?.notes ?? "");
  const [colors, setColors] = useState<string[]>(palette?.colors ?? ["#f3ece0", "#c9a14a"]);
  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Label" required>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ivory and gold"
          />
        </Field>
        <Field label="When to wear it">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Daytime ceremony"
          />
        </Field>
      </div>
      <Field label="Colours">
        <ColorList value={colors} onChange={setColors} />
      </Field>
      <div className="flex justify-end gap-2">
        {saver.error && <span className="self-center text-sm text-danger">{saver.error}</span>}
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          loading={saver.saving}
          disabled={!label.trim() || colors.length === 0}
          onClick={() =>
            void saver.run(() =>
              onSave({
                label: label.trim(),
                colors: colors.filter(isHexColor),
                notes: blank(notes),
              }),
            )
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}

// ---- Items: outfits, shopping, footwear, eyewear ----------------------------------------

type ItemRow = BlueprintData["items"][number];

const KIND_COPY: Record<StylingItemKind, { add: string; name: string; namePh: string }> = {
  outfit: { add: "Add outfit", name: "Outfit", namePh: "Olive linen bandhgala" },
  product: { add: "Add product", name: "Product", namePh: "Burgundy premium shirt" },
  footwear: { add: "Add footwear", name: "Type", namePh: "Brown leather loafers" },
  eyewear: { add: "Add frames", name: "Frame type", namePh: "Rectangular acetate frames" },
};

function ItemsEditor({ clientId, data, bp, kind }: EditorProps & { kind: StylingItemKind }) {
  const create = useCreateStylingItem();
  const update = useUpdateStylingItem();
  const del = useDeleteStylingItem();
  const [editing, setEditing] = useState<ItemRow | "new" | null>(null);
  const [library, setLibrary] = useState(false);
  const rows = bp.items.filter((i) => i.kind === kind);
  const copy = KIND_COPY[kind];

  return (
    <div className="space-y-3">
      {rows.length === 0 && !editing && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nothing in {BLUEPRINT_SECTION_LABELS[ITEM_KIND_SECTION[kind]]} yet.
        </p>
      )}
      {!editing &&
        rows.map((it, i) => (
          <div key={it.id} className="flex items-center gap-3 rounded-lg border border-border p-2">
            <BlueprintImage
              src={it.imageDocId ? data.images[it.imageDocId] : null}
              alt={it.name}
              className="h-12 w-12 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{it.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[
                  it.category,
                  it.priceRange,
                  it.priority ? STYLING_ITEM_PRIORITY_LABELS[it.priority] : null,
                  it.recommendation,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <RowControls
              index={i}
              count={rows.length}
              onMove={(dir) =>
                void swap(rows, i, dir, (id, sortOrder) =>
                  update.mutateAsync({ where: { id }, data: { sortOrder } }),
                ).then(() => data.query.refetch())
              }
              onEdit={() => setEditing(it)}
              onDelete={() =>
                void del.mutateAsync({ where: { id: it.id } }).then(() => data.query.refetch())
              }
            />
          </div>
        ))}
      {editing ? (
        <ItemForm
          clientId={clientId}
          data={data}
          kind={kind}
          item={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (v) => {
            if (editing === "new") {
              await create.mutateAsync({
                data: { ...v, kind, blueprintId: bp.id, sortOrder: nextSort(bp.items) },
              });
            } else {
              await update.mutateAsync({ where: { id: editing.id }, data: v });
            }
            await data.query.refetch();
            setEditing(null);
          }}
        />
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> {copy.add}
          </Button>
          {kind === "product" && (
            <Button variant="outline" onClick={() => setLibrary(true)}>
              <Library className="h-4 w-4" /> Add from library
            </Button>
          )}
        </div>
      )}
      {library && (
        <LibraryPicker
          kind="product"
          onClose={() => setLibrary(false)}
          onPick={async (picked) => {
            let order = nextSort(bp.items);
            for (const p of picked) {
              await create.mutateAsync({
                data: {
                  blueprintId: bp.id,
                  kind: "product",
                  name: p.title,
                  category: p.category,
                  priceRange: p.priceRange,
                  url: p.url,
                  notes: p.notes,
                  sortOrder: order++,
                },
              });
            }
            await data.query.refetch();
          }}
        />
      )}
    </div>
  );
}

function ItemForm({
  clientId,
  data,
  kind,
  item,
  onCancel,
  onSave,
}: {
  clientId: string;
  data: Data;
  kind: StylingItemKind;
  item: ItemRow | null;
  onCancel: () => void;
  onSave: (v: {
    name: string;
    category: string | null;
    imageDocId: string | null;
    priceRange: string | null;
    url: string | null;
    priority: "must_have" | "nice_to_have" | null;
    color: string | null;
    fit: string | null;
    recommendation: string | null;
    notes: string | null;
  }) => Promise<void>;
}) {
  const saver = useSaver();
  const copy = KIND_COPY[kind];
  const [f, setF] = useState({
    name: item?.name ?? "",
    category: item?.category ?? (kind === "product" ? "Outfits" : ""),
    priceRange: item?.priceRange ?? "",
    url: item?.url ?? "",
    priority: (item?.priority ?? "") as "" | "must_have" | "nice_to_have",
    color: item?.color ?? "",
    fit: item?.fit ?? "",
    recommendation: item?.recommendation ?? (kind === "eyewear" ? "Recommended" : ""),
    notes: item?.notes ?? "",
  });
  const [imageDocId, setImage] = useState<string | null>(item?.imageDocId ?? null);
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF((p) => ({ ...p, [k]: e.target.value }));
  const urlInvalid = f.url.trim() !== "" && !/^https?:\/\//i.test(f.url.trim());
  const shoppable = kind !== "outfit";

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <ImagePicker
          clientId={clientId}
          data={data}
          value={imageDocId}
          onChange={setImage}
          label="Image"
        />
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <Field label={copy.name} required className="sm:col-span-2">
            <Input value={f.name} onChange={set("name")} placeholder={copy.namePh} />
          </Field>
          {kind === "product" && (
            <Field label="Category">
              <Select value={f.category} onChange={set("category")}>
                {SHOPPING_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {kind === "outfit" && (
            <>
              <Field label="Occasion">
                <Input value={f.category} onChange={set("category")} placeholder="Reception" />
              </Field>
              <Field label="Colour">
                <Input value={f.color} onChange={set("color")} placeholder="Olive" />
              </Field>
              <Field label="Fit">
                <Input
                  value={f.fit}
                  onChange={set("fit")}
                  placeholder="Tailored, slightly tapered"
                />
              </Field>
            </>
          )}
          {kind === "eyewear" && (
            <Field label="Recommendation">
              <Select value={f.recommendation} onChange={set("recommendation")}>
                {EYEWEAR_RECOMMENDATIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {shoppable && (
            <>
              <Field label="Price range">
                <Input
                  value={f.priceRange}
                  onChange={set("priceRange")}
                  placeholder="₹1,800 to ₹2,500"
                />
              </Field>
              {kind === "product" && (
                <Field label="Priority">
                  <Select value={f.priority} onChange={set("priority")}>
                    <option value="">Not set</option>
                    <option value="must_have">Must have</option>
                    <option value="nice_to_have">Nice to have</option>
                  </Select>
                </Field>
              )}
              <Field
                label="Shop link"
                className="sm:col-span-2"
                hint={urlInvalid ? "Links must start with https://" : undefined}
              >
                <Input value={f.url} onChange={set("url")} placeholder="https://" />
              </Field>
            </>
          )}
        </div>
      </div>
      <Field label="Notes">
        <Textarea rows={2} value={f.notes} onChange={set("notes")} />
      </Field>
      <div className="flex justify-end gap-2">
        {saver.error && <span className="self-center text-sm text-danger">{saver.error}</span>}
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          loading={saver.saving}
          disabled={!f.name.trim() || urlInvalid}
          onClick={() =>
            void saver.run(() =>
              onSave({
                name: f.name.trim(),
                category: blank(f.category),
                imageDocId,
                priceRange: shoppable ? blank(f.priceRange) : null,
                url: shoppable ? blank(f.url) : null,
                priority: kind === "product" && f.priority ? f.priority : null,
                color: kind === "outfit" ? blank(f.color) : null,
                fit: kind === "outfit" ? blank(f.fit) : null,
                recommendation: kind === "eyewear" ? blank(f.recommendation) : null,
                notes: blank(f.notes),
              }),
            )
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}

// ---- Big Day Essentials ----------------------------------------------------------------

function EssentialsEditor({ data, bp }: EditorProps) {
  const create = useCreateStylingEssential();
  const update = useUpdateStylingEssential();
  const del = useDeleteStylingEssential();
  const [item, setItem] = useState("");
  const [notes, setNotes] = useState("");
  const [library, setLibrary] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const rows = bp.essentials;

  async function add() {
    if (!item.trim()) return;
    await create.mutateAsync({
      data: {
        blueprintId: bp.id,
        item: item.trim(),
        notes: blank(notes),
        sortOrder: nextSort(rows),
      },
    });
    setItem("");
    setNotes("");
    await data.query.refetch();
  }

  return (
    <div className="space-y-3">
      <div className="divide-y divide-border rounded-lg border border-border">
        {rows.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">No essentials yet.</p>
        )}
        {rows.map((e, i) => (
          <div key={e.id} className="flex items-center gap-2 px-3 py-2">
            {editingId === e.id ? (
              <Input
                autoFocus
                value={editText}
                onChange={(ev) => setEditText(ev.target.value)}
                onKeyDown={async (ev) => {
                  if (ev.key === "Enter" && editText.trim()) {
                    await update.mutateAsync({
                      where: { id: e.id },
                      data: { item: editText.trim() },
                    });
                    setEditingId(null);
                    await data.query.refetch();
                  }
                  if (ev.key === "Escape") setEditingId(null);
                }}
                onBlur={() => setEditingId(null)}
              />
            ) : (
              <div className="min-w-0 flex-1 text-sm">
                {e.item}
                {e.notes && <span className="ml-1 text-xs text-muted-foreground">({e.notes})</span>}
              </div>
            )}
            <RowControls
              index={i}
              count={rows.length}
              onMove={(dir) =>
                void swap(rows, i, dir, (id, sortOrder) =>
                  update.mutateAsync({ where: { id }, data: { sortOrder } }),
                ).then(() => data.query.refetch())
              }
              onEdit={() => {
                setEditingId(e.id);
                setEditText(e.item);
              }}
              onDelete={() =>
                void del.mutateAsync({ where: { id: e.id } }).then(() => data.query.refetch())
              }
            />
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input
          value={item}
          onChange={(e) => setItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="Lint roller"
          aria-label="New essential"
        />
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Note (optional)"
          aria-label="Essential note"
        />
        <Button
          variant="outline"
          onClick={() => void add()}
          loading={create.isPending}
          disabled={!item.trim()}
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      <Button variant="outline" size="sm" onClick={() => setLibrary(true)}>
        <Library className="h-4 w-4" /> Add from library
      </Button>
      {library && (
        <LibraryPicker
          kind="essential"
          onClose={() => setLibrary(false)}
          onPick={async (picked) => {
            let order = nextSort(rows);
            for (const p of picked) {
              await create.mutateAsync({
                data: {
                  blueprintId: bp.id,
                  item: p.title,
                  category: p.category,
                  notes: p.notes,
                  sortOrder: order++,
                },
              });
            }
            await data.query.refetch();
          }}
        />
      )}
    </div>
  );
}

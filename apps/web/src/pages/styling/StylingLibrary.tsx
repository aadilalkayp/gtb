import { useState } from "react";
import { Library, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useCreateStylingLibraryItem,
  useDeleteStylingLibraryItem,
  useFindManyStylingLibraryItem,
  useUpdateStylingLibraryItem,
} from "@gtb/db/hooks";
import {
  SHOPPING_CATEGORIES,
  STYLING_LIBRARY_KIND_LABELS,
  STYLING_LIBRARY_KINDS,
  type StylingLibraryKind,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import {
  Button,
  Field,
  Input,
  Modal,
  PillFilter,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";

type Row = {
  id: string;
  kind: string;
  title: string;
  category: string | null;
  priceRange: string | null;
  url: string | null;
  notes: string | null;
};

/**
 * The styling team's reusable library: products, barber-brief lines and Big
 * Day Essentials that stylists insert into a Blueprint and then personalise.
 */
export function StylingLibrary() {
  const { user, role } = useAuth();
  const isAdmin = role === "founder" || role === "ops_head";
  const [kind, setKind] = useState<StylingLibraryKind>("product");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const { data, isLoading } = useFindManyStylingLibraryItem({
    where: { kind, isActive: true },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  const update = useUpdateStylingLibraryItem();
  const del = useDeleteStylingLibraryItem();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillFilter
          options={STYLING_LIBRARY_KINDS.map((k) => ({
            id: k,
            label: STYLING_LIBRARY_KIND_LABELS[k],
          }))}
          active={kind}
          onChange={setKind}
        />
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add to library
        </Button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={Library}
          title={`No ${STYLING_LIBRARY_KIND_LABELS[kind].toLowerCase()} yet`}
          hint="Items added here can be inserted into any client's Blueprint."
        />
      ) : (
        <div className="card divide-y divide-border">
          {data.map((i) => (
            <div key={i.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{i.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[i.category, i.priceRange, i.url, i.notes].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(i)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={isAdmin ? "Delete" : "Hide"}
                onClick={() =>
                  void (isAdmin
                    ? del.mutateAsync({ where: { id: i.id } })
                    : update.mutateAsync({ where: { id: i.id }, data: { isActive: false } }))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {editing && user && (
        <LibraryForm
          kind={kind}
          item={editing === "new" ? null : editing}
          userId={user.id}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function LibraryForm({
  kind,
  item,
  userId,
  onClose,
}: {
  kind: StylingLibraryKind;
  item: Row | null;
  userId: string;
  onClose: () => void;
}) {
  const create = useCreateStylingLibraryItem();
  const update = useUpdateStylingLibraryItem();
  const [f, setF] = useState({
    title: item?.title ?? "",
    category: item?.category ?? (kind === "product" ? "Outfits" : ""),
    priceRange: item?.priceRange ?? "",
    url: item?.url ?? "",
    notes: item?.notes ?? "",
  });
  const [error, setError] = useState<string>();
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF((p) => ({ ...p, [k]: e.target.value }));
  const blank = (v: string) => (v.trim() ? v.trim() : null);
  const urlInvalid = f.url.trim() !== "" && !/^https?:\/\//i.test(f.url.trim());
  const titleLabel =
    kind === "barber_line" ? "Brief line" : kind === "essential" ? "Item" : "Product name";

  async function save() {
    setError(undefined);
    const values = {
      title: f.title.trim(),
      category: blank(f.category),
      priceRange: kind === "product" ? blank(f.priceRange) : null,
      url: kind === "product" ? blank(f.url) : null,
      notes: blank(f.notes),
    };
    try {
      if (item) await update.mutateAsync({ where: { id: item.id }, data: values });
      else await create.mutateAsync({ data: { ...values, kind, createdById: userId } });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? "Edit library item" : `Add to ${STYLING_LIBRARY_KIND_LABELS[kind]}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            loading={create.isPending || update.isPending}
            disabled={!f.title.trim() || urlInvalid}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={titleLabel} required>
          <Input value={f.title} onChange={set("title")} />
        </Field>
        {kind === "product" && (
          <>
            <Field label="Category">
              <Select value={f.category} onChange={set("category")}>
                {SHOPPING_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Price range">
              <Input
                value={f.priceRange}
                onChange={set("priceRange")}
                placeholder="₹2,000 to ₹4,000"
              />
            </Field>
            <Field
              label="Shop link"
              hint={urlInvalid ? "Links must start with https://" : undefined}
            >
              <Input value={f.url} onChange={set("url")} placeholder="https://" />
            </Field>
          </>
        )}
        {kind === "essential" && (
          <Field label="Category">
            <Input value={f.category} onChange={set("category")} placeholder="Grooming" />
          </Field>
        )}
        <Field label="Notes">
          <Textarea rows={2} value={f.notes} onChange={set("notes")} />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

import { useState } from "react";
import { Plus, Pencil, Sparkles } from "lucide-react";
import {
  useCreateCoachArticle,
  useDeleteCoachArticle,
  useFindManyCoachArticle,
  useUpdateCoachArticle,
} from "@gtb/db/hooks";
import {
  COACH_CATEGORIES,
  COACH_CATEGORY_LABELS,
  COACH_STARTER_ARTICLES,
  type CoachCategory,
} from "@gtb/shared";
import { Badge, Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";

interface Draft {
  id?: string;
  title: string;
  category: CoachCategory;
  tags: string;
  content: string;
  isActive: boolean;
}

const EMPTY: Draft = { title: "", category: "general", tags: "", content: "", isActive: true };

/**
 * Settings → Coach Knowledge: the articles the AI coach answers from. GTB owns
 * this content; the starter set is a scaffold with [PLACEHOLDER] markers.
 */
export function CoachKnowledgeSettings() {
  const {
    data: articles,
    isLoading,
    refetch,
  } = useFindManyCoachArticle({
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  const create = useCreateCoachArticle();
  const update = useUpdateCoachArticle();
  const remove = useDeleteCoachArticle();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeholders = (articles ?? []).filter((a) => a.content.includes("[PLACEHOLDER")).length;

  const save = async () => {
    if (!draft) return;
    setError(null);
    const data = {
      title: draft.title.trim(),
      category: draft.category,
      tags: draft.tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      content: draft.content.trim(),
      isActive: draft.isActive,
    };
    if (!data.title || !data.content) {
      setError("Title and content are required.");
      return;
    }
    try {
      if (draft.id) await update.mutateAsync({ where: { id: draft.id }, data });
      else await create.mutateAsync({ data });
      setDraft(null);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  };

  const seed = async () => {
    setSeeding(true);
    setError(null);
    try {
      const existing = new Set((articles ?? []).map((a) => a.title));
      for (const a of COACH_STARTER_ARTICLES) {
        if (existing.has(a.title)) continue;
        await create.mutateAsync({ data: { ...a } });
      }
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add starter articles.");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Coach knowledge</h2>
          <p className="text-sm text-muted-foreground">
            What the AI coach is allowed to say. One topic per article; the coach cites titles back
            to clients. Inactive articles are drafts.
          </p>
        </div>
        <div className="flex gap-2">
          {(articles?.length ?? 0) < COACH_STARTER_ARTICLES.length && (
            <Button variant="secondary" onClick={() => void seed()} disabled={seeding}>
              <Sparkles className="mr-1.5 h-4 w-4" /> {seeding ? "Adding…" : "Add starter articles"}
            </Button>
          )}
          <Button onClick={() => setDraft({ ...EMPTY })}>
            <Plus className="mr-1.5 h-4 w-4" /> New article
          </Button>
        </div>
      </div>

      {placeholders > 0 && (
        <p className="rounded-lg bg-warning/10 px-4 py-2.5 text-sm text-warning">
          {placeholders} {placeholders === 1 ? "article still contains" : "articles still contain"}{" "}
          a [PLACEHOLDER]. Replace with GTB's real methodology before launch.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-6 w-6" />
        </div>
      ) : !articles?.length ? (
        <p className="card p-10 text-center text-sm text-muted-foreground">
          No articles yet. The coach will give only cautious general guidance until you add some.
        </p>
      ) : (
        <div className="card divide-y divide-border">
          {articles.map((a) => (
            <div key={a.id} className="flex items-start gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{a.title}</p>
                  <Badge tone="info">{COACH_CATEGORY_LABELS[a.category]}</Badge>
                  {!a.isActive && <Badge tone="warning">Draft</Badge>}
                  {a.content.includes("[PLACEHOLDER") && <Badge tone="danger">Placeholder</Badge>}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.content}</p>
                {a.tags.length > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">{a.tags.join(" · ")}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setDraft({
                    id: a.id,
                    title: a.title,
                    category: a.category,
                    tags: a.tags.join(", "),
                    content: a.content,
                    isActive: a.isActive,
                  })
                }
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit article" : "New article"}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {draft?.id ? (
              <Button
                variant="danger"
                onClick={async () => {
                  if (!draft.id || !window.confirm("Delete this article?")) return;
                  await remove.mutateAsync({ where: { id: draft.id } });
                  setDraft(null);
                  await refetch();
                }}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={create.isPending || update.isPending}>
                Save
              </Button>
            </div>
          </div>
        }
      >
        {draft && (
          <div className="space-y-4">
            <Field label="Title" htmlFor="ca-title" required>
              <Input
                id="ca-title"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="ca-cat">
                <Select
                  id="ca-cat"
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value as CoachCategory })
                  }
                >
                  {COACH_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {COACH_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Tags (comma-separated)"
                htmlFor="ca-tags"
                hint="Words clients might use when asking"
              >
                <Input
                  id="ca-tags"
                  value={draft.tags}
                  onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                />
              </Field>
            </div>
            <Field
              label="Content"
              htmlFor="ca-content"
              required
              hint="Plain guidance the coach can quote. Never medical advice."
            >
              <Textarea
                id="ca-content"
                rows={10}
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                className="accent-primary"
              />
              Live (the coach may use this article)
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}

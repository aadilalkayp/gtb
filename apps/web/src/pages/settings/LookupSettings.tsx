import { useState } from "react";
import { Plus } from "lucide-react";
import {
  useFindManyLeadSource,
  useCreateLeadSource,
  useUpdateLeadSource,
  useFindManyExpenseCategory,
  useCreateExpenseCategory,
  useUpdateExpenseCategory,
} from "@gtb/db/hooks";
import { Badge, Button, Input, Spinner } from "@/components/ui";

interface LookupRow {
  id: string;
  name: string;
  isActive: boolean;
}

/** Shared add/deactivate UI for simple name+isActive lookup tables. */
function LookupManager({
  title,
  subtitle,
  placeholder,
  rows,
  isLoading,
  onCreate,
  onToggle,
}: {
  title: string;
  subtitle: string;
  placeholder: string;
  rows: LookupRow[] | undefined;
  isLoading: boolean;
  onCreate: (name: string) => Promise<void>;
  onToggle: (row: LookupRow) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [adding, setAdding] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    setError(undefined);
    try {
      await onCreate(name.trim());
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add (duplicate name?)");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <form onSubmit={add} className="flex max-w-md gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} />
        <Button type="submit" loading={adding} disabled={!name.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : (
        <div className="card max-w-xl divide-y divide-border">
          {rows?.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{r.name}</span>
                {!r.isActive && <Badge tone="neutral">Inactive</Badge>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => void onToggle(r)}>
                {r.isActive ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          ))}
          {!rows?.length && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function LeadSourcesSettings() {
  const { data, isLoading } = useFindManyLeadSource({ orderBy: { name: "asc" } });
  const create = useCreateLeadSource();
  const update = useUpdateLeadSource();
  return (
    <LookupManager
      title="Lead Sources"
      subtitle="Where leads come from — shown in the new-lead form."
      placeholder="e.g. Instagram"
      rows={data}
      isLoading={isLoading}
      onCreate={async (name) => {
        await create.mutateAsync({ data: { name } });
      }}
      onToggle={async (r) => {
        await update.mutateAsync({ where: { id: r.id }, data: { isActive: !r.isActive } });
      }}
    />
  );
}

export function ExpenseCategoriesSettings() {
  const { data, isLoading } = useFindManyExpenseCategory({ orderBy: { name: "asc" } });
  const create = useCreateExpenseCategory();
  const update = useUpdateExpenseCategory();
  return (
    <LookupManager
      title="Expense Categories"
      subtitle="Categories available when submitting expenses."
      placeholder="e.g. Travel"
      rows={data}
      isLoading={isLoading}
      onCreate={async (name) => {
        await create.mutateAsync({ data: { name } });
      }}
      onToggle={async (r) => {
        await update.mutateAsync({ where: { id: r.id }, data: { isActive: !r.isActive } });
      }}
    />
  );
}

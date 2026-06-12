import { useFindManyDocument } from "@gtb/db/hooks";
import { useAuth } from "@/auth/AuthProvider";
import { DocumentRow } from "@/components/DocumentRow";
import { EmptyState } from "@/components/EmptyState";
import { Spinner } from "@/components/ui";
import { FileText } from "lucide-react";

export function PortalDocuments() {
  const { user } = useAuth();
  const clientId = user?.client?.id;

  // Access policy already hides internal consultation notes from clients.
  const { data: docs, isLoading } = useFindManyDocument(
    {
      where: { clientId: clientId ?? "" },
      orderBy: { createdAt: "desc" },
    },
    { enabled: Boolean(clientId) },
  );

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">My documents</h1>
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : !docs?.length ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          hint="Plans, guides, and receipts shared by your team will appear here."
        />
      ) : (
        <div className="card divide-y divide-border">
          {docs.map((d) => (
            <DocumentRow key={d.id} doc={d} />
          ))}
        </div>
      )}
    </div>
  );
}

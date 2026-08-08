import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  STATUS_LABELS,
  statusTone,
  type RequisitionStatus,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Primitivos propios del dominio, construidos SOBRE shadcn.
 *
 * La distinción importa: shadcn da los ladrillos genéricos (Card, Badge);
 * acá viven las piezas que hablan el lenguaje de ASOFER (estado de una
 * requisición, encabezado de página). Si mañana se cambia de librería, esto
 * es lo único que hay que reescribir.
 */

const TONE_CLASSES = {
  neutral: "bg-status-draft/15 text-status-draft border-status-draft/30",
  pending: "bg-status-pending/15 text-status-pending border-status-pending/30",
  success: "bg-status-success/15 text-status-success border-status-success/30",
  danger: "bg-status-danger/15 text-status-danger border-status-danger/30",
} as const;

export function StatusBadge({ status }: { status: RequisitionStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", TONE_CLASSES[statusTone(status)])}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  );
}

export function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

export { Card, CardContent } from "@/components/ui/card";

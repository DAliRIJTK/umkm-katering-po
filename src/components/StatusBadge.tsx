import type { OrderStatus } from "@/lib/domain/types";
import { STATUS_META } from "@/lib/format";

export function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap ${meta.bg} ${meta.fg} ${meta.border}`}
    >
      {meta.label}
    </span>
  );
}

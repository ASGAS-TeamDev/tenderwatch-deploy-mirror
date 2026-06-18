import type { HealthResponse } from "../api/client";

export function HealthChip({ health }: { health: HealthResponse | null }) {
  if (!health) {
    return <span className="text-xs text-on-surface-variant">checking…</span>;
  }
  if (health.etenders_reachable) {
    return (
      <span className="inline-flex items-center gap-2 rounded-pill bg-tertiary-container px-3 py-1 text-xs text-on-tertiary-container">
        <span className="h-2 w-2 rounded-pill bg-tertiary" />
        eTenders OK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-pill bg-warning-container px-3 py-1 text-xs text-on-warning-container">
      <span className="h-2 w-2 rounded-pill bg-warning" />
      eTenders UNREACHABLE
    </span>
  );
}

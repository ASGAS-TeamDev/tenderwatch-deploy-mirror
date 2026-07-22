import type { HealthResponse } from "../api/client";

export function HealthChip({ health }: { health: HealthResponse | null }) {
  if (!health) {
    return <span className="text-xs text-on-surface-variant">checking…</span>;
  }
  if (health.etenders_reachable) {
    return (
      <span className="inline-flex items-center gap-2 rounded-pill bg-white/15 px-3 py-1 text-xs text-on-dark-surface backdrop-blur-sm">
        <span className="h-2 w-2 rounded-pill bg-green-400" />
        eTenders OK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-pill bg-white/15 px-3 py-1 text-xs text-on-dark-surface backdrop-blur-sm">
      <span className="h-2 w-2 rounded-pill bg-red-400" />
      eTenders UNREACHABLE
    </span>
  );
}

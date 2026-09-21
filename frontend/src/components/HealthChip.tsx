import type { HealthResponse } from "../api/client";
import { relativeTimeAgo } from "../lib/relativeTime";

const STALE_AFTER_HOURS = 36;

export function HealthChip({ health }: { health: HealthResponse | null }) {
  if (!health) {
    return <span className="text-xs text-on-surface-variant">checking…</span>;
  }
  return (
    <div className="flex items-center gap-2">
      {health.etenders_reachable ? (
        <span className="inline-flex items-center gap-2 rounded-pill bg-white/15 px-3 py-1 text-xs text-on-dark-surface backdrop-blur-sm">
          <span className="h-2 w-2 rounded-pill bg-green-400" />
          eTenders OK
        </span>
      ) : (
        <span className="inline-flex items-center gap-2 rounded-pill bg-white/15 px-3 py-1 text-xs text-on-dark-surface backdrop-blur-sm">
          <span className="h-2 w-2 rounded-pill bg-red-400" />
          eTenders UNREACHABLE
        </span>
      )}
      {health.last_synced_at && <SyncFreshness lastSyncedAt={health.last_synced_at} />}
    </div>
  );
}

function SyncFreshness({ lastSyncedAt }: { lastSyncedAt: string }) {
  const hoursAgo = (Date.now() - new Date(lastSyncedAt).getTime()) / 3_600_000;
  const stale = hoursAgo > STALE_AFTER_HOURS;
  return (
    <span
      className={
        stale
          ? "inline-flex items-center gap-2 rounded-pill bg-warning-container px-3 py-1 text-xs text-on-warning-container"
          : "inline-flex items-center gap-2 rounded-pill bg-white/15 px-3 py-1 text-xs text-on-dark-surface backdrop-blur-sm"
      }
      title={new Date(lastSyncedAt).toLocaleString()}
    >
      Synced {relativeTimeAgo(lastSyncedAt)}
    </span>
  );
}

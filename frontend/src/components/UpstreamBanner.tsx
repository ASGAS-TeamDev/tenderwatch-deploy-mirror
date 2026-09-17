export function UpstreamBanner({
  cachedAt, onRetry,
}: { cachedAt: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-card bg-warning-container px-4 py-3 text-sm text-on-warning-container">
      <span>
        eTenders is unreachable. Showing cached results from {cachedAt}. New data is paused
        until the upstream recovers.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs font-bold underline underline-offset-2"
      >
        Retry now
      </button>
    </div>
  );
}

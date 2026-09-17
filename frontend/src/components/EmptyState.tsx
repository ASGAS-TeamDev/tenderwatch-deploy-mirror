export function EmptyState({
  headline, body, action,
}: { headline: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="h-12 w-12 rounded-full bg-surface-variant" aria-hidden />
      <h2 className="text-lg font-bold text-on-surface" style={{ fontFamily: "Michroma, sans-serif" }}>{headline}</h2>
      <p className="max-w-prose text-sm text-on-surface-variant">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 rounded-card bg-primary px-4 py-2 text-sm font-bold text-on-primary"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

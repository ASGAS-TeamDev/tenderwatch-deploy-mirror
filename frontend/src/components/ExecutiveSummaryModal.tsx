import { useEffect, useState } from "react";
import type { Match } from "../api/client";
import { getSummary } from "../api/client";

export function ExecutiveSummaryModal({
  match, onClose,
}: {
  match: Match | null;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!match) return;
    setSummary(null);
    setError(null);
    setLoading(true);
    getSummary(match.ocid)
      .then((r) => setSummary(r.summary))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to generate summary"))
      .finally(() => setLoading(false));
  }, [match]);

  if (!match) return null;

  return (
    <div
      role="dialog"
      aria-label="Executive summary"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-card border border-outline bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-outline-variant p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant" style={{ fontFamily: "Orbitron, sans-serif" }}>
              Executive Summary
            </p>
            <h2 className="mt-1 text-sm font-bold text-black" style={{ fontFamily: "Michroma, sans-serif" }}>
              {match.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-pill p-1 text-on-surface-variant hover:bg-surface-variant"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="relative h-10 w-10">
                <div className="absolute inset-0 rounded-full border-4 border-outline" />
                <div
                  className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary-bright border-r-primary-bright"
                  style={{ animationDuration: "0.8s" }}
                />
              </div>
              <p className="text-xs text-on-surface-variant">
                Reading the tender document and generating a summary…
              </p>
            </div>
          )}

          {error && !loading && (
            <p className="text-sm text-error">{error}</p>
          )}

          {summary && !loading && (
            <ul className="list-disc space-y-2 pl-5 text-sm text-on-surface">
              {summary
                .split(/\n+/)
                .map((line) => line.trim().replace(/^[-•]\s*/, ""))
                .filter(Boolean)
                .map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";

/**
 * LoadingModal — branded full-screen overlay shown while fetching matches
 * from the eTenders API. Explains the long load (paginated upstream fetch)
 * and disappears when loading completes.
 *
 * Brand: Herge Dynamics — uses Michroma for the heading, Orbitron for the
 * status text, black-to-blue gradient background, bright blue spinner.
 */
export function LoadingModal({ visible, retrying = false }: { visible: boolean; retrying?: boolean }) {
  const [dots, setDots] = useState("");

  // Animate the "..." dots for a live feel.
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 500);
    return () => clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-6 rounded-card border border-white/10 bg-dark-surface-variant px-12 py-10 shadow-2xl">
        {/* Branded spinner — bright blue ring on dark surface */}
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 rounded-full border-4 border-white/10" />
          <div
            className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary-bright border-r-primary-bright"
            style={{ animationDuration: "0.8s" }}
          />
          {/* Inner geometric accent — Herge Dynamics "geometric shapes" brand element */}
          <div className="absolute inset-4 flex items-center justify-center">
            <div className="h-3 w-3 rotate-45 bg-primary-bright/40" />
          </div>
        </div>

        {/* Heading — Michroma */}
        <h2
          className="text-sm font-bold tracking-wider text-on-dark-surface"
          style={{ fontFamily: "Michroma, sans-serif" }}
        >
          FETCHING TENDERS
        </h2>

        {/* Status text — Orbitron */}
        <div className="text-center">
          <p
            className="text-xs tracking-wide text-on-dark-surface/60"
            style={{ fontFamily: "Orbitron, sans-serif" }}
          >
            {retrying ? "Still warming up" : "Querying the eTenders API"}{dots}
          </p>
          <p className="mt-2 text-[11px] text-on-dark-surface/40">
            {retrying ? (
              <>
                The first fetch after a restart can take a couple of minutes —
                <br />
                hang tight, this will resolve on its own.
              </>
            ) : (
              <>
                This can take 1–2 minutes while we paginate through
                <br />
                hundreds of government tender releases.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

import type { Match } from "../api/client";
import { formatZAR, formatDateSAST } from "../lib/format";
import { relativeClosingLabel } from "../lib/relativeTime";

export function DetailDrawer({
  match,
  onClose,
}: {
  match: Match | null;
  onClose: () => void;
}) {
  if (!match) return null;
  return (
    <aside
      role="dialog"
      aria-label="Tender detail"
      className="fixed right-0 top-0 z-50 flex h-full w-[480px] flex-col border-l border-outline bg-surface shadow-2xl"
    >
      <header className="flex items-start justify-between border-b border-outline-variant p-4">
        <h2 className="pr-8 text-xl font-bold text-on-surface">{match.title}</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-pill p-1 text-on-surface-variant hover:bg-surface-variant"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        <Section title="Description">
          <p className="text-on-surface-variant">
            {match.title} — full description not in the v1 list response. Open the
            eTenders link for the full notice.
          </p>
        </Section>

        <Section title="Buyer">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-on-surface-variant">Buyer name</p>
              <p className="font-bold text-on-surface">{match.buyer}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-on-surface-variant">Procuring entity</p>
              <p className="font-bold text-on-surface">{match.procuring_entity}</p>
            </div>
          </div>
        </Section>

        <Section title="Value">
          <p className="text-2xl font-black text-on-surface">{formatZAR(match.value_zar)}</p>
        </Section>

        <Section title="Closing date">
          <p className="text-on-surface">
            {formatDateSAST(match.closing_date)}{" "}
            <span className="text-xs text-on-surface-variant">
              ({relativeClosingLabel(match.closing_date)})
            </span>
          </p>
        </Section>

        <Section title="Lots and items">
          <ul className="space-y-2 text-on-surface-variant">
            <li>• (Items are not in the v1 list response — they would be loaded on demand.)</li>
          </ul>
        </Section>

        <Section title="Documents">
          <ul className="space-y-1">
            <li>
              <a
                className="text-primary underline"
                href={match.link}
                target="_blank"
                rel="noreferrer"
              >
                Open on eTenders →
              </a>
            </li>
          </ul>
        </Section>
      </div>

      <footer className="border-t border-outline-variant p-4">
        <a
          href={match.link}
          target="_blank"
          rel="noreferrer"
          className="block w-full rounded-card bg-primary py-2 text-center text-sm font-bold text-on-primary"
        >
          View on eTenders →
        </a>
      </footer>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
        {title}
      </h3>
      {children}
    </section>
  );
}


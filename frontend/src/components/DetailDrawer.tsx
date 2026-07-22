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
        <div className="pr-8">
          <h2 className="text-xl font-bold text-on-surface">{match.title}</h2>
          {match.status && (
            <span className="mt-1 inline-block rounded-pill bg-surface-variant px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              {match.status}
            </span>
          )}
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

      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        {/* Description — the actual scope of work */}
        {match.description && (
          <Section title="Description">
            <p className="text-on-surface-variant">{match.description}</p>
          </Section>
        )}

        {/* Buyer + procuring entity */}
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

        {/* Value */}
        <Section title="Value">
          <p className="text-2xl font-black text-on-surface">{formatZAR(match.value_zar)}</p>
        </Section>

        {/* Dates */}
        <Section title="Dates">
          <div className="space-y-1">
            {match.published_date && (
              <p className="text-on-surface">
                <span className="text-on-surface-variant">Published: </span>
                {formatDateSAST(match.published_date)}
              </p>
            )}
            {match.tender_start_date && (
              <p className="text-on-surface">
                <span className="text-on-surface-variant">Submissions open: </span>
                {formatDateSAST(match.tender_start_date)}
              </p>
            )}
            <p className="text-on-surface">
              <span className="text-on-surface-variant">Closes: </span>
              {formatDateSAST(match.closing_date)}{" "}
              <span className="text-xs text-on-surface-variant">
                ({relativeClosingLabel(match.closing_date)})
              </span>
            </p>
          </div>
        </Section>

        {/* Procurement method + category + province + delivery */}
        {(match.procurement_method || match.category || match.province || match.delivery_location) && (
          <Section title="Procurement details">
            <div className="space-y-1">
              {match.procurement_method && (
                <p className="text-on-surface">
                  <span className="text-on-surface-variant">Method: </span>
                  {match.procurement_method}
                </p>
              )}
              {match.category && (
                <p className="text-on-surface">
                  <span className="text-on-surface-variant">Category: </span>
                  {match.category}
                </p>
              )}
              {match.province && (
                <p className="text-on-surface">
                  <span className="text-on-surface-variant">Province: </span>
                  {match.province}
                </p>
              )}
              {match.delivery_location && (
                <p className="text-on-surface">
                  <span className="text-on-surface-variant">Delivery location: </span>
                  {match.delivery_location}
                </p>
              )}
            </div>
          </Section>
        )}

        {/* Special conditions */}
        {match.special_conditions && (
          <Section title="Special conditions">
            <p className="text-on-surface-variant">{match.special_conditions}</p>
          </Section>
        )}

        {/* Briefing session */}
        {match.briefing_session && match.briefing_session.has_session && (
          <Section title="Briefing session">
            <div className="space-y-1">
              {match.briefing_session.compulsory && (
                <p className="font-bold text-error">Compulsory</p>
              )}
              {match.briefing_session.date && (
                <p className="text-on-surface">
                  <span className="text-on-surface-variant">Date: </span>
                  {formatDateSAST(match.briefing_session.date)}
                </p>
              )}
              {match.briefing_session.venue && match.briefing_session.venue !== "N/A" && (
                <p className="text-on-surface">
                  <span className="text-on-surface-variant">Venue: </span>
                  {match.briefing_session.venue}
                </p>
              )}
            </div>
          </Section>
        )}

        {/* Contact person */}
        {match.contact_person && (match.contact_person.name || match.contact_person.email || match.contact_person.telephone) && (
          <Section title="Contact person">
            <div className="space-y-1">
              {match.contact_person.name && (
                <p className="font-bold text-on-surface">{match.contact_person.name}</p>
              )}
              {match.contact_person.email && (
                <p>
                  <a className="text-primary underline" href={`mailto:${match.contact_person.email}`}>
                    {match.contact_person.email}
                  </a>
                </p>
              )}
              {match.contact_person.telephone && (
                <p className="text-on-surface-variant">{match.contact_person.telephone}</p>
              )}
            </div>
          </Section>
        )}

        {/* Documents — direct download links */}
        {match.documents.length > 0 && (
          <Section title={`Documents (${match.documents.length})`}>
            <ul className="space-y-2">
              {match.documents.map((doc, i) => (
                <li key={i}>
                  <a
                    className="flex items-center gap-2 text-primary underline"
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="text-on-surface-variant">📎</span>
                    {doc.title}
                    {doc.format && (
                      <span className="text-[11px] uppercase text-on-surface-variant">({doc.format})</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

      </div>
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


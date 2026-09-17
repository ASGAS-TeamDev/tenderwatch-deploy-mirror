import { useMemo, useState } from "react";
import type { Config } from "../api/client";
import { putConfig, isConfigConflict } from "../api/client";

const KEYWORD_DEFAULTS = [
  "software", "it services", "system integration",
  "consulting", "professional services", "managed services",
  "cloud", "cybersecurity", "data", "development",
  "support and maintenance",
];

const BUYER_DEFAULTS = ["sita", "national treasury", "sars", "dcdt", "gcis"];

export function ConfigForm({
  initial, initialDigest = null, onSaved,
}: { initial: Config; initialDigest?: string | null; onSaved: () => void }) {
  const [draft, setDraft] = useState<Config>(initial);
  const [digest, setDigest] = useState<string | null>(initialDigest);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Set when a save is rejected because someone else saved first — holds
  // their config so the user can see what changed before deciding.
  const [conflict, setConflict] = useState<Config | null>(null);

  const lookbackError = useMemo(() => {
    if (draft.lookback_days < 7 || draft.lookback_days > 90) {
      return "Must be between 7 and 90";
    }
    return null;
  }, [draft.lookback_days]);

  const canSave = lookbackError === null && !saving;

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }

  async function handleSave(force = false) {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setConflict(null);
    try {
      const r = await putConfig(draft, force ? undefined : (digest ?? undefined));
      setDigest(r.config_digest);
      setSaved(true);
      onSaved();
    } catch (e) {
      if (isConfigConflict(e)) {
        setConflict(e.detail.detail.current_config);
      } else {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }

  function handleLoadTheirs() {
    if (!conflict) return;
    setDraft(conflict);
    setConflict(null);
  }

  function handleOverwrite() {
    setConflict(null);
    void handleSave(true);
  }

  function handleResetDefaults() {
    setDraft({
      ...draft,
      keywords: [...KEYWORD_DEFAULTS],
      buyer_allowlist: [...BUYER_DEFAULTS],
    });
    setSaved(false);
  }

  return (
    <form
      className="mx-auto max-w-[640px] space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave(false);
      }}
    >
      <Field
        label="Lookback window (days)"
        helper="7 to 90. Larger windows are slower."
        error={lookbackError}
      >
        <input
          type="number"
          min={7}
          max={90}
          value={draft.lookback_days}
          onChange={(e) => set("lookback_days", Number(e.target.value))}
          className={inputCls(!!lookbackError)}
          aria-invalid={!!lookbackError}
        />
      </Field>

      <Field label="Page size">
        <input
          type="number"
          min={1}
          max={1000}
          value={draft.page_size}
          onChange={(e) => set("page_size", Number(e.target.value))}
          className={inputCls(false)}
        />
      </Field>

      <Field label="High-value threshold (ZAR)">
        <div className="flex items-center gap-2">
          <span className="text-on-surface-variant">R</span>
          <input
            type="number"
            min={0}
            value={draft.high_value_threshold_zar}
            onChange={(e) => set("high_value_threshold_zar", Number(e.target.value))}
            className={inputCls(false)}
          />
        </div>
      </Field>

      <Field label="Closing-soon window (days)">
        <input
          type="number"
          min={1}
          max={60}
          value={draft.closing_soon_days}
          onChange={(e) => set("closing_soon_days", Number(e.target.value))}
          className={inputCls(false)}
        />
      </Field>

      <Field label="Include closed tenders">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.include_closed}
            onChange={(e) => set("include_closed", e.target.checked)}
          />
          {draft.include_closed ? "On" : "Off"}
        </label>
      </Field>

      <Field
        label="Keywords (one per line)"
        helper="Substring match on title or item classification."
      >
        <textarea
          rows={12}
          value={draft.keywords.join("\n")}
          onChange={(e) => set("keywords", e.target.value.split(/\r?\n/).filter(Boolean))}
          className={inputCls(false) + " font-mono"}
        />
        <ChipRow items={draft.keywords} onRemove={(k) => set("keywords", draft.keywords.filter((x) => x !== k))} palette="secondary" />
      </Field>

      <Field label="Buyer allowlist (one per line)">
        <textarea
          rows={5}
          value={draft.buyer_allowlist.join("\n")}
          onChange={(e) => set("buyer_allowlist", e.target.value.split(/\r?\n/).filter(Boolean))}
          className={inputCls(false) + " font-mono"}
        />
        <ChipRow items={draft.buyer_allowlist} onRemove={(b) => set("buyer_allowlist", draft.buyer_allowlist.filter((x) => x !== b))} palette="tertiary" />
      </Field>

      {error && (
        <div className="rounded-card border border-error-container bg-error-container p-3 text-sm text-on-error-container">
          {error}
        </div>
      )}

      {conflict && (
        <div className="space-y-3 rounded-card border border-error-container bg-error-container p-3 text-sm text-on-error-container">
          <p>
            Someone else saved changes to this config while you were editing.
            Your changes were <strong>not</strong> saved.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleLoadTheirs}
              className="rounded-card bg-surface px-4 py-2 text-xs font-bold text-on-surface"
            >
              Load their version (discard my edits)
            </button>
            <button
              type="button"
              onClick={handleOverwrite}
              className="rounded-card border border-on-error-container px-4 py-2 text-xs font-bold text-on-error-container"
            >
              Overwrite with my version anyway
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleResetDefaults}
          className="text-sm font-bold text-primary"
        >
          Reset to defaults
        </button>
        <button
          type="submit"
          disabled={!canSave}
          className={
            canSave
              ? "rounded-card bg-primary px-8 py-2 text-sm font-bold text-on-primary"
              : "cursor-not-allowed rounded-card bg-surface-variant px-8 py-2 text-sm font-bold text-on-surface-variant/70"
          }
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {saved && (
        <p className="text-center text-xs text-tertiary">Saved.</p>
      )}
    </form>
  );
}

function inputCls(hasError: boolean) {
  return [
    "w-full rounded-card border bg-surface px-3 py-2 text-sm",
    hasError
      ? "border-error focus:border-error focus:outline-none focus:ring-2 focus:ring-error/30"
      : "border-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30",
  ].join(" ");
}

function Field({
  label, helper, error, children,
}: { label: string; helper?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-bold text-on-surface" style={{ fontFamily: "Orbitron, sans-serif" }}>{label}</span>
      {children}
      {error ? (
        <span className="text-xs font-bold text-error">{error}</span>
      ) : helper ? (
        <span className="text-xs text-on-surface-variant">{helper}</span>
      ) : null}
    </label>
  );
}

function ChipRow({
  items, onRemove, palette,
}: { items: string[]; onRemove: (item: string) => void; palette: "secondary" | "tertiary" }) {
  const cls =
    palette === "secondary"
      ? "bg-secondary-container text-on-secondary-container"
      : "bg-tertiary-container text-on-tertiary-container";
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {items.map((it) => (
        <span key={it} className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] ${cls}`}>
          {it}
          <button
            type="button"
            aria-label={`Remove ${it}`}
            onClick={() => onRemove(it)}
            className="text-[10px]"
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}

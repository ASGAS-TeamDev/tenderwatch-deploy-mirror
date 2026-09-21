import { useMemo, useState } from "react";
import type { Config } from "../api/client";
import { putConfig, isConfigConflict } from "../api/client";

const KEYWORD_DEFAULTS = [
  // Risk Diversion — digital forensic investigation services. Bare
  // "forensic" is a naturally rare/specific word in general government
  // tender text (unlike "development" or "agricultural"), so it's a
  // low-noise root that already covers "digital/computer/mobile
  // forensics", "forensic investigation/analysis", "cyber forensics",
  // "audio/video forensic" and "forensic training" as substrings.
  "forensic", "cyber intelligence", "data recovery",
  // Farm Logic — agri-tech marketplace / farm management platform.
  // No keyword-only agri-tech terms: every phrase tried (bare
  // "agricultural", then narrower "agri-tech"/"farm management"/etc.)
  // produced either noise (physical goods tenders) or zero matches in the
  // real feed. Agri-side coverage is buyer-only for now (AgriSETA, Land
  // Bank, below) — matching is keyword OR buyer, so this needs no
  // keyword counterpart.
  //
  // Added 2026-09-18 — user-supplied list, broadening into the wider
  // risk/investigation/security-services space. Not yet empirically
  // validated against the live feed — some (bare "training",
  // "investigation") are generic enough to risk noise. Shown as
  // individually toggleable checkboxes below so noisy ones can be
  // switched off without touching raw JSON.
  "risk management", "training", "threat and risk assessment",
  "assessment tools development centre", "risk assessment",
  "software performance testing services", "assessment tools development",
  "biometric security systems", "professional technical training services",
  "biometric access control", "fraud and corruption", "investigation",
  "whistleblowing", "hotline management service", "smoke detector",
  "alarms supply delivery", "screening verification", "reference checks",
  "ai/ml", "software development",
];

const BUYER_DEFAULTS = [
  // Forensics — law enforcement / prosecuting / investigative bodies.
  // Neither acronym nor full name is confirmed against real eTenders
  // buyer strings — both forms listed as a hedge until a real match surfaces.
  "saps", "south african police service",
  "hawks", "dpci", "directorate for priority crime investigation",
  "npa", "national prosecuting authority",
  "siu", "special investigating unit",
  "ipid", "independent police investigative directorate",
  "department of justice",
  // Agri-tech — deliberately narrow. Generic "agriculture" department
  // buyers were tried and dropped (real provincial names like "Gauteng -
  // Agriculture and Rural Development" procure mostly physical goods).
  // AgriSETA and Land Bank are narrow-mandate agri bodies, safer to match.
  "agriseta", "land bank",
  // Added 2026-09-18 — user-supplied buyer names.
  "council for medical schemes", "indigent subsidy verification agency",
  "cross-border road transport agency", "airports company of south africa",
];

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

  // The checkbox list shows every known default plus any custom entries
  // already saved in this config, so nothing the user typed previously
  // disappears just because it isn't one of the curated defaults.
  const keywordCatalog = useMemo(
    () => Array.from(new Set([...KEYWORD_DEFAULTS, ...draft.keywords])),
    [draft.keywords],
  );
  const buyerCatalog = useMemo(
    () => Array.from(new Set([...BUYER_DEFAULTS, ...draft.buyer_allowlist])),
    [draft.buyer_allowlist],
  );

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
      match_all_buyers: false,
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
        label="Keywords"
        wrapper="div"
        helper="Substring match on title, description, category or item classification. Tick to include, untick to exclude — no need to retype the list."
      >
        <CheckboxCatalog
          catalog={keywordCatalog}
          selected={draft.keywords}
          onToggle={(kw) => set("keywords", toggle(draft.keywords, kw))}
          palette="secondary"
        />
        <AddCustom
          placeholder="Add a custom keyword…"
          onAdd={(kw) => set("keywords", [...draft.keywords, kw])}
          existing={draft.keywords}
        />
      </Field>

      <Field label="Buyer allowlist" wrapper="div">
        <label className="mb-2 flex items-center gap-2 rounded-card border border-tertiary bg-tertiary-container/40 px-3 py-2 text-sm font-bold text-on-tertiary-container">
          <input
            type="checkbox"
            checked={draft.match_all_buyers ?? false}
            onChange={(e) => set("match_all_buyers", e.target.checked)}
          />
          All (ignore the buyer list below — match every buyer)
        </label>
        <CheckboxCatalog
          catalog={buyerCatalog}
          selected={draft.buyer_allowlist}
          onToggle={(b) => set("buyer_allowlist", toggle(draft.buyer_allowlist, b))}
          palette="tertiary"
          disabled={draft.match_all_buyers ?? false}
        />
        <AddCustom
          placeholder="Add a custom buyer name…"
          onAdd={(b) => set("buyer_allowlist", [...draft.buyer_allowlist, b])}
          existing={draft.buyer_allowlist}
          disabled={draft.match_all_buyers ?? false}
        />
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
  label, helper, error, children, wrapper = "label",
}: {
  label: string;
  helper?: string;
  error?: string | null;
  children: React.ReactNode;
  // "label" (default) implicitly associates a single inner form control with
  // this label's text for accessibility — correct for the plain inputs
  // below. A field containing several of its own labelled controls (the
  // keyword/buyer checkbox grids) must use "div" instead: nesting a <label>
  // around other <label>s breaks accessible-name computation for every
  // control inside (each checkbox's name ends up merged with this one's).
  wrapper?: "label" | "div";
}) {
  const Wrapper = wrapper;
  return (
    <Wrapper className="block space-y-1">
      <span className="text-sm font-bold text-on-surface" style={{ fontFamily: "Orbitron, sans-serif" }}>{label}</span>
      {children}
      {error ? (
        <span className="text-xs font-bold text-error">{error}</span>
      ) : helper ? (
        <span className="text-xs text-on-surface-variant">{helper}</span>
      ) : null}
    </Wrapper>
  );
}

function toggle(items: string[], item: string): string[] {
  return items.includes(item) ? items.filter((x) => x !== item) : [...items, item];
}

function CheckboxCatalog({
  catalog, selected, onToggle, palette, disabled = false,
}: {
  catalog: string[];
  selected: string[];
  onToggle: (item: string) => void;
  palette: "secondary" | "tertiary";
  disabled?: boolean;
}) {
  const cls =
    palette === "secondary"
      ? "border-secondary/40 has-[:checked]:bg-secondary-container has-[:checked]:text-on-secondary-container has-[:checked]:border-secondary"
      : "border-tertiary/40 has-[:checked]:bg-tertiary-container has-[:checked]:text-on-tertiary-container has-[:checked]:border-tertiary";
  return (
    <div
      className={
        "mt-2 grid grid-cols-1 gap-1.5 rounded-card border border-outline-variant p-2 sm:grid-cols-2" +
        (disabled ? " opacity-50" : "")
      }
    >
      {catalog.map((item) => (
        <label
          key={item}
          className={`flex items-center gap-2 rounded-card border bg-surface px-2 py-1 text-xs ${cls}`}
        >
          <input
            type="checkbox"
            checked={selected.includes(item)}
            disabled={disabled}
            onChange={() => onToggle(item)}
          />
          {item}
        </label>
      ))}
    </div>
  );
}

function AddCustom({
  placeholder, onAdd, existing, disabled = false,
}: { placeholder: string; onAdd: (value: string) => void; existing: string[]; disabled?: boolean }) {
  const [value, setValue] = useState("");
  function submit() {
    const trimmed = value.trim().toLowerCase();
    if (trimmed && !existing.includes(trimmed)) {
      onAdd(trimmed);
    }
    setValue("");
  }
  return (
    <div className="mt-2 flex gap-2">
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        className={inputCls(false)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={submit}
        className="shrink-0 rounded-card bg-surface-variant px-3 py-2 text-xs font-bold text-on-surface-variant disabled:opacity-50"
      >
        Add
      </button>
    </div>
  );
}

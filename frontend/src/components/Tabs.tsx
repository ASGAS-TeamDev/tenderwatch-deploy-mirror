interface Tab {
  id: string;
  label: string;
  icon?: string;
  iconClassName?: string;
}

export function Tabs({
  tabs, active, onChange,
}: { tabs: Tab[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex w-max gap-4 border-b border-outline">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={[
              "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap pb-2 text-sm tracking-wide",
              isActive ? "font-bold text-primary" : "text-on-surface-variant",
            ].join(" ")}
            style={{ fontFamily: "Orbitron, sans-serif" }}
            aria-pressed={isActive}
          >
            {t.icon && <span className={`text-base ${t.iconClassName ?? ""}`} aria-hidden>{t.icon}</span>}
            {t.label}
            {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
          </button>
        );
      })}
    </div>
  );
}

interface Tab {
  id: string;
  label: string;
}

export function Tabs({
  tabs, active, onChange,
}: { tabs: Tab[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-6 border-b border-outline">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={[
              "relative pb-2 text-sm",
              isActive ? "font-bold text-primary" : "text-on-surface-variant",
            ].join(" ")}
            aria-pressed={isActive}
          >
            {t.label}
            {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
          </button>
        );
      })}
    </div>
  );
}

import { useEffect } from "react";

export function Toast({
  message, onClose, durationMs = 3000,
}: { message: string; onClose: () => void; durationMs?: number }) {
  useEffect(() => {
    const id = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(id);
  }, [message, onClose, durationMs]);

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-card bg-on-surface px-4 py-2 text-sm text-surface shadow-lg"
    >
      {message}
    </div>
  );
}

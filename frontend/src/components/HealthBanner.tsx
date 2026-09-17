export function HealthBanner({ message }: { message: string }) {
  return (
    <div className="rounded-card border border-error-container bg-error-container px-4 py-3 text-sm text-on-error-container">
      {message}
    </div>
  );
}

import { cn } from "@/lib/utils";

/**
 * Shared loading vocabulary for the whole site: `Spinner` for inline waits
 * (cards, panels, buttons) and `LoadingScreen` for route / Suspense fallbacks.
 * One visual language everywhere, so a loading state always reads the same.
 */
function Spinner({
  size = 20,
  className,
  label,
}: {
  size?: number;
  className?: string;
  /** Announced to screen readers; hidden visually unless the caller shows it. */
  label?: string;
}) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("relative inline-flex shrink-0 align-middle", className)}
      style={{ width: size, height: size }}
    >
      {/* Static track keeps the ring visible when the arc sweeps past. */}
      <span className="absolute inset-0 rounded-full border-2 border-primary/15" />
      <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary border-r-primary/70" />
    </span>
  );
}

function LoadingScreen({
  label = "Loading",
  hint,
  full = false,
  className,
}: {
  label?: string;
  hint?: string;
  /** Stretch to the viewport instead of the default content height. */
  full?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        full && "min-h-screen",
        !full && "min-h-[60vh]",
        className,
      )}
    >
      <Spinner size={38} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground">
        {label}
      </p>
      {hint ? <p className="max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Route-level fallback: TanStack Router swaps this in while a lazily loaded
 * route chunk is still arriving, so navigation never shows a blank frame.
 */
function RoutePending() {
  return <LoadingScreen full label="Loading page" hint="Fetching the next screen…" />;
}

export { LoadingScreen, RoutePending, Spinner };

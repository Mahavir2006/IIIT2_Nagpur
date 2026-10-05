// Shared reduced-motion probe. Decorative animations (the breach pulse ring) must respect it, and
// several components need the same answer, so it lives here rather than being re-declared.

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

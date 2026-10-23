import type { ReactNode } from "react";

/**
 * The queue, as a mark: three people waiting, the first one highlighted.
 * Drawn from the palette, so it still reads at the size of a favicon.
 *
 * The tile carries a hairline medium-green outline. It was first added on the
 * account screens, where the panel behind the mark is deep green too and the
 * tile would otherwise disappear into it; the outline is now part of the mark
 * everywhere, so the logo looks the same on every surface. It is drawn inside
 * the viewBox rather than as a CSS border, so it scales with the mark instead
 * of only tracing the tile at one particular size.
 */
export function LogoMark({ className = "size-[42px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="MyTurn">
      <rect width="32" height="32" rx="9" fill="var(--color-deep-green)" />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="8.5"
        fill="none"
        stroke="var(--color-medium-green)"
        strokeWidth={1}
      />
      <circle cx="8.5" cy="16" r="3.4" fill="var(--color-primary)" />
      <circle cx="16" cy="16" r="3.4" fill="var(--color-light-lime)" />
      <circle cx="23.5" cy="16" r="3.4" fill="#ffffff" fillOpacity="0.45" />
    </svg>
  );
}

export function Logo({
  className = "",
  tone = "dark",
}: {
  className?: string;
  /** "light" is for the deep green panels, where the wordmark has to be white. */
  tone?: "dark" | "light";
}) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <LogoMark />
      <span
        className={`text-2xl font-bold tracking-tight ${
          tone === "light" ? "text-white" : "text-deep-green"
        }`}
      >
        My
        <span className={tone === "light" ? "text-primary" : "text-medium-green"}>Turn</span>
      </span>
    </span>
  );
}

/** Wraps page content in the same width and padding everywhere. */
export function Shell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 ${className}`}>{children}</div>;
}

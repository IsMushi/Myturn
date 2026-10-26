import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "solid" | "quiet" | "ghost" | "link" | "danger" | "danger-quiet";
type Size = "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  // The bright green is the accent the brand leans on, so it carries the main
  // action with dark green text on top of it.
  primary: "bg-primary text-ink hover:bg-light-lime",
  // Deep green for a second, quieter action.
  solid: "bg-deep-green text-white hover:bg-medium-green",
  quiet: "border border-line bg-white text-deep-green hover:bg-soft-mint",
  // A button with no edge of its own, for a place that already has one.
  ghost: "bg-transparent text-deep-green hover:bg-soft-mint",
  link: "text-deep-green underline underline-offset-4 hover:text-medium-green",
  /*
   * Destructive, in the two weights the application uses, both built from the
   * `--color-danger` scale rather than a red of their own.
   *
   * `danger` is the click that does the thing — the last one in a confirmation
   * dialog — and is filled, so it cannot be mistaken for the "Cancel" beside
   * it. `danger-quiet` starts a confirmation instead, from a toolbar or a row
   * menu, and stays outlined: a page then shows one loud red, at the point of
   * no return rather than at the invitation to reach it.
   */
  danger: "bg-danger text-white hover:bg-danger-strong focus-visible:outline-danger",
  "danger-quiet":
    "border border-danger-line bg-white text-danger hover:bg-danger-soft focus-visible:outline-danger",
};

const SIZES: Record<Size, string> = {
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3.5 text-base",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green " +
  "disabled:cursor-not-allowed disabled:opacity-50";

// `cn` merges rather than concatenates, so a variant can carry a focus ring in
// its own colour and a caller can still override the padding or the width: the
// later class wins because it is *known* to win, not because of the order
// Tailwind happens to emit two equal utilities in.
function buttonClass(variant: Variant, size: Size, className: string) {
  const shape = variant === "link" ? "" : `${SIZES[size]} rounded-full`;
  return cn(BASE, VARIANTS[variant], shape, className);
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
} & ComponentProps<"button">) {
  return (
    <button className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

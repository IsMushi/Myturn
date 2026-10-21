import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "solid" | "quiet" | "ghost" | "link";
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
};

const SIZES: Record<Size, string> = {
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3.5 text-base",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green " +
  "disabled:cursor-not-allowed disabled:opacity-50";

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
  const shape = variant === "link" ? "" : `${SIZES[size]} rounded-full`;
  return (
    <Link href={href} className={`${BASE} ${VARIANTS[variant]} ${shape} ${className}`} {...rest}>
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
  const shape = variant === "link" ? "" : `${SIZES[size]} rounded-full`;
  return (
    <button className={`${BASE} ${VARIANTS[variant]} ${shape} ${className}`} {...rest}>
      {children}
    </button>
  );
}

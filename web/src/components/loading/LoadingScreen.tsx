import { Logo } from "@/components/Logo";

export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-7 bg-soft-mint"
      role="status"
      aria-live="polite"
    >
      <Logo />
      <span className="flex items-center gap-2" aria-hidden="true">
        <span className="size-2.5 animate-bounce rounded-full bg-primary [animation-delay:-0.32s]" />
        <span className="size-2.5 animate-bounce rounded-full bg-light-lime [animation-delay:-0.16s]" />
        <span className="size-2.5 animate-bounce rounded-full bg-medium-green" />
      </span>
      <p className="text-sm font-medium text-medium-green">{label}</p>
    </div>
  );
}

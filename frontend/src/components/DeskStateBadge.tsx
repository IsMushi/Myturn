import type { ServiceState } from "@/lib/types";

const LABELS: Record<ServiceState, string> = {
  active: "Open",
  paused: "Paused",
  closed: "Closed",
};

const STYLES: Record<ServiceState, string> = {
  active: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  paused: "bg-amber-100 text-amber-900 ring-amber-300",
  closed: "bg-rose-100 text-rose-800 ring-rose-300",
};

export function DeskStateBadge({
  state,
  size = "md",
}: {
  state: ServiceState;
  size?: "md" | "lg";
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full font-medium ring-1",
        STYLES[state],
        size === "lg" ? "px-5 py-2 text-xl" : "px-3 py-1 text-sm",
      ].join(" ")}
    >
      <span className="h-2.5 w-2.5 rounded-full bg-current" />
      {LABELS[state]}
    </span>
  );
}

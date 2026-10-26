import type { ServiceState } from "@/lib/types";

const LABELS: Record<ServiceState, string> = {
  active: "Open",
  paused: "Paused",
  closed: "Closed",
};

/* Open sits on a white chip with a green ring, so it reads the same on the
   mint summary card and on a white panel; the green dot carries the state.
   Paused and closed keep the amber and red of the light on the desk, because
   the badge mirrors the hardware. */
const STYLES: Record<ServiceState, string> = {
  active: "bg-white text-deep-green ring-medium-green",
  paused: "bg-amber-100 text-amber-900 ring-amber-300",
  closed: "bg-danger-soft text-danger ring-danger-line",
};

const DOTS: Record<ServiceState, string> = {
  active: "bg-medium-green",
  paused: "bg-current",
  closed: "bg-current",
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
        "inline-flex items-center gap-2 rounded-full font-semibold ring-1",
        STYLES[state],
        size === "lg" ? "px-5 py-2 text-xl" : "px-3 py-1 text-sm",
      ].join(" ")}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${DOTS[state]}`} />
      {LABELS[state]}
    </span>
  );
}

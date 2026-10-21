import type { FieldErrors } from "react-hook-form";

/**
 * Puts the caret in the first field that failed.
 *
 * A form that refuses to submit has to say where the mistake is. The error
 * sentence appears under the field, but on its own the caret stays on the
 * button that was pressed, so the visitor is left hunting for the red box.
 *
 * The field is found by its name, because a field may carry an id of its own
 * (the invitation box is `invite-email` but is registered as `email`), and the
 * id is used as the second try.
 */
export function focusFirstError(errors: FieldErrors): void {
  const first = Object.keys(errors)[0];
  if (!first) return;

  const field =
    document.querySelector<HTMLElement>(`[name="${first}"]`) ??
    document.getElementById(first);
  if (!field) return;

  field.focus();
  field.scrollIntoView({
    block: "center",
    behavior: stillMotion() ? "auto" : "smooth",
  });
}

/** True when the visitor has asked for the page not to move. */
function stillMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

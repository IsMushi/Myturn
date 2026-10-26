/**
 * The one shape every field control shares.
 *
 * A text input, a textarea and the trigger of a `Select` are the same object to
 * the eye: 44 px tall, `rounded-xl`, a hairline border and the same lime focus
 * ring. Keeping the classes here rather than in each component means a select
 * cannot quietly end up with a tighter corner or a shorter height than the
 * input sitting next to it.
 */
export const inputClass =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 font-sans text-base text-ink " +
  "placeholder:text-medium-green/60 outline-none transition " +
  "focus:border-medium-green focus:ring-2 focus:ring-primary/40 " +
  // A field that is already marked as wrong does not get the lime accent as
  // well: the red border and the red ring say the same thing, and the two
  // colours together look like a mistake made twice.
  "aria-[invalid=true]:border-danger " +
  "aria-[invalid=true]:focus:border-danger aria-[invalid=true]:focus:ring-danger/20";

/**
 * The same box, arranged for a button: the value on the left, the chevron on
 * the right. `inputClass` supplies the height, radius, border and ring, so the
 * two line up exactly when they sit in the same row.
 */
export const selectTriggerClass = `${inputClass} flex items-center justify-between gap-2 text-left`;

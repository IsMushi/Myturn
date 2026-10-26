/**
 * The one shape every field control shares.
 *
 * A text input, a textarea and the trigger of a `Select` are the same object to
 * the eye: a hairline border, `rounded-lg`, the same lime focus ring. Keeping
 * the classes here rather than in each component means a select cannot quietly
 * end up with a tighter corner or a shorter height than the input sitting next
 * to it.
 *
 * The height is the part that needs saying twice, so it is split in two: a
 * textarea is as tall as the lines in it (`inputClass`), while a control that
 * holds one line is a fixed 44 px (`singleLineClass`). `Select` and `TextInput`
 * both take the fixed height, and that is not a nicety: the trigger is a flex
 * box whose value is empty until something is chosen, and a box sized by its
 * contents then shrinks to the chevron alone — 38 px, next to a 46 px input.
 */
const fieldBox =
  "w-full rounded-lg border border-line bg-white px-3.5 font-sans text-base text-ink " +
  "placeholder:text-medium-green/60 outline-none transition " +
  "focus:border-medium-green focus:ring-2 focus:ring-primary/40 " +
  // A field that is already marked as wrong does not get the lime accent as
  // well: the red border and the red ring say the same thing, and the two
  // colours together look like a mistake made twice.
  "aria-[invalid=true]:border-danger " +
  "aria-[invalid=true]:focus:border-danger aria-[invalid=true]:focus:ring-danger/20";

/** A field whose height is its content's: a textarea, and nothing else. */
export const inputClass = `${fieldBox} py-2.5`;

/**
 * A field that holds a single line: 44 px tall whatever is inside it.
 *
 * There is no vertical padding on purpose. The height is fixed, so the browser
 * centres the line in the box anyway, and padding as well would only decide
 * which half of the line gets clipped.
 */
export const singleLineClass = `${fieldBox} h-11`;

/**
 * The same box, arranged for a button: the value on the left, the chevron on
 * the right. The height, radius, border and ring are the input's, so the two
 * line up exactly when they sit in the same row.
 */
export const selectTriggerClass = `${singleLineClass} flex items-center justify-between gap-2 text-left`;

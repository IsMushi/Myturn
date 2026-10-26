"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { inputClass, singleLineClass } from "./field-styles";
import {
  Select as RadixSelect,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "./Select";

export { inputClass, singleLineClass };

/** A labelled input that says what went wrong, in words and to a screen reader. */
export function Field({
  label,
  id,
  error,
  hint,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-deep-green">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-medium-green">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({
  id,
  error,
  className = "",
  ...rest
}: { id: string; error?: boolean; className?: string } & React.ComponentProps<"input">) {
  return (
    <input
      id={id}
      aria-invalid={error || undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className={`${singleLineClass} ${className}`}
      {...rest}
    />
  );
}

/**
 * A dropdown in the shape of a field: labelled by `Field`, filled in by the
 * visitor, and honest about what went wrong.
 *
 * The control itself is Radix's (`ui/Select.tsx`) rather than a native
 * `<select>`, so the list of choices opens as a portal and can be moved with
 * the keyboard. What is added here is only what ties it to the rest of the
 * form: the `id` the `<label for>` points at, and the description that says
 * why the server would not take it.
 */
export function Select({
  id,
  error,
  className = "",
  children,
  ...rest
}: {
  id: string;
  error?: boolean;
  className?: string;
  children: ReactNode;
} & React.ComponentProps<typeof RadixSelect>) {
  return (
    <RadixSelect {...rest}>
      <SelectTrigger
        id={id}
        className={className}
        aria-invalid={error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </RadixSelect>
  );
}

export {
  Select as RadixSelect,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "./Select";

export function Alert({
  tone = "error",
  children,
  focus = false,
}: {
  tone?: "error" | "success" | "info";
  children: ReactNode;
  /**
   * Takes the caret when it appears.
   *
   * A message the server sent is the answer to what the visitor just did, so
   * the caret belongs there rather than on the button they pressed.
   */
  focus?: boolean;
}) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);

  const tones = {
    error: "border-danger-line bg-danger-soft text-danger",
    success: "border-line bg-soft-mint text-deep-green",
    info: "border-line bg-white text-medium-green",
  } as const;

  return (
    <p
      ref={ref}
      tabIndex={focus ? -1 : undefined}
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-3.5 py-3 text-sm ${tones[tone]}`}
    >
      {children}
    </p>
  );
}

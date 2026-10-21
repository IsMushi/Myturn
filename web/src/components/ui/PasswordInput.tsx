"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { TextInput } from "./Field";

/** A normal password-manager-compatible input with an accessible visibility button. */
export function PasswordInput({
  visibilityName = "password",
  ...props
}: Omit<ComponentProps<typeof TextInput>, "type"> & { visibilityName?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="myturn-auth-password-wrap">
      <TextInput {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="myturn-auth-password-toggle"
        aria-label={`${visible ? "Hide" : "Show"} ${visibilityName}`}
        aria-pressed={visible}
        aria-controls={props.id}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
      </button>
    </div>
  );
}

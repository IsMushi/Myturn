"use client";

import "sonner/dist/styles.css";

import { Toaster as SonnerToaster } from "sonner";

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

/**
 * Site-wide toast host. Mount once in the root layout; trigger toasts from
 * anywhere with `toast` imported from "sonner".
 *
 * The colours are MyTurn's, not Sonner's. Sonner's own "rich colours" paint a
 * toast in a palette of their own, which is neither the mint of the workspace
 * nor the green of the brand, so they are off and the card is drawn from the
 * page's own tokens instead.
 *
 * What says what kind of message a toast is, then, is the rule down its left
 * edge and the icon beside it — the same device the connection notice on the
 * desk page uses.
 */
export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="light"
      position="top-right"
      closeButton
      style={
        {
          // Sonner paints the card from these, so they are set here rather
          // than argued over with class names.
          "--normal-bg": "var(--color-white)",
          "--normal-border": "var(--color-line)",
          "--normal-text": "var(--color-ink)",
          "--border-radius": "16px",
          "--width": "380px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "group toast overflow-hidden rounded-2xl border-line bg-white text-ink font-sans " +
            "shadow-[0_10px_28px_-18px_rgba(7,61,53,0.55)]! " +
            // The rule that says what kind of message this is.
            "before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-medium-green " +
            "data-[type=success]:before:bg-medium-green " +
            "data-[type=error]:before:bg-rose-500 " +
            "data-[type=warning]:before:bg-amber-500 " +
            "data-[type=info]:before:bg-deep-green " +
            "[&_[data-icon]]:text-medium-green " +
            "data-[type=error]:[&_[data-icon]]:text-rose-600 " +
            "data-[type=warning]:[&_[data-icon]]:text-amber-600 " +
            "data-[type=info]:[&_[data-icon]]:text-deep-green",
          // Sonner writes its own colour for these two, so they are set the
          // hard way rather than losing the argument on specificity.
          title: "text-sm font-semibold text-deep-green!",
          description: "text-sm text-medium-green!",
          // The same: Sonner paints its buttons from the toast's own colours,
          // so the brand's lime button has to be said the hard way.
          actionButton:
            "rounded-full! bg-primary! px-3! py-1.5! text-sm! font-semibold text-ink! hover:bg-light-lime!",
          cancelButton:
            "rounded-full! border! border-line! bg-white! px-3! py-1.5! text-sm! font-semibold text-deep-green! hover:bg-soft-mint!",
          closeButton:
            "rounded-full! border-line! bg-white! text-medium-green! hover:text-deep-green!",
        },
      }}
      {...props}
    />
  );
}

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
 * What says what kind of message a toast is, then, is the icon and the title
 * beside it — the same device the connection notice on the desk page uses.
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
          "--border-radius": "12px",
          "--width": "380px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "group toast overflow-hidden rounded-2xl border-line bg-white text-ink font-sans " +
            "shadow-[0_10px_28px_-18px_rgba(7,61,53,0.55)]! " +
            "[&_[data-icon]]:text-medium-green " +
            "data-[type=error]:[&_[data-icon]]:text-danger " +
            "data-[type=warning]:[&_[data-icon]]:text-amber-600 " +
            "data-[type=info]:[&_[data-icon]]:text-deep-green " +
            // Room for the close button, which sits inside the card now.
            // Only the text moves: the action button stays against the edge.
            "[&_[data-content]]:pr-8!",
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
          // Sonner's own close button straddles the top-left corner, and the
          // card clips it so it cannot be reached at all. It is moved inside
          // the top-right corner instead, where the padding leaves room for it.
          closeButton:
            "absolute! right-2! top-2! left-auto! translate-none! rounded-full! " +
            "border-0! bg-white! p-1! text-medium-green! hover:bg-soft-mint! hover:text-deep-green!",
        },
      }}
      {...props}
    />
  );
}

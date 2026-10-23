"use client";

import { Smartphone, Ticket } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

/**
 * The address the code points at.
 *
 * `NEXT_PUBLIC_PUBLIC_URL` is for a screen opened at `localhost`, where a
 * phone scanning the code would only reach itself. Leave it unset during a
 * normal demonstration and the code follows the address the display was
 * opened from, which is the office network address on the wall.
 */
const CONFIGURED_BASE = process.env.NEXT_PUBLIC_PUBLIC_URL?.trim().replace(/\/+$/, "");

/**
 * A large, quiet code beside the queue.
 *
 * A visitor who has just walked in should not have to find a staff member to
 * join the queue. The number is large enough to scan from a step back, and the
 * address is printed underneath for anyone whose camera will not cooperate.
 */
export function DisplayBookingPanel({ loading = false }: { loading?: boolean }) {
  const [bookingUrl, setBookingUrl] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    // The address only exists in the browser. Reading it in a frame keeps the
    // first render identical on the server and in the browser.
    const frame = window.requestAnimationFrame(() => {
      const base = CONFIGURED_BASE || window.location.origin;
      setBookingUrl(`${base}/ticket`);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading]);

  return (
    <aside
      className={`myturn-display-booking${loading ? " myturn-display-booking-skeleton" : ""}`}
      aria-labelledby={loading ? undefined : "display-booking-title"}
      aria-hidden={loading || undefined}
    >
      <div className="myturn-display-booking-copy">
        <p className="myturn-display-booking-eyebrow">
          <Ticket size={18} aria-hidden="true" />
          <span>Take a ticket</span>
        </p>
        <h2 id={loading ? undefined : "display-booking-title"}><span>Scan to join the queue</span></h2>
        <p><span>Open your phone camera, scan the code, and choose the service you need.</span></p>
      </div>

      <div className="myturn-display-booking-code">
        {!loading && bookingUrl ? (
          <div className="myturn-display-qr-frame">
            <QRCodeSVG
              value={bookingUrl}
              size={240}
              level="M"
              marginSize={1}
              bgColor="#FFFFFF"
              fgColor="#073D35"
              className="myturn-display-qr"
              title="Scan to take a ticket"
            />
          </div>
        ) : (
          <div className="myturn-display-qr-frame myturn-display-qr-loading" aria-hidden="true" />
        )}
        <p className="myturn-display-booking-url">
          <span>{!loading && bookingUrl ? bookingUrl.replace(/^https?:\/\//, "") : "Preparing the code…"}</span>
        </p>
      </div>

      <p className="myturn-display-booking-note">
        <Smartphone size={17} aria-hidden="true" />
        <span>No app needed</span>
      </p>
    </aside>
  );
}

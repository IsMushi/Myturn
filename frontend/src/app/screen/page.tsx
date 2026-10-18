"use client";

import { DeskStateBadge } from "@/components/DeskStateBadge";
import { api } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";

export default function ScreenPage() {
  const { data, error } = usePolling(api.publicState, 3000);

  if (!data) {
    return (
      <p className="py-24 text-center text-xl text-medium-green">
        {error ? error.message : "Connecting to the desk…"}
      </p>
    );
  }

  return (
    <div className="py-6 text-center">
      <div className="flex justify-center">
        <DeskStateBadge state={data.service_state} size="lg" />
      </div>

      <p className="mt-10 text-2xl font-semibold tracking-wide text-medium-green uppercase">
        Now serving
      </p>
      {data.called_no === null ? (
        <p className="mt-6 text-6xl font-semibold text-medium-green">Nobody yet</p>
      ) : (
        <p className="text-[10rem] leading-none font-bold tabular-nums text-deep-green">
          {data.called_no}
        </p>
      )}

      <p className="mt-8 text-2xl text-ink">
        {data.waiting === 0
          ? "Nobody is waiting."
          : `${data.waiting} ${data.waiting === 1 ? "visitor is" : "visitors are"} waiting.`}
      </p>

      <p className="mt-12 text-lg text-medium-green">
        Take a ticket with the QR code at the door and follow your turn on your phone.
      </p>
    </div>
  );
}

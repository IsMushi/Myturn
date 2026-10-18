"use client";

import { DeskStateBadge } from "@/components/DeskStateBadge";
import { api } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";

export default function ScreenPage() {
  const { data, error } = usePolling(api.publicState, 3000);

  if (!data) {
    return (
      <p className="py-24 text-center text-xl text-slate-500">
        {error ? error.message : "Connecting to the desk…"}
      </p>
    );
  }

  return (
    <div className="py-6 text-center">
      <div className="flex justify-center">
        <DeskStateBadge state={data.service_state} size="lg" />
      </div>

      <p className="mt-10 text-2xl font-medium tracking-wide text-slate-500 uppercase">
        Now serving
      </p>
      <p className="text-[10rem] leading-none font-bold tabular-nums">
        {data.called_no ?? "—"}
      </p>

      <p className="mt-8 text-2xl text-slate-700">
        {data.waiting === 0
          ? "Nobody is waiting."
          : `${data.waiting} ${data.waiting === 1 ? "visitor is" : "visitors are"} waiting.`}
      </p>

      <p className="mt-12 text-lg text-slate-500">
        Take a ticket with the QR code at the door and follow your turn on your phone.
      </p>
    </div>
  );
}

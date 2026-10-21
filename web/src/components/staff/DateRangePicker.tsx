"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { kigaliToday } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One calendar for a period, rather than two boxes that ask for a day each.
 *
 * The first day picked is the start and the next one is the end, and the days
 * between them are banded, so the period reads as one stretch of the desk's
 * week. The days after today are not offered: the history stops at today.
 *
 * The chosen period is kept as a draft until it is applied, so a half-finished
 * range never reaches the chart.
 */

/** "2026-10-15" as a day, in the browser's own calendar, so the grid agrees. */
function parseDay(text: string | undefined): Date | undefined {
  if (!text) return undefined;
  const [year, month, day] = text.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

/** A day as "2026-10-15", the shape the chart's range uses. */
function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric" });
const DAY_AND_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const DAY_AND_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** The period in words: "15 - 21 Oct 2026", or the whole date when it differs. */
function periodLabel(from: Date | undefined, to: Date | undefined): string | null {
  if (!from) return null;
  if (!to) return DAY_AND_YEAR.format(from);
  const sameMonth =
    from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();
  if (sameMonth) {
    return `${DAY.format(from)} - ${DAY_AND_YEAR.format(to)}`;
  }
  return `${DAY_AND_MONTH.format(from)} - ${DAY_AND_YEAR.format(to)}`;
}

export function DateRangePicker({
  from,
  to,
  onApply,
  className,
}: {
  /** The period already chosen, as "2026-10-15". */
  from?: string;
  to?: string;
  onApply: (next: { from?: string; to?: string }) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(() => ({
    from: parseDay(from),
    to: parseDay(to),
  }));

  const start = draft?.from;
  const end = draft?.to;
  const label = periodLabel(start, end) ?? "Choose the days";
  const days = start && end ? Math.round((end.getTime() - start.getTime()) / 86400000) + 1 : 0;

  function choose(range: DateRange | undefined) {
    setDraft(range);
  }

  function apply() {
    if (!start || !end) return;
    onApply({ from: toIso(start), to: toIso(end) });
    setOpen(false);
  }

  function clear() {
    setDraft(undefined);
    onApply({ from: undefined, to: undefined });
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Opening always starts from the period already in use, so a cancelled
        // pick leaves nothing behind.
        if (next) setDraft({ from: parseDay(from), to: parseDay(to) });
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="quiet"
          size="md"
          className={cn("justify-start gap-2", className)}
          aria-label={`The period: ${label}`}
        >
          <CalendarDays size={16} aria-hidden="true" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-3">
        <Calendar
          mode="range"
          selected={draft}
          onSelect={choose}
          disabled={{ after: kigaliToday() }}
          numberOfMonths={1}
          weekStartsOn={1}
          autoFocus
        />

        <p className="mt-2 min-h-4 px-1 text-xs text-medium-green" role="status">
          {start && end
            ? `${days} ${days === 1 ? "day" : "days"} · ${periodLabel(start, end)}`
            : start
              ? `From ${periodLabel(start, undefined)} · now choose the last day`
              : "Choose the first day of the period"}
        </p>

        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="quiet"
            size="md"
            className="flex-1"
            disabled={!start || !end}
            onClick={apply}
          >
            Apply
          </Button>
          <Button
            variant="link"
            size="md"
            className="px-3"
            onClick={clear}
            disabled={!from && !to}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

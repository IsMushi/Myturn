"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, formatDay } from "react-day-picker";
import "react-day-picker/style.css";

import { cn } from "@/lib/utils";

/**
 * The month grid, in MyTurn's colours.
 *
 * The two ends of the chosen period are deep green circles and the days
 * between them carry a mint band, so a period reads as one stretch of the
 * desk's week rather than as two loose marks. Today is a lime dot under the
 * number, so "today" is never mistaken for "chosen".
 *
 * The band is the library's own: it is drawn from the `--rdp-range-*`
 * variables below, and the library's rules for the range are left in place.
 * What is replaced is the library's chosen-day rule, which would make every
 * day in the range bold and large.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  style,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-1", className)}
      style={
        {
          // A day is a 44 px target: the desk may be worked from a tablet.
          "--rdp-day-width": "44px",
          "--rdp-day-height": "44px",
          "--rdp-day_button-width": "44px",
          "--rdp-day_button-height": "44px",
          "--rdp-day_button-border": "0 solid transparent",
          "--rdp-selected-border": "0 solid transparent",
          // The band: mint between the ends, deep green on the ends themselves.
          "--rdp-range_middle-background-color": "var(--color-soft-mint)",
          "--rdp-range_middle-color": "var(--color-ink)",
          "--rdp-range_start-background":
            "linear-gradient(var(--color-soft-mint) 0 0) 0 0/var(--rdp-gradient-width) 100% no-repeat",
          "--rdp-range_end-background":
            "linear-gradient(var(--color-soft-mint) 0 0) 100% 0/var(--rdp-gradient-width) 100% no-repeat",
          "--rdp-range_start-date-background-color": "var(--color-deep-green)",
          "--rdp-range_end-date-background-color": "var(--color-deep-green)",
          "--rdp-range_start-color": "var(--color-white)",
          "--rdp-range_end-color": "var(--color-white)",
          "--rdp-gradient-color": "var(--color-soft-mint)",
          "--rdp-gradient-width": "22px",
          ...style,
        } as React.CSSProperties
      }
      classNames={{
        // The month name sits on the left and the arrows on the right, in one
        // line: the library puts the arrows in a row of their own.
        months: "relative flex flex-col gap-3",
        month: "flex flex-col gap-3",
        month_caption: "flex h-8 items-center pr-20",
        caption_label: "text-sm font-semibold text-deep-green",
        nav: "absolute right-0 top-0 flex items-center gap-1",
        button_previous:
          "inline-flex size-8 items-center justify-center rounded-full text-medium-green transition-colors hover:bg-soft-mint hover:text-deep-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green disabled:opacity-30",
        button_next:
          "inline-flex size-8 items-center justify-center rounded-full text-medium-green transition-colors hover:bg-soft-mint hover:text-deep-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green disabled:opacity-30",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-11 text-center text-[11px] font-medium text-medium-green/80",
        week: "mt-1 flex w-full",
        day: "relative size-11 p-0 text-center text-sm text-ink",
        // The library's own class is kept, so its rules for the ends of the
        // range reach the button.
        day_button: "rdp-day_button",
        // The library's chosen-day rule is dropped: it would make every day of
        // the range bold and large, and put a border round all of them.
        selected: "",
        today: "",
        outside: "text-medium-green/40",
        disabled: "text-medium-green/30",
        hidden: "invisible",
        chevron: "size-4",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" {...chevronProps} />
          ) : (
            <ChevronRight className="size-4" {...chevronProps} />
          ),
        DayButton: ({ day, modifiers: dayModifiers, className, ...buttonProps }) => {
          const endpoint =
            dayModifiers.range_start ||
            dayModifiers.range_end ||
            (dayModifiers.selected && !dayModifiers.range_middle);
          return (
            <button
              {...buttonProps}
              className={cn(
                className,
                "relative flex items-center justify-center text-sm tabular-nums transition-colors duration-200",
                "hover:bg-soft-mint",
                endpoint && "bg-deep-green font-semibold text-white hover:bg-deep-green",
                dayModifiers.today && !endpoint && "font-semibold text-deep-green",
                dayModifiers.outside && "text-medium-green/40",
                dayModifiers.disabled && "text-medium-green/30",
              )}
            >
              {formatDay(day.date)}
              {dayModifiers.today && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-2 mx-auto size-1 rounded-full bg-primary"
                />
              )}
            </button>
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

export { Calendar };

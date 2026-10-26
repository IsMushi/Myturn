/**
 * The office is in Kigali.
 *
 * Every time the interface shows is in that zone, whatever timezone the
 * browser, the server or the tablet on the wall happens to be in, so the
 * number on the display and the number on the desk are the same number.
 * Rwanda keeps no daylight saving, so the zone is UTC+2 all year.
 */
export const TIME_ZONE = "Africa/Kigali";

/** Short relative time, for the device line on the dashboard. */
export function relative(iso: string | null): string {
  if (!iso) return "never";

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds} s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) {
    return remMin === 0 ? `${hours} h ago` : `${hours} h ${remMin} min ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;

  return calendarDate(iso);
}

/**
 * A path from the query string, or the fallback.
 *
 * Only a path inside this site is accepted, so a crafted link cannot send a
 * visitor somewhere else after they sign in.
 */
export function safePath(candidate: string | null | undefined, fallback: string): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  return candidate;
}

/** A time of day, for lines that say when something was last checked. */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

/** A calendar date, for lines that say which day something happened. */
export function calendarDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { timeZone: TIME_ZONE });
}

/** A date and a time of day, for the moments a person has to place. */
export function fullTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { timeZone: TIME_ZONE });
}

/**
 * Today, as the office's calendar day, at the start of that day.
 *
 * The clock on the wall and the day the desk is working belong to Kigali, so
 * a calendar that asks for a range must not offer the days after them.
 */
export function kigaliToday(): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(read("year"), read("month") - 1, read("day"));
}

/**
 * A rough wait, in whole minutes.
 *
 * The desk is worked one visitor at a time, so the wait is the number of
 * tickets still ahead multiplied by how long the desk usually takes. It is
 * only worked out when the server has enough served tickets to measure that
 * average, and the interface says so rather than presenting a guess as fact.
 */
export function waitEstimate(
  ahead: number,
  averageSeconds: number | null,
): { minutes: number } | null {
  if (averageSeconds === null || averageSeconds < 0) return null;
  if (ahead <= 0) return { minutes: 0 };
  return { minutes: Math.max(0, Math.round((ahead * averageSeconds) / 60)) };
}

/**
 * "about 9 minutes", "about 1 hour", "about 2 h 30 min", or "less than a
 * minute". Past an hour it leans on formatDuration, so a long estimate is
 * never shown as a four-figure count of minutes.
 */
export function describeWait(estimate: { minutes: number } | null): string | null {
  if (estimate === null) return null;
  if (estimate.minutes <= 0) return "less than a minute";
  if (estimate.minutes === 1) return "about 1 minute";
  if (estimate.minutes < 60) return `about ${estimate.minutes} minutes`;
  return `about ${formatDuration(estimate.minutes * 60)}`;
}

/** A count with its noun, so the page never says "1 tickets". */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? singular + "s")}`;
}

/**
 * A measured duration: "42 s", "1 min 20 s", "3 min", "2 h 5 min", "1 d 4 h".
 *
 * The unit grows with the length, so a ticket left waiting overnight reads
 * "23 h 39 min" rather than "1419 min 39 s". Seconds are dropped once the
 * duration reaches an hour: they are noise at that scale, and the desk only
 * needs to know how long somebody has been standing there.
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;

  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    const rest = total % 60;
    return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const restMinutes = minutes % 60;
    return restMinutes === 0 ? `${hours} h` : `${hours} h ${restMinutes} min`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days} d` : `${days} d ${restHours} h`;
}

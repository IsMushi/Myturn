import { ChevronRight, Users } from "lucide-react";

/**
 * How many people are waiting across the whole office.
 *
 * The number is the server's, never a sum worked out in the browser: a display
 * that counts for itself would disagree with the desk it is describing.
 */
export function WaitingSummary({ waiting }: { waiting: number }) {
  return (
    <p
      className="myturn-display-total"
      aria-label={`${waiting} ${waiting === 1 ? "visitor" : "visitors"} waiting`}
    >
      <Users size={26} aria-hidden="true" />
      <strong>{waiting}</strong>
      <span>{waiting === 1 ? "visitor waiting" : "visitors waiting"}</span>
      <ChevronRight className="myturn-display-total-chevron" size={24} aria-hidden="true" />
    </p>
  );
}

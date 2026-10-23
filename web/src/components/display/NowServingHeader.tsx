import { ChevronRight, Users } from "lucide-react";

/**
 * "Now serving" - clean header without waiting count.
 *
 * The heading is the first thing read from across the room.
 * Simplified to remove the waiting count as requested.
 * An optional notice from the administrator appears beneath the welcome.
 */
export function NowServingHeader({ waiting, notice }: { waiting: number; notice?: string }) {
  return (
    <div className="myturn-display-intro">
      <div className="myturn-display-intro-text">
        <p className="myturn-display-welcome">Welcome. Please watch for your number.</p>
        {notice && (
          <p className="myturn-display-notice">{notice}</p>
        )}
        <h1 className="myturn-display-title">Now serving</h1>
      </div>
      <div className="myturn-display-total">
        <Users size={26} aria-hidden="true" />
        <ChevronRight className="myturn-display-total-chevron" size={24} aria-hidden="true" />
      </div>
    </div>
  );
}

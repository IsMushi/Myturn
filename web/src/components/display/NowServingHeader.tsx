import { WaitingSummary } from "./WaitingSummary";

/**
 * "Now serving", with the total waiting beside it.
 *
 * The heading is the first thing read from across the room; the summary is the
 * second. Both sit on one line on a television and stack on a phone.
 */
export function NowServingHeader({ waiting }: { waiting: number }) {
  return (
    <div className="myturn-display-intro">
      <div className="myturn-display-intro-text">
        <p className="myturn-display-welcome">Welcome. Please watch for your number.</p>
        <h1 className="myturn-display-title">Now serving</h1>
      </div>
      <WaitingSummary waiting={waiting} />
    </div>
  );
}

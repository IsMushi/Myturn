/** How many numbers a card lists before it counts the rest. */
const SHOWN = 8;

/**
 * The numbers this queue will call next.
 *
 * A television is read from across the room, so the numbers are chips rather
 * than a sentence, and only the next few are listed: a long queue stays a
 * count beside them instead of growing a column that would push the other
 * services off the screen. The count in the card's footer is still the truth
 * about the whole queue; this is the part of it a visitor can act on.
 *
 * Every number comes from the server, in the order it will be called, and
 * none of them says anything about the person holding it.
 */
export function WaitingList({
  labels,
  total,
  serviceName,
}: {
  /** The next numbers, at most eight of them. */
  labels: string[];
  /** How many are waiting in total, however many are listed. */
  total: number;
  /** Named so the list makes sense when it is read aloud. */
  serviceName: string;
}) {
  if (total === 0) return null;

  // The count beside this list still comes from the server, so a payload that
  // predates the list costs the numbers, not the board.
  const listed = labels ?? [];
  if (listed.length === 0) return null;

  const shown = listed.slice(0, SHOWN);
  const rest = total - shown.length;

  return (
    <div className="myturn-display-waiting-list">
      <p className="myturn-display-waiting-title">Next up</p>
      <ul className="myturn-display-waiting-chips" aria-label={`Waiting for ${serviceName}`}>
        {shown.map((label) => (
          <li key={label} className="myturn-display-waiting-chip">
            {label}
          </li>
        ))}
        {rest > 0 && (
          <li className="myturn-display-waiting-chip myturn-display-waiting-more">
            +{rest} more
          </li>
        )}
      </ul>
    </div>
  );
}

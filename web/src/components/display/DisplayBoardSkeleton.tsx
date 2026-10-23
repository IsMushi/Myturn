import { DisplayBookingPanel } from "./DisplayBookingPanel";

/** Mirrors the called/waiting/booking layout without inventing queue data. */
export function DisplayBoardSkeleton() {
  return (
    <div className="myturn-display-board-content myturn-display-skeleton" aria-hidden="true" data-testid="display-skeleton">
      <div className="myturn-display-queue-board">
        <div className="myturn-display-service">
          <div className="myturn-display-service-head">
            <div className="myturn-display-placeholder myturn-display-placeholder-name" />
          </div>
          <div className="myturn-display-current-content">
            <div className="myturn-display-idle">
              <div className="myturn-display-placeholder myturn-display-placeholder-art" />
              <div className="myturn-display-placeholder myturn-display-placeholder-message" />
              <div className="myturn-display-placeholder myturn-display-placeholder-description" />
            </div>
          </div>
        </div>
        <div className="myturn-display-waiting-panel">
          <div className="myturn-display-waiting-panel-head">
            <div className="myturn-display-placeholder myturn-display-placeholder-name" />
          </div>
          <div className="myturn-display-waiting-panel-content">
            {[0, 1, 2].map((index) => (
              <div className="myturn-display-waiting-group" key={index}>
                <div className="myturn-display-placeholder myturn-display-placeholder-waiting" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <DisplayBookingPanel loading />
    </div>
  );
}

/** Mirrors the board's geometry without presenting made-up queue information. */
export function DisplayBoardSkeleton() {
  return (
    <>
      <div className="myturn-display-intro myturn-display-skeleton" aria-hidden="true">
        <div className="myturn-display-intro-text">
          <div className="myturn-display-placeholder myturn-display-placeholder-welcome" />
          <div className="myturn-display-placeholder myturn-display-placeholder-title" />
        </div>
        <div className="myturn-display-total">
          <div className="myturn-display-placeholder myturn-display-placeholder-summary" />
        </div>
      </div>
      <div className="myturn-display-board-content myturn-display-skeleton" aria-hidden="true" data-testid="display-skeleton">
        <div className="myturn-display-services">
          {[0, 1].map((index) => (
            <div className="myturn-display-service" key={index}>
              <div className="myturn-display-service-head">
                <div className="myturn-display-placeholder myturn-display-placeholder-letter" />
                <div className="myturn-display-placeholder myturn-display-placeholder-name" />
                <div className="myturn-display-placeholder myturn-display-placeholder-badge" />
              </div>
              <div className="myturn-display-service-body">
                <div className="myturn-display-idle">
                  <div className="myturn-display-placeholder myturn-display-placeholder-art" />
                  <div className="myturn-display-placeholder myturn-display-placeholder-message" />
                  <div className="myturn-display-placeholder myturn-display-placeholder-description" />
                </div>
              </div>
              <div className="myturn-display-service-foot">
                <div className="myturn-display-placeholder myturn-display-placeholder-waiting" />
                <div className="myturn-display-placeholder myturn-display-placeholder-count" />
              </div>
            </div>
          ))}
        </div>
        <div className="myturn-display-waiting-panel">
          <div className="myturn-display-waiting-panel-head">
            <div className="myturn-display-placeholder myturn-display-placeholder-name" />
          </div>
          <div className="myturn-display-waiting-panel-content">
            {[0, 1, 2].map((index) => (
              <div className="myturn-display-placeholder myturn-display-placeholder-waiting" key={index} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

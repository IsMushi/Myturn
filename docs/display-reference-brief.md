# Wall display reference brief

## Scope and project constraints

Restyle `/display` to reproduce the user's supplied 1916 × 821 image. This is an existing-screen redesign for visitors watching a waiting-room monitor, not a new application. Other pages, accounts, waiting line rules, and backend data are out of scope.

Read the project README, repository and web AGENTS instructions, global tokens, current display components and styles. Inspected browser captures of the current `/display`, `/`, and `/ticket` screens. The display currently has the right structure but undersized type, icons, badges and summary, different spacing, and a much plainer background and empty illustration.

Reuse `DisplayBoard`, `PublicDisplayHeader`, `NowServingHeader`, `WaitingSummary`, `ServiceQueueCard`, `ServiceStatusBadge`, `EmptyQueueState`, `ActiveTicketDisplay`, `PublicDisplayFooter`, and the existing logo. Keep Google Sans, the global brand tokens, live SSE/polling and real server values. Isolate screenshot-specific palette refinements and sizing in display styles so other screens do not change.

## References

The user's screenshot is the visual authority. Online references are domain cross-checks only; they must not introduce a new aesthetic.

| Source and exact section | Pattern and fit | Do not copy | Usability risk |
| --- | --- | --- | --- |
| User-supplied image, complete MyTurn waiting-room display | Three service columns, prominent title, status pills, total waiting and ticket empty-state illustration match the requested screen exactly | Static example counts and timestamp must not replace live values | Narrow screens need stacking rather than shrinking text beyond legibility |
| https://help.waitwhile.com/en/articles/10073094-public-displays — Serving display and Waitlist overview display | Service-point calls and separate waiting-line availability support MyTurn's multi-service model | Names, estimated times or extra customer data | Public identification would conflict with anonymous ticket numbers |
| https://www.qmatic.com/products/display-signage/ — Waiting Area Displays and Counter Displays | Called tickets paired with destination support clear waiting-room wayfinding | Media advertising, product branding and voice features outside this task | Ancillary content could distract from current calls |
| https://www.qminder.com/blog/queue-management/waitlist-monitor-digital-signage/ — monitor definition and steps 3–4 | Automatic progress and destination updates validate preserving the existing live stream | Name-based calls, SMS, and competitor branding | A stale screen must never appear connected |

Access: the user's reference and local browser screenshots were visually inspected. Online references were fetched as text/Markdown with image links, not rendered; no typography, color or spacing conclusions are drawn from those pages.

## Recommended direction

Faithful screenshot reproduction, not a reinterpretation:

- Full-width approximately 98 px header; logo left, broadcast connection label and update time right, subtle separator.
- Mint-white base, large translucent flowing mint shapes; dark teal headings, muted blue-teal supporting text, white cards, fine pale teal borders, lime open pill and amber paused pill.
- Approximately 60 px desktop side gutters. Welcome line above a bold approximately 80 px title. Large white waiting summary aligned right.
- Three balanced cards with approximately 24 px corners, large service letter tiles, approximately 38 px service names, outlined status pills, centered ticket artwork, approximately 38 px empty headings and 23 px descriptions. Card footers remain white with larger icons and waiting counts.
- Ticket instruction and tagline at the bottom, no full-width footer rule absent from the reference.
- Reuse the small ticket illustration cropped from the supplied local reference asset. Retain the brand logo but tune its display-specific treatment to the reference.
- No entrance animations. Preserve meaningful new-call feedback and reduced-motion support. Status is expressed in text, not color alone.
- Keep loading, empty-services, closed, active-call, multi-desk, offline/stale and retry states. No new permissions needed for this public screen.
- Desktop fidelity first; stack cards on phones, adapt on tablets, prevent horizontal overflow. Check large monitors and shorter laptop viewports in Chromium.

## Risks and verification

The exact reference was located at `web/public/images/MyTurn Queue Dashboard.png`. Extract its decorative ticket artwork using `tools/extract-display-art.py` rather than approximating it; all labels and data remain real HTML. Logo shading may not be pixel-identical. Live service counts, states and update times will naturally differ; use browser-only mocked responses for matching reference-state screenshots, never alter the real database merely to match the image.

Verify the rendered desktop result at 1916 × 821 against the reference, plus mobile/tablet layouts and real-data operation. Run TypeScript, lint and build checks as appropriate, respecting the existing running-server and cache instructions.

## Approval

Approved by the user: “do it”. Implement faithful screenshot reproduction on the existing `/display` page. No UI code changed before approval.

## Implementation and verification

- Implemented the reference layout, three service cards, title and total hierarchy, palette, borders, status pills, background waves and original ticket artwork. Service states, calls, counts and timestamps remain server-driven.
- Added the subsequently requested skeleton loader. It mirrors the title, total and three cards, preserves desktop card geometry, is hidden from screen readers as decoration, announces loading through the board's existing status region and busy state, and disables its pulse for reduced-motion users.
- Visually reviewed desktop, phone, laptop, skeleton, active/multi-desk, and stale/offline screenshots. The desktop matches the reference's hierarchy and proportions, not its baked-in data. The background waves and logo shading are recreated, not pixel-identical raster copies.
- `npx tsc --noEmit`: passed. `npx eslint .`: passed. `npm run build`: passed.
- `tools/check-display-ui.py`: all 52 checks passed against both the development server and production build. Covers the 1916 × 821 reference viewport, ten widths from 320 through 2560 px, skeleton loading/reduced motion/transition geometry, empty/closed states, multi-desk calls, failed requests, retry, stale data/reconnect, and the real API/live connection. No browser runtime errors.
- Screenshots saved outside the repository in `C:\Users\Isaac\AppData\Local\Temp\opencode\display-production-verification`.

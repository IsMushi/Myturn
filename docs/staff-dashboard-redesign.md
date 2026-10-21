# Staff dashboard redesign — approval brief

## 1. Scope

- Redesign `/staff/dashboard` for staff repeatedly calling and serving visitors.
- Improve operational hierarchy, feedback, responsive layout and connection states.
- Not a new analytics product, backend rewrite, WebSocket migration or claim of production readiness. Existing single-worker and mail-delivery limitations remain separate work.

## 2. Project constraints

- Keep MyTurn branding, Google Sans, existing sidebar, role gates and one sidebar-owned Sign out.
- Reuse `ConsoleShell`, `AccountGate`, `Button`, `Select`/`SelectItem`, `DeskStateBadge`, existing chart components and loading primitives.
- Existing colors: deep green `#00594f`, ink `#073d35`, mint `#eaf7ef`, lime `#b9f477`, primary `#80ef24`, white and line `#b8d8c7`. Retain Tailwind spacing scale and existing 8–12px control radii; no new global theme.
- Preserve server queue ordering, desk/service selection, CSRF, permissions, recall, walk-ins, ten-second undo and SSE/polling fallback. Do not add manual LED controls.
- Preserve the unique Served button name, exact Open/Close button names, and first `p.tabular-nums` as the called ticket number.
- Related screens inspected in the browser: `/admin/settings`, `/admin/statistics`.

## 3. References

| Source and exact visual | Useful pattern and fit | Do not copy / usability risk |
| --- | --- | --- |
| [Qminder Service Dashboard](https://www.qminder.com/features/service-dashboard/) — Service Dashboard visitor/action illustration | Visitor identity, service and elapsed time grouped directly with the call action. Use ticket identity and a clear action hierarchy. | No visitor names, appointments, reassignment or purple branding. Equal-weight actions can obscure the primary task. |
| [Waitwhile Visits](https://waitwhile.com/blog/new-waitwhile-for-customer-flow-management/#meet-visits-your-mission-control) — annotated Visits list screenshot | Serving and waiting are distinct, with compact rows and time columns. Fits an ordered queue staff can scan quickly. | No CRM, chat, bookings, drag-to-reorder or arbitrary visitor selection. Icon-only actions and tiny text are accessibility risks. |
| [Qmatic Counter](https://www.qmatic.com/products/counter) — Counter hero illustration | Call next is visually dominant, reflecting a repetitive counter workflow. | No artwork, blue branding or unsupported combined transaction semantics. Its illustration alone is not evidence of a complete shipped screen or its accessibility. |

Access: read the public product pages and visually inspected their published images. No access to authenticated competitor applications. Qminder/Qmatic images are marketing illustrations, not full-screen product evaluations. Local screenshots show the real paused, empty queue; no tickets or desk settings were changed for research. Signing in records normal account activity.

## 4. Findings

- Current main panel leaves a large blank region; a narrow queue and prominent diagnostics compete with serving tasks.
- Charts already use real data, but are secondary to the active queue.
- The offline board still displays Free/None without sufficiently distinguishing old readings from current evidence.
- Use labels, not color alone; visible keyboard focus; generous action targets; no entrance or continuously pulsing animations.

## 5. Recommended direction: focused service workspace

1. **Header:** Service desk, explicit service/desk identity, desk picker and compact data freshness feedback.
2. **Desk toolbar:** status plus Open / Pause / Close; visually separate availability from ticket actions.
3. **Compact summary strip:** Waiting now, Your served today, Your no-shows today, and measured average service duration with its sample/scope label. Never imply session counts are office totals.
4. **Main split:** larger current-call workspace on the left; ordered waiting list on the right with ticket, joined time/elapsed wait and optional contact. Keep FIFO ordering; clearly identify the next ticket without suggesting it is reserved across desks.
5. **Serving workspace:** large ticket number, elapsed call and requeue deadline; Served primary, recall/no-show secondary, cancellation separated. Idle states explain empty/paused/closed conditions and show Call next when allowed. Keep undo and action feedback next to the controls.
6. **Walk-ins:** compact action beside the waiting list, preserving the issued-ticket tracking link.
7. **Below:** compact device connection summary with expandable diagnostics; existing real charts inside an expandable service-trends section. Keyboard help remains available without dominating the page.

Use existing font: 24–28px page heading, 14–16px body, 12–13px metadata, 64–80px called ticket. Restrained white surfaces, mint page background, deep-green text and lime primary emphasis. No gradients, decorative shadows or a separate card for every datum. Mobile stacks current call before waiting list and diagnostics.

## 6. States, risks and verification

- Handle initial loading, no desks, empty queues, paused/closed desks, permission/session expiry, failed actions, refresh failures and reconnection explicitly.
- Show last successful update; disable queue mutations when current data cannot be trusted. Keep failed-action notices visible beside their controls.
- Offline sensor values are historical, not proof of Free/Occupied now. Expandable diagnostics must state their timestamp and staleness.
- The API remains authoritative: multi-desk races may change which ticket is next, undo may expire, and deadlines depend on server time.
- Test desktop, tablet and 375px mobile, keyboard/Radix interactions, reduced motion and long queues. Verify actions against an isolated test environment rather than resetting the user's live queue.

## 7. Approval

Approved by the user in this session before implementation.

## Implementation notes

- The layout reuses the existing console, buttons, select, status badge, dialog, charts and skeleton primitive. Styling is scoped in `web/src/components/staff-dashboard.css`; global tokens and other pages are unchanged.
- Queue actions pause after a failed refresh or 15 seconds without a successful response. Reconnecting requires a fresh queue response, not just an open stream.
- Device diagnostics use a conservative 30-second display-freshness threshold in addition to the server's online flag. Historical readings never imply current occupancy. This does not alter server hold rules.
- Cancellation now uses the existing accessible dialog. Repeated writes and desk switching are locked while a mutation is pending. Failed undo feedback remains visible; the U shortcut works when no ticket is called.
- Service totals are explicitly scoped: personal counts cover all desks since midnight UTC; the average uses the server's latest completed-ticket samples for the selected service.
- Repeatable UI verification: `python tools/check-staff-dashboard.py`. It starts a disposable API/SQLite database on a free port and intercepts all browser API requests. It does not mutate or reset the live database.

## Verification recorded in this session

- `npx tsc --noEmit` — passed.
- `npx eslint .` — passed.
- `npm run build` — passed, including static generation of `/staff/dashboard`.
- `python tools/check-staff-dashboard.py` — 34 checks passed against the disposable backend. Covered real queue actions, recall, undo including failure, cancellation confirmation, pending-write locks, stale/error/reconnect/expired-session states, device reports, measured averages, long queues, desktop/tablet/mobile and landscape layouts, and reduced motion.
- Reviewed rendered screenshots of paused, active, mobile, long-queue and diagnostic states against the approved direction. The sidebar remains shared, charts/diagnostics are secondary, and no mock data is used by the actual dashboard.
- The web dev server was restarted after the production build. The live API and transactional database were not reset for verification. Hardware-in-the-loop behavior and a full production deployment audit were not part of this UI pass.

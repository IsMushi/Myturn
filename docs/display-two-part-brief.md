# Two-part public queue board

## Approved direction

User requested called tickets on the left, the actual waiting-ticket list on
the right, a countdown from 60 seconds, and removal of visible borders. Approved
with "implement it and remove those border i see on that border".

Keep MyTurn's Google Sans, dark teal type, mint workspace, white surfaces,
existing status badges, public live stream, booking QR, and service-point wording.
Whitespace and surface color separate regions; no card or divider borders.
Mobile stacks called tickets, waiting list, then booking.

## Domain references

Reviewed current source and earlier rendered MyTurn screenshots; fetched the
following references as documentation/HTML, not rendered competitor interfaces.
No claims about competitor typography or colors are used.

| Reference | Pattern and fit | Exclude | Risk |
| --- | --- | --- | --- |
| https://help.waitwhile.com/en/articles/10073094-public-displays — Serving and Waitlist displays | Distinguish currently called visitors from an ordered waiting list | Personal names and estimated waits | Public privacy; show ticket numbers only |
| https://www.qmatic.com/products/display-signage/ — Waiting Area Displays | Pair the call with its destination service point | Advertising, voice features, branding | Don't let ancillary material obscure the call |
| https://www.qminder.com/blog/queue-management/waitlist-monitor-digital-signage/ — steps 2–4 | Keep waiting positions and destination updates live | Names, marketing claims and SMS additions | Stale information must be identified |

## Implementation and contracts

- Reuse `CombinedServicePanel`, `ActiveTicketDisplay`, `WaitingPanel`,
  `EmptyQueueState`, status badges and booking panel; no dependency additions.
- Waiting labels and totals remain server-owned; eight-label previews show the
  remaining count without fabricating tickets or positions across services.
- Per-call arrival timer is 60 seconds from `called_at`, anchored to `server_time`
  and advanced with `performance.now()`. Refresh/reconnect cannot invent a new
  arrival window. Invalid timestamps show an unavailable message.
- This is an arrival display, not a service-duration limit or a replacement for
  sensor-assisted server hold rules. At zero, retain the call until the server
  removes it. While disconnected, do not present a live countdown.
- Skeleton matches the three visible regions. Empty, closed, multi-service and
  simultaneous-call states remain supported.

## Verification

`python tools/check-display-two-part.py`: 49 checks passed in Chromium, using
browser-only fixtures and no office writes. Includes wrong browser wall clock,
decrement, refresh persistence, zero clamping, invalid timestamps, independent
calls, offline/reconnect, empty/closed states, previews, singular/plural counts,
border removal and ten widths from 320px to 2560px.

Desktop and mobile screenshots reviewed at 1920px and 375px. Screenshot fixtures
are test data, not report measurements. Typecheck passed; lint has zero errors
and the existing unused `waiting` warning in `NowServingHeader.tsx`.

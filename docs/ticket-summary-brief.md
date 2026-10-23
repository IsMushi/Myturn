# Ticket status summary and loading states

Approved: user requested list rows instead of four cards, matching skeletons,
and verified real-time behavior, then instructed implementation.

## Direction

Reuse `QueueStatusCard` as a semantic description list of four borderless rows:
Now serving, Tickets waiting, Estimated wait, Service point status. Labels align
left, values right, with explanatory notes beneath values. Below 380px, values
stack under labels to preserve legibility. Keep Google Sans and existing teal,
mint, button and badge tokens; no new dependency or queue rules.

The request skeleton mirrors the actual intro, two request columns, service
choices, status rows, contact field and ticket button. Route loading and client
loading share it. Skeletons respect reduced-motion preferences.

## References

Fetched as documentation and HTML, not visually rendered competitor screens:

| Source | Pattern and fit | Exclude | Risk |
| --- | --- | --- | --- |
| https://design-system.service.gov.uk/components/summary-list/ — without actions and borders | Semantic key/value facts instead of cards | Government branding and edit links | Keep enough spacing to distinguish borderless rows |
| https://service-manual.nhs.uk/design-system/components/summary-list — without actions or borders | Supporting detail paired with each value | Patient information and NHS branding | Wrap longer values on small screens |
| https://help.waitwhile.com/en/articles/10073094-public-displays — live queue information | Preserve calls, waiting positions and service availability | Names and invented estimates | Clearly mark stale data after failures |

## Real-time contract and verification

Both service choices and selected-service facts now prefer pushed public state,
rather than leaving service-choice counts on the 30-second catalogue refresh.
SSE remains primary, with automatic three-second polling fallback and retried
stream connection. Estimates remain derived from measured service history;
without sufficient history the page says Not available. Failures preserve the
last values and label them potentially out of date.

`python tools/check-ticket-summary.py`: 23 Chromium checks passed for loading
geometry, semantic borderless rows, pushed calls/destinations/counts/status,
service-choice counts, stale warning, fallback polling, stream recovery,
unavailable estimates and six widths from 320px to 1440px. Tests use browser-only
fixtures and no office writes. Desktop and mobile screenshots were reviewed.

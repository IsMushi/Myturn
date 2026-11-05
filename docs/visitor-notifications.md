# Visitor call notifications

The contact entered on `/ticket` chooses the channel. Email addresses receive
an email through SMTP; phone numbers receive an SMS through OpenSMS. Messages
contain the ticket label and destination service point. New calls and recalls
notify only after the waiting line transaction commits. A refused call never notifies.

A call that outlives its hold is put back at the end of its service's line with
a fresh number, and the visitor is told which number replaced the one that
expired. That notice is sent after the requeue has committed, from the same
channel, and only when the ticket carried a contact.

Administrator invitations use the same SMTP transport. Password-reset links still
use the prototype's development-link flow.

## OpenSMS

Documentation: https://opensms.dev/docs and https://opensms.dev/docs/api-reference.

OpenSMS is a gateway between an HTTP request and an Android phone you own: the
API queues the message, the phone claims it and sends it from its SIM. The site
is **opensms.dev**. `opensms.io` is a different, unrelated provider; do not point
the key at it.

1. Create an OpenSMS account and an API key (`opensms_…`). Install the gateway
   app on an Android phone with a working SMS SIM, pair it, grant SMS permission,
   and keep it online with background operation allowed. Without an online
   gateway the API still accepts the job and it stays `pending`; nothing is sent.
2. Put the key in the gitignored `api/.env`:

   ```dotenv
   MYTURN_OPENSMS_API_KEY=opensms_your-private-key
   MYTURN_OPENSMS_API_URL=https://opensms.dev
   MYTURN_OPENSMS_DEVICE_ID=your-optional-gateway-id
   MYTURN_SMS_COUNTRY_CODE=250
   ```

   Omit the device ID to use any online gateway. Enter foreign visitor numbers
   with `+` and the country code. Rwanda local numbers such as `0788 123 456`
   are normalized to `+250788123456`.
3. Restart the API. A call posts `{to, message, deviceId?}` as JSON to
   `POST https://opensms.dev/api/v1/messages` with `Authorization: Bearer …`,
   and logs the returned job id. A job moves `pending` → `processing` → `sent`
   (or `failed`); `GET /api/v1/messages/{id}` reads it.

Provider acceptance is not delivery. A `sent` status means the phone reported
the message leaving the device; only the recipient confirming receipt makes the
channel verified. Do not copy real keys into `.env.example`, browser code,
screenshots, reports or Git. Rotate any key that has been published.

## Email

Use an authorized sender and your provider's SMTP settings in `api/.env`:

```dotenv
MYTURN_SMTP_HOST=smtp.your-provider.example
MYTURN_SMTP_PORT=587
MYTURN_SMTP_SECURITY=starttls
MYTURN_SMTP_USERNAME=your-smtp-username
MYTURN_SMTP_PASSWORD=your-private-smtp-password
MYTURN_SMTP_FROM=queue@your-verified-domain.example
```

For implicit TLS, use `MYTURN_SMTP_SECURITY=ssl` and the provider's port (usually
465). Certificate validation stays enabled; plain unencrypted SMTP is not
supported. Some providers require an app password rather than the account
password. Restart the API after changing settings.

Addresses at the reserved documentation and test domains (`example.com`,
`example.net`, `example.org`, `.test`, `.invalid`, `localhost`) are never handed
to SMTP. They cannot receive mail, so the transport reports them as not queued.
This also keeps the live smoke test from sending an invitation.

## Administrator invitations

`POST /api/auth/invitations` commits the invitation first, then schedules an email
to the address. The registration link is built from `MYTURN_WEB_URL` (default
`http://localhost:3000`) and carries a single-use token. Set it to the public web
app address whenever the app is not on localhost.

The response always carries `register_url` and `register_path` so the
administrator can copy the link if mail is unavailable. `email_queued` means the
daemon thread was started; it never means the provider accepted the message or
that the recipient received it. A refused or failed send does not remove the
invitation.

## Demonstrating without a provider

Between them, OpenSMS and SMTP need a paired phone and an authorized sender. When
neither is configured, a call can still be followed end to end:

```dotenv
MYTURN_NOTIFY_DEV_SINK=1
```

Every call and recall then appends one JSON line to `data/notifications.log`
(`MYTURN_NOTIFY_SINK_FILE` moves it) and one `INFO` line to the server log. The
line carries the channel, the ticket, the desk, the message, the recipient
masked to `v***@example.test` or `***456`, and — deliberately — `"delivered":
false` with the note `development record: no provider configured, nothing was
sent`. Nothing leaves the machine.

The sink is off by default and only records for a channel that is **not**
configured: when `MYTURN_SMTP_HOST` or `MYTURN_OPENSMS_API_KEY` is set, that
channel is used and the record is not written, so a successful send can never
also produce a "nothing was sent" line. It is a way to watch the flow, not a
transport, and it must not be presented as delivery.

## Verification and limits

`api/.venv/Scripts/python.exe api/check_notifications.py` runs twenty-two
automated checks with mocked transports and a disposable database. It sends no
real messages. It covers OpenSMS request/authentication, E.164 normalization,
missing configuration, HTTP failures, SMTP TLS/login/content, header injection,
invitation recipient/subject/link/expiry/inviter content, missing-SMTP fallback,
email scheduling failure without rollback or token logging, resend replacing the
old link while keeping its desk, channel selection,
real Flask call/recall paths, the requeue notice after the hold ends (both the
background sweep and the staff-triggered path), failure containment, and the
development record above (written when asked for, silent when a provider sent,
off by default, contact never written whole).

For actual delivery, use an approved test phone/email address. For an invitation,
use an approved address and confirm the registration email arrives. For a visitor
call, take a ticket, then call it from the staff page and verify the matching
ticket and service point in the received message. For OpenSMS, inspect the logged
job id and its status in the OpenSMS dashboard (or `GET /api/v1/messages/{id}`).
SMTP acceptance alone does not prove inbox delivery; check the mailbox and spam
folder. Test recall as well.

Background workers are best effort, not a persistent message queue. Process
shutdown can lose a pending attempt. Provider failures/timeouts are logged
without contact details or credentials and are not automatically retried,
because acceptance may already have occurred. OpenSMS acceptance and SMTP
acceptance are never reported as confirmed delivery. Missing configuration
disables that channel and produces a server warning, not a false success.

Live delivery remains unverified until credentials, the paired phone, the SMTP
sender and approved test recipients are supplied and tested.

# Visitor call notifications

The contact entered on `/ticket` chooses the channel. Email addresses receive
an email through SMTP; phone numbers receive an SMS through TextBee. Messages
contain the ticket label and destination service point. New calls and recalls
notify only after the queue transaction commits. A refused call never notifies.

This is separate from administrator invitations and password-reset links; those
retain the prototype's existing development-link flow.

## TextBee

Documentation: https://textbee.dev/docs/sending-sms/sending-sms and
https://textbee.dev/docs/getting-started/api-keys.

1. Create and verify a TextBee account. Install its app on an Android phone with
   a working SMS SIM; pair the phone and grant SMS permissions. Keep it online
   and allow background operation. Carrier/SIM charges and provider limits apply.
2. Create an API key and place it in the gitignored `api/.env`:

   ```dotenv
   MYTURN_TEXTBEE_API_KEY=your-private-key
   MYTURN_TEXTBEE_DEVICE_ID=your-optional-device-id
   MYTURN_SMS_COUNTRY_CODE=250
   ```

   Omit the device ID to use TextBee's default enabled device. Enter foreign
   visitor numbers with `+` and the country code. Rwanda local numbers such as
   `0788 123 456` are normalized to `+250788123456`.
3. Restart the API. Calls use
   `POST https://api.textbee.dev/api/v1/gateway/send-sms`, an `x-api-key` header,
   and `{recipients: [...], message: ..., deviceId?: ...}` JSON.

The old openSMS key is not a TextBee key and is no longer used. Do not copy real
keys into `.env.example`, browser code, screenshots, reports or Git. Rotate any
key that has been published in an example or committed.

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

## Verification and limits

`api/.venv/Scripts/python.exe api/check_notifications.py` runs twelve automated
checks with mocked transports and a disposable database. It sends no real
messages. It covers TextBee request/authentication, E.164 normalization, missing
configuration, HTTP failures, SMTP TLS/login/content, header injection, channel
selection, real Flask call/recall paths and failure containment.

For actual delivery, use an approved test phone/email address, take its ticket,
then call it from the staff page. Verify the matching ticket and service point
in the received message. For TextBee, inspect the logged batch ID and its status
in the TextBee dashboard. SMTP acceptance alone does not prove inbox delivery;
check the mailbox and spam folder. Test recall as well.

Background workers are best effort, not a persistent message queue. Process
shutdown can lose a pending attempt. Provider failures/timeouts are logged
without contact details or credentials and are not automatically retried,
because acceptance may already have occurred. TextBee acceptance and SMTP
acceptance are never reported as confirmed delivery. Missing configuration
disables that channel and produces a server warning, not a false success.

Live delivery remains unverified until credentials, the paired phone, the SMTP
sender and approved test recipients are supplied and tested.

# Adminak

**Your self-hosted personal intelligence console.** Adminak connects to your mailboxes and scans them continuously. It turns the mail into structured information: subscriptions, bills, money, career, travel, orders, security and the people writing to you. It raises alerts when something needs you, and keeps you posted by email, push, Slack, Telegram and more.

Adminak runs on your own server. Your mail is read only, analysed locally by a built-in engine (no AI required), and stored in a single SQLite file you control.

---

## What it does

| Area | What Adminak tracks |
| --- | --- |
| **Subscriptions** | Every recurring charge rebuilt from receipts and renewal notices: price, cycle, next renewal, payment method, total spent and price history. It flags price increases, trials about to convert, failed payments, overlapping services ("2 video streaming subscriptions") and annual-plan savings. |
| **Bills** | Card statements, utilities, phone, internet and insurance, with the amount due, minimum due, due date and autopay status. Payment confirmations mark bills paid. Overdue bills escalate. |
| **Money** | Transactions from receipts and bank alerts, spending by month and category, top merchants, income, fraud and low-balance alerts, refunds, tax documents and statements. |
| **Career** | A pipeline by company: applied → in review → assessment → interviewing → offer or closed. Recruiter outreach and interview times are included. |
| **Travel** | Flights, stays, rentals and rides, with confirmation numbers, check-in reminders and itinerary changes. |
| **Orders** | Shipments, deliveries, delays and returns, with tracking links. |
| **Security** | New sign-ins, password and 2FA changes, breach notices and suspicious activity. Verification codes are redacted before storage. |
| **People & events** | Invitations, tickets, reservations, appointments and real humans who wrote to you. |

You also get:

- **Alerts:** about 45 alert types with severities, snooze, bulk actions and reminders ahead of renewals, trials, bills, trips and interviews.
- **Your personal email, kept up to date:**
  - Instant alerts, with quiet hours.
  - A daily brief, plus weekly and monthly reports.
  - Mobile-first HTML email templates that work in dark mode. Every template also has a plain-text version.
- **A mobile-first dashboard:** an installable PWA with a bottom tab bar, bottom sheets and push notifications. It also has a ⌘K command palette, light and dark themes, and an accessible table view for every chart.
- **Timeline and calendar:** a private ICS feed for Apple, Google or Outlook Calendar, with reminders.
- **Rules:** custom alerts, auto-filing and ignore lists, with a "test against my inbox" preview.
- **Inbox intelligence:** full-text search over every scanned email. Each email shows *why* it was classified, and you can teach Adminak when it's wrong. There's also a declutter view for noisy senders.
- **Automations:** authenticated webhooks to trigger scans, push emails in, read a summary or send the brief. These work from cron, Zapier, Make, n8n, Apple Shortcuts or Home Assistant.
- **Optional Claude AI:**
  - Double-checks emails the built-in engine is unsure about.
  - Writes your daily briefing in plain language.
  - Answers questions in **Ask Adminak**, citing source emails.

---

## Quick start (local)

Requires **Node.js 22+**.

```bash
cd adminak
npm install
cp .env.example .env          # optional, every value has a default
npm run build
npm start                     # http://localhost:8787
```

When the server starts for the first time, it prints a **one-time setup code**. Open `http://localhost:8787/setup` and enter that code. Then create your owner account and the address your alerts should go to.

Then either connect a mailbox (**Mailboxes → Connect**) or click **Load demo inbox**. The demo loads about 100 realistic sample emails so you can explore every screen first.

During development, run `npm run dev`. It starts the API with reload on port 8787 and the Vite dev server on 5173, which proxies the API.

---

## Deploy

Adminak is a single Node process plus one data directory. Put it somewhere always-on, so it can keep scanning and send scheduled emails. Use HTTPS, so cookies are `Secure` and push notifications work.

### Docker / Docker Compose

```bash
cd adminak
cp .env.example .env   # set APP_URL, ADMIN_EMAIL/ADMIN_PASSWORD, SMTP_* …
docker compose up -d
```

The image runs as a non-root user and keeps all state in `/data`. Compose mounts that as a named volume. It also has a health check on `/healthz`.

### Railway

1. Create a service from this repository and set **Root Directory** to `adminak`. `railway.json` makes it build from the Dockerfile.
2. Add a **volume** mounted at `/data`. Without one, data resets on every deploy.
3. Generate a domain and set the variables:
   - `APP_URL=https://<your-domain>`
   - `TRUST_PROXY=true`
   - `APP_SECRET`
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD`
   - `NOTIFY_EMAIL`
   - `SMTP_*`
   - optionally `GOOGLE_*` and `ANTHROPIC_API_KEY`

Fly.io, Render and any VPS work the same way: Dockerfile, a persistent volume at `/data`, and `TRUST_PROXY=true` behind a proxy.

> **Back up `/data`.** It contains `adminak.db` and, if you didn't set `APP_SECRET`, the generated `secret.key` that encrypts your mailbox credentials.

---

## Configuration

All configuration is through environment variables (see [`.env.example`](.env.example)). Everything else is configured in the app under **Settings** and **Notifications**.

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public URL. Used in email links, the OAuth redirect and the CSRF origin check. |
| `PORT` / `HOST` | Listen address (default `0.0.0.0:8787`). |
| `DATA_DIR` | Where the database, keys and email outbox live (default `./data`; `/data` in Docker). |
| `APP_SECRET` | 32+ random characters used to encrypt stored credentials. Auto-generated if unset. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Create the owner on first boot instead of using the setup code. |
| `TRUST_PROXY` | `true` behind Railway, Fly, Render, Nginx or Cloudflare, so client IPs are correct. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Enable one-click Gmail. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Outgoing email. |
| `NOTIFY_EMAIL` | Default address for alerts and reports. |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | Optional Claude features (default model `claude-opus-5-5`). |
| `SYNC_INTERVAL_MINUTES` | Default scan interval (also editable in Settings). |

---

## Connecting mail

### Gmail, one click (Gmail API)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and **enable the Gmail API**.
2. Configure the **OAuth consent screen**: External, with your own email as a test user.
3. Create an **OAuth client ID** of type *Web application*, with this authorized redirect URI:
   `https://<your APP_URL>/api/accounts/google/callback`
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and restart. Then go to **Mailboxes → Connect → Gmail**.

On the Google screen you can choose to let Adminak:

- **send** your alerts from that Gmail (`gmail.send`), so no SMTP is needed;
- **label** classified mail in Gmail (`gmail.modify`), with labels like `Adminak/Subscriptions`.

Otherwise it uses read-only access.

> **Important:** while the consent screen's publishing status is **Testing**, Google expires refresh tokens after **7 days**. Gmail would then disconnect every week. For personal use, set the status to **In production**. You'll see a "Google hasn't verified this app" warning when connecting. Choose *Advanced → continue*. Verification is only needed if you share the app with more than 100 users.

Adminak syncs incrementally through the Gmail History API, so only new mail is fetched each time. On first connect it imports your history (default 120 days, configurable).

### iCloud, Outlook, Yahoo, Fastmail, Zoho, Proton Bridge, any IMAP

Go to **Mailboxes → Connect → iCloud · Outlook · IMAP**, pick your provider and paste an **app password**. Each preset includes instructions for creating one. Gmail also works over IMAP with an app password if you'd rather not create a Google Cloud project. **Test** checks the connection and lists your folders before you connect.

### Anything else: the automation inbox

POST emails to `/api/hooks/ingest`, as JSON or as raw `message/rfc822`. For example, a Gmail filter that forwards to a Zapier or Make webhook can feed Adminak from any account.

---

## Getting updates in your personal email

**Notifications → Channels** starts with your personal email.

- **SMTP:** set `SMTP_*`. Works with Gmail (app password, `smtp.gmail.com:465`), iCloud (`smtp.mail.me.com:587`, `SMTP_SECURE=false`), Fastmail, Resend, Postmark, SES or SendGrid.
- **Gmail API:** connect a Gmail mailbox with "Send my alerts" checked.
- **Neither?** Emails are saved to `DATA_DIR/outbox/` so nothing is lost. The Notifications page shows a warning until delivery is set up.

Other channels:

- **Web push:** use "Enable push on this device". On iPhone, add Adminak to your Home Screen first.
- **ntfy**, **Slack**, **Discord** and **Telegram**.
- **Signed webhooks:** each request carries an `X-Adminak-Signature: sha256=<HMAC>` header.

For each channel you can choose:

- the minimum severity for instant alerts;
- whether it gets the daily brief, weekly report, monthly report and system messages.

Under **Schedule** you set:

- quiet hours (critical alerts still come through);
- the times of the daily brief, the weekly review (pick the day) and the monthly report;
- how many days ahead to remind you about renewals, trials and bills;
- the large-transaction threshold.

**Alert types** lets you turn any of the ~45 alert types off or change their severity. **Emails** previews every template with sample data on phone and desktop widths, plus its plain-text version.

---

## Automations & calendar

**Mailboxes → Automations** shows your automation token. It's encrypted at rest, and you can reveal, copy or rotate it. Every hook uses `Authorization: Bearer $ADMINAK_TOKEN`:

```bash
# Trigger a scan now (add ?wait=1 to wait for results)
curl -X POST https://adminak.example.com/api/hooks/scan -H "Authorization: Bearer $ADMINAK_TOKEN"

# Push an email in
curl -X POST https://adminak.example.com/api/hooks/ingest -H "Authorization: Bearer $ADMINAK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"from":"Netflix <info@account.netflix.com>","subject":"Your membership renews soon","text":"Renews Oct 12 for $22.99."}'

# Summary JSON for widgets and dashboards
curl https://adminak.example.com/api/hooks/summary -H "Authorization: Bearer $ADMINAK_TOKEN"

# Send the daily brief now
curl -X POST https://adminak.example.com/api/hooks/digest -H "Authorization: Bearer $ADMINAK_TOKEN"
```

**Timeline → Put this in your calendar** subscribes Apple, Google or Outlook Calendar to a private ICS feed. The feed covers renewals, bills, flights, stays, interviews, deadlines and deliveries, each with alarms.

---

## AI (optional)

Set `ANTHROPIC_API_KEY` to turn on Claude features (see Settings → AI):

- **Smart review:** emails the built-in engine is unsure about get a second opinion. You can also choose "all important emails". A daily call limit keeps costs predictable.
- **Briefing:** a plain-language summary on the dashboard and in the daily brief.
- **Ask Adminak:** questions like "which subscriptions went up in price?" or "when is my next flight?", answered with cited emails.

For each email Claude reviews, Adminak sends the sender, subject and up to about 8,000 characters of text. Verification codes are already redacted at that point. Without a key, everything still works: briefings are rule-based and Ask uses full-text search.

---

## Security model

Adminak can see your mail, so it's built to be locked down:

- **One owner account.** Passwords are hashed with scrypt. Sessions are server-side with HttpOnly, SameSite cookies. You can review and revoke sessions.
- **TOTP two-factor sign-in** with one-time recovery codes. You also get emailed when a sign-in comes from a new IP.
- **Encryption at rest:** mailbox passwords, OAuth tokens, channel secrets and automation tokens use AES-256-GCM.
- **CSRF protection:** a required custom header plus an Origin check.
- **Strict headers:** a strict Content-Security-Policy, HSTS over HTTPS, and `frame-ancestors 'none'`.
- **Rate limiting** on sign-in, hooks and the calendar feed.
- **CSV exports are escaped** against formula injection.
- **Untrusted content stays data:** email content is never rendered as HTML in the dashboard. AI prompts treat email text as untrusted data.
- **Audit log** of sign-ins, connections, exports and settings changes.

Recovery uses the server CLI:

```bash
npm run cli -- reset-password   # prompts for a new owner password and signs out all sessions
npm run cli -- disable-2fa
npm run cli -- setup-code       # new one-time setup code (before an owner exists)
```

In Docker, run the built CLI instead: `docker compose exec -it adminak node dist/server/cli.js reset-password`.

---

## Your data

- **Settings → Data:** export everything as JSON, or individual CSVs for subscriptions, transactions, bills, alerts, emails and insights. You can also delete stored email text, or all analysed data.
- **Settings → General:** choose whether to keep email text at all, and for how long (extracted facts are kept). You can also list senders to never analyse.
- **Disconnecting a mailbox** deletes its emails and everything derived from them.

---

## How it works

```
mailboxes ──► ingest (Gmail API · IMAP · webhook) ──► analyze (classify + extract) ──► materialize
                                                                                         │
             subscriptions · bills · charges · insights · alerts ◄───────────────────────┘
                                           │
        scheduler ──► reminders · dispatch (email/push/…) · digests/reports · AI review · retention
                                           │
                     React PWA dashboard ◄─┴─► REST API (Hono) · ICS feed · automation hooks
```

- **Server:** Node 22, Hono, better-sqlite3 (WAL with FTS5 search) and Zod. Database changes ship as versioned migrations.
- **Analysis engine:**
  - About 230 known vendors and an explainable weighted classifier (15 categories, ~60 subtypes).
  - Extractors for money in several currencies, dates (time-zone and DST safe), billing cycles, plans, payment methods, orders and tracking, travel and career details.
  - Subscriptions are rebuilt from their events no matter what order the emails arrive in. Your edits always win.
- **Web:** React 19, React Router, TanStack Query and Tailwind v4, installable as a PWA with a service worker for push.

```bash
npm run typecheck   # server + web
npm test            # analyzer fixtures + API end-to-end tests
npm run build       # web → dist/web, server → dist/server
```

---

## Troubleshooting

- **No emails are arriving.** Notifications shows whether delivery uses SMTP, the Gmail API or the local outbox. Use **Test** on a channel and check **Log**.
- **Gmail disconnects every week.** Your OAuth consent screen is still in *Testing*. Publish it (see above).
- **IMAP "authentication failed".** Use an app password, not your main password, and make sure IMAP is enabled with your provider.
- **Push doesn't work on iPhone.** Add Adminak to your Home Screen, open it from there, then enable push. Push requires HTTPS.
- **Wrong due dates or times.** Set your time zone in Settings → General.

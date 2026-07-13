# LocalLift Marketing — Agency Website + Backend

A complete system for running a small marketing agency for Latino-owned
small businesses:

- **Bilingual landing site** (`public/`) — Spanish at `/`, English at
  `/en.html`. Hero, services, flat pricing ($199 / $399 / $699 per month),
  process, testimonials, FAQ, floating WhatsApp button, and an accessible
  lead-capture form with plan pre-selection and a "what happens next" strip.
- **Agency backend** (`server.js` + `admin-ui/`) — a password-protected
  dashboard at `/admin` where you:
  - see **money progress**: monthly recurring revenue, total collected,
    and a 6-month revenue chart
  - manage **leads** (from the website form) and convert them into clients
  - manage **clients**: plan, monthly fee, status, goals
  - record **payments** per client
  - review **AI-generated campaigns**
- **AI agent team** (`lib/agents.js`) — four Claude agents with distinct
  roles, coordinated by an orchestrator:
  - **Sofía — Client Relations**: drafts bilingual client messages (welcome,
    monthly check-ins, payment reminders, replies) from the 💬 button on
    each client.
  - **Marco — Strategist**: brainstorms campaign angles, hooks, and cultural
    moments for the client's specific business.
  - **Lucía — Creative Director**: reviews Marco's brainstorm, kills weak
    ideas, improves the strongest one, and writes the creative brief.
  - **Valen — Creative Producer**: turns the brief into finished bilingual
    ads and a 4-week plan — and generates **real ad images with Higgsfield**
    (Soul model) when `HIGGSFIELD_API_KEY`/`HIGGSFIELD_API_SECRET` are set.

  The campaign pipeline is Marco → Lucía → Valen (+ Higgsfield) → a
  structured plan (strategy, audience, budget split, ES/EN ad copy with
  images, calendar, KPIs). With `AUTO_CAMPAIGNS=true`, every active client
  gets a fresh campaign each month automatically — no input from you.

## Run it locally

```bash
npm install
cp .env.example .env   # edit at least ADMIN_PASSWORD
npm start
# site:  http://localhost:3000
# admin: http://localhost:3000/admin
```

For auto-restart while developing: `npm run dev`

## Configuration

| Variable | What it does |
|---|---|
| `PORT` | Server port (default 3000) |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Login for `/admin`. The dashboard stays disabled until a password is set. |
| `ANTHROPIC_API_KEY` | Runs the AI team on Claude — best quality (platform.claude.com). |
| `GROQ_API_KEY` | Runs the AI team on Groq's free tier — fast, open models (console.groq.com). Set either key or both. |
| `AI_PROVIDER` | Optional: force `claude` or `groq` when both keys are set (default: Claude). |
| `HIGGSFIELD_API_KEY` / `HIGGSFIELD_API_SECRET` | Lets Valen generate real ad images (get keys at cloud.higgsfield.ai). Optional. |
| `AUTO_CAMPAIGNS` | `true` = every active client gets a monthly campaign generated automatically. |
| `SMTP_*` + `NOTIFY_EMAIL` | Email you every new lead. Works with Gmail App Passwords or any SMTP provider. |
| `STRIPE_SECRET_KEY` | Turns on online payments: the checkout page shows an "activate my plan" button and clients subscribe monthly via Stripe's hosted checkout. |
| `STRIPE_WEBHOOK_SECRET` | Lets Stripe report payments back: first payments auto-create the active client, renewals auto-record in Payments, failures alert you on Telegram. |
| `TELEGRAM_BOT_TOKEN` | Sofía answers a Telegram bot live, 24/7 (create one via @BotFather). New chatters become leads automatically. |
| `TELEGRAM_OWNER_CHAT_ID` | Optional: your Telegram chat id (send `/id` to your bot) for instant lead alerts. |
| `PUBLIC_URL` | Optional: the site's public URL, used for the Sofía Mini App button in the bot. On Render this is detected automatically (`RENDER_EXTERNAL_URL`). |

### Sofía chat app (Telegram Mini App + web chat)

`/sofia-app.html` is a branded chat app with Sofía's avatar,
quick-question chips, a **Spanish/English toggle** in the header
(remembers the choice, defaults to the visitor's language), and instant
AI replies. First contact becomes a lead and every conversation logs to
the Outbox.

It works for **everyone**, with or without Telegram:
- **Inside Telegram** every message is verified server-side against
  Telegram's `initData` signature. The bot's `/start` message and the
  first reply to any new customer show the
  **"✨ Abrir la app de Sofía"** button and tell them to press it.
- **On the web** (`https://yourlocallift.com/sofia-app.html`) the same
  app runs in any browser — no Telegram account needed. The site's
  corner hint and the contact section both link to it. Web chats are
  rate-limited per visitor and per IP.

Also set it as the bot's **menu button**: @BotFather → `/mybots` → your
bot → Bot Settings → Menu Button → set the URL to
`https://yourlocallift.com/sofia-app.html` and name it "Sofía".

### Stripe payments (monthly subscriptions)

Plan buttons lead to `/checkout.html`, a 3-step questionnaire that files a
high-intent lead. With Stripe configured, the success screen also offers
**"Activar mi plan ahora"** — a Stripe-hosted subscription checkout using
the live prices from admin Settings (no products to configure in Stripe).

Setup:
1. [stripe.com](https://stripe.com) → create an account → **Developers →
   API keys** → copy the *Secret key* into `STRIPE_SECRET_KEY`
   (use `sk_test_...` first to practice with card `4242 4242 4242 4242`).
2. **Developers → Webhooks → Add endpoint** →
   `https://yourlocallift.com/api/stripe/webhook`, events
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`
   → copy the *Signing secret* into `STRIPE_WEBHOOK_SECRET`.

What happens automatically on payment: the payer becomes an **active
client** with the right plan and fee, the payment is recorded, monthly
renewals keep recording themselves, failed charges ping you on Telegram,
and the questionnaire lead is marked converted.

Leads, clients, payments and campaigns are stored in `data/db.json` —
simple JSON, easy to back up. On hosts with ephemeral disks (some free
tiers), enable a persistent volume so data survives restarts.

## Autopilot

Five independent switches in `.env` put the agency on autopilot. Everything
the agents write shows up in **Admin → Outbox** — emailed automatically when
SMTP is configured, held as ready-to-copy drafts when not:

| Switch | What happens |
|---|---|
| `AUTO_LEAD_REPLY=true` | Sofía answers every new website lead within a minute — thanks them and sets the 48-hour expectation. |
| `AUTO_MONTHLY_CHECKINS=true` | On the 1st, Sofía checks in with every active client and asks what to feature this month. |
| `AUTO_PAYMENT_REMINDERS=true` | Clients with no payment recorded by the 7th get a friendly reminder. |
| `AUTO_CAMPAIGNS=true` | The creative team builds each active client's monthly campaign. |
| `WEEKLY_DIGEST=true` | Every Monday you get an email summary: MRR, money collected, new leads, campaigns waiting for review. |

Each automation is idempotent — it never fires twice for the same client and
period, even across restarts.

## Typical workflow

1. A business owner submits the website form (or messages you on WhatsApp).
2. The lead appears in **Admin → Leads** (and in your email inbox if SMTP
   is configured). You call them, then hit **→ Client** to convert.
3. Hit **💬 Message** and Sofía drafts the welcome message in Spanish and
   English — copy it into WhatsApp or email.
4. Hit **✨ Campaign** — Marco brainstorms, Lucía reviews and improves,
   Valen produces the ads (with Higgsfield images if configured). Review
   the draft under **AI Campaigns** and mark it approved/live.
5. Record payments as they come in; the **Dashboard** tracks your MRR and
   revenue month over month.
6. Turn on `AUTO_CAMPAIGNS=true` and step 4 happens by itself every month.

## Deploying (Render — recommended)

This repo includes a `render.yaml` blueprint, so deployment is:

1. Go to [render.com](https://render.com) → sign up with your GitHub account.
2. **New → Blueprint** → select this repository → Render reads `render.yaml`
   and sets everything up.
3. It prompts you for the secret values — at minimum set `ADMIN_PASSWORD`;
   add AI / SMTP / Higgsfield keys now or later under **Environment**.
4. Deploy. You get a live URL like `https://locallift.onrender.com`.

**Connecting your own domain:** service → **Settings → Custom Domains →
Add**. Render shows you the DNS records (an A record for `midominio.com`
and a CNAME for `www`) — paste them in your domain registrar's DNS panel.
HTTPS certificates are automatic. Propagation usually takes minutes,
occasionally up to a day.

**Data persistence:** the free plan resets `data/db.json` on redeploys and
sleep. Fine for testing; for production either upgrade to Starter and
uncomment the `disk` section in `render.yaml`, or configure SMTP so every
lead also lands in your email.

Any other Node.js host also works: Railway, Fly.io, or a VPS
(`pm2 start server.js` behind nginx/Caddy for HTTPS).

## Customizing

- **Name & branding**: search for “LocalLift” in `public/*.html` and
  `admin-ui/index.html`; colors are the `:root` variables at the top of
  `public/css/styles.css`.
- **WhatsApp button**: replace the placeholder number `15551234567` in
  both `public/index.html` and `public/en.html` with your real number
  (country code + number, no spaces).
- **Pricing**: plain HTML in the `#pricing` section of both pages, plus
  the plan dropdown in each contact form.
- **Email address**: replace `hola@yourlocallift.com` in both footers.

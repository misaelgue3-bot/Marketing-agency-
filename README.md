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

## Deploying

Any host that runs Node.js works:

- **Render / Railway / Fly.io** — connect this repo, start command
  `npm start`, add your `.env` values in their dashboard.
- **A VPS** — `git clone`, `npm install`, run with `pm2 start server.js`,
  put nginx or Caddy in front for HTTPS.

## Customizing

- **Name & branding**: search for “LocalLift” in `public/*.html` and
  `admin-ui/index.html`; colors are the `:root` variables at the top of
  `public/css/styles.css`.
- **WhatsApp button**: replace the placeholder number `15551234567` in
  both `public/index.html` and `public/en.html` with your real number
  (country code + number, no spaces).
- **Pricing**: plain HTML in the `#pricing` section of both pages, plus
  the plan dropdown in each contact form.
- **Email address**: replace `hola@locallift.example` in both footers.

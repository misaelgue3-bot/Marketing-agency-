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
- **AI campaign agents** (`lib/agents.js`) — two Claude agents (a strategist
  that brainstorms and a media planner that builds the plan) generate a
  complete monthly campaign per client: strategy, target audience, budget
  split, bilingual ad copy, a 4-week calendar, and KPIs. With
  `AUTO_CAMPAIGNS=true`, every active client gets a fresh campaign each
  month automatically — no input from you.

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
| `ANTHROPIC_API_KEY` | Enables the AI campaign agents (get one at platform.claude.com). |
| `AUTO_CAMPAIGNS` | `true` = every active client gets a monthly campaign generated automatically. |
| `SMTP_*` + `NOTIFY_EMAIL` | Email you every new lead. Works with Gmail App Passwords or any SMTP provider. |

Leads, clients, payments and campaigns are stored in `data/db.json` —
simple JSON, easy to back up. On hosts with ephemeral disks (some free
tiers), enable a persistent volume so data survives restarts.

## Typical workflow

1. A business owner submits the website form (or messages you on WhatsApp).
2. The lead appears in **Admin → Leads** (and in your email inbox if SMTP
   is configured). You call them, then hit **→ Client** to convert.
3. On the client, hit **✨ New campaign** — the AI agents brainstorm and
   deliver a full monthly plan in about a minute. Review it under
   **AI Campaigns**, tweak, and mark it approved/live.
4. Record payments as they come in; the **Dashboard** tracks your MRR and
   revenue month over month.
5. Turn on `AUTO_CAMPAIGNS=true` and step 3 happens by itself every month.

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

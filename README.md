# LocalLift Marketing — Agency Website

A complete website + backend for a small-business marketing agency:

- **Landing page** (`public/`) — hero, services, flat-rate pricing, process,
  testimonials, FAQ, and a lead-capture contact form. Fully responsive, no
  frameworks, loads fast.
- **Backend** (`server.js`) — Node.js/Express server that:
  - serves the site
  - receives contact form submissions at `POST /api/contact`
    (with validation, a spam honeypot, and rate limiting)
  - stores every lead in `data/leads.json`
  - optionally **emails you each new lead** (SMTP config in `.env`)
  - gives you a password-protected **lead dashboard at `/admin`**

## Run it locally

```bash
npm install
npm start
# open http://localhost:3000
```

For auto-restart while developing: `npm run dev`

## Configuration (optional)

Copy `.env.example` to `.env` and edit it:

| Variable | What it does |
|---|---|
| `PORT` | Server port (default 3000) |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Login for the `/admin` lead dashboard. The dashboard stays disabled until a password is set. |
| `SMTP_HOST/PORT/USER/PASS` + `NOTIFY_EMAIL` | If set, you get an email for every new lead. Works with Gmail App Passwords or any SMTP provider. |

Everything works without a `.env` — leads are still saved to `data/leads.json`.

## Viewing your leads

- Open `http://yoursite.com/admin` and log in with `ADMIN_USER`/`ADMIN_PASSWORD`.
- Download everything as JSON from `/admin/leads.json`.

## Deploying

Any host that runs Node.js works. Easy options:

- **Render / Railway / Fly.io** — connect this repo, set the start command to
  `npm start`, add your `.env` values in the dashboard. Free tiers available.
- **A VPS (DigitalOcean, Hetzner, etc.)** — `git clone`, `npm install`, run with
  a process manager like `pm2 start server.js`, and put nginx or Caddy in front
  for HTTPS.

Note: `data/leads.json` lives on the server's disk. On hosts with ephemeral
disks (some free tiers), enable a persistent volume or rely on the email
notifications so no lead is lost.

## Customizing

- **Name & branding**: search for “LocalLift” in `public/index.html` and the
  colors in `public/css/styles.css` (`:root` variables at the top).
- **Pricing**: the three plans are plain HTML in the `#pricing` section —
  edit the numbers and bullet lists directly.
- **Email address**: replace `hello@locallift.example` in the footer.

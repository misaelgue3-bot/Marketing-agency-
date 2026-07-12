# Launch checklist — yourlocallift.com

Everything needed to take this from code to a running business.
Items marked ✅ are already done.

## Phase 1 — Go live (blocking, ~30 min total)

- [ ] **Merge the code to `main`** — everything lives on the
  `claude/marketing-agency-site-jfnwfa` branch. Either merge it, or pick that
  branch manually when Render asks. *(Ask Claude: "merge to main")*
- [ ] **Create a Render account** — render.com, sign in with GitHub. *(2 min)*
- [ ] **Deploy: New → Blueprint → select this repository** — Render reads
  `render.yaml` and configures itself. *(5 min)*
- [ ] **Set `ADMIN_PASSWORD`** when Render prompts — use a strong password;
  this protects your entire dashboard. *(1 min)*
- [ ] **Add one AI key** — `GROQ_API_KEY` (free, console.groq.com) or
  `ANTHROPIC_API_KEY` (best quality, platform.claude.com). Without one, the
  agents stay off. *(5 min)*
- [ ] **Connect the domain** — Render service → Settings → Custom Domains →
  add `yourlocallift.com` and `www.yourlocallift.com`, then paste the two DNS
  records Render shows into your registrar's DNS panel. HTTPS is automatic.
  *(10 min + DNS wait)*
- [ ] **Replace the WhatsApp number** — the green button still points to the
  placeholder `15551234567` in `public/index.html` and `public/en.html`.
  *(Ask Claude with your number)*
- [ ] **Make `hola@yourlocallift.com` real** — set up free email forwarding to
  your Gmail at your domain registrar, or swap the footer address for one you
  already have. *(5 min)*

## Phase 2 — Full functionality (~30 min)

- [ ] **Email sending (SMTP)** — create a Gmail App Password
  (myaccount.google.com → Security → 2-Step Verification → App passwords) and
  set `SMTP_USER` / `SMTP_PASS` in Render. Unlocks: lead alerts to your inbox,
  auto-sent client messages, the weekly digest. *(10 min)*
- [ ] **Data persistence** — ⚠️ important: on Render's free plan the database
  file resets on redeploys. For real client data, upgrade the service to
  Starter (~$7/mo) and uncomment the `disk:` section in `render.yaml`.
  Until then, SMTP alerts are your backup. *(5 min)*
- [ ] **Higgsfield keys** — `HIGGSFIELD_API_KEY` + `HIGGSFIELD_API_SECRET`
  from cloud.higgsfield.ai so Valen generates real ad images. Optional —
  campaigns work without it. *(5 min)*
- [ ] **Turn on autopilot** — in Render → Environment, flip the switches when
  you're comfortable: `AUTO_LEAD_REPLY`, `AUTO_MONTHLY_CHECKINS`,
  `AUTO_PAYMENT_REMINDERS`, `AUTO_CAMPAIGNS`, `WEEKLY_DIGEST` → `true`.
  Start with `AUTO_LEAD_REPLY` + `WEEKLY_DIGEST`. *(2 min)*

## Phase 3 — Verify it works (~15 min)

- [ ] **End-to-end test** — open yourlocallift.com in your phone, submit the
  contact form with real info, confirm the lead appears in `/admin` → Leads
  (and in your email if SMTP is on).
- [ ] **Convert the test lead to a client**, record a test payment, check the
  dashboard chart updates. Delete the test data after.
- [ ] **Generate one campaign** — Clients → ✨ Campaign — and read what the
  team produces. This confirms your AI key works.
- [ ] **Test the WhatsApp button** from your phone.

## Phase 4 — Grow (ongoing)

- [ ] **Google Search Console** — search.google.com/search-console, verify
  yourlocallift.com, submit `https://yourlocallift.com/sitemap.xml`.
- [ ] **Payments** — start with Zelle/transfer (record in dashboard). When
  ready, create Stripe Payment Links for the three plans, or ask Claude to
  build full checkout into the site.
- [ ] **Google Business Profile for the agency itself** — practice what you
  sell.
- [ ] **First clients** — the form, WhatsApp, and Sofía are ready.

## Already done ✅

- ✅ Bilingual website (ES default, EN at /en.html), modern design, accessible
- ✅ Lead capture with spam protection and rate limiting
- ✅ Admin dashboard: money/MRR chart, leads, clients, payments, outbox
- ✅ AI team: Sofía (client messages), Marco (strategy), Lucía (creative
  direction), Valen (ads + Higgsfield images), on Claude or Groq
- ✅ Autopilot engine: lead replies, check-ins, payment reminders, campaigns,
  weekly digest — all idempotent, all logged to the Outbox
- ✅ Domain wired in: canonical URLs, hreflang, sitemap.xml, robots.txt,
  hola@yourlocallift.com in the footer
- ✅ One-click deploy blueprint (render.yaml)

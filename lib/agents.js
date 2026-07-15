/**
 * The LocalLift AI agent team.
 *
 * Four agents with distinct roles, coordinated by an orchestrator:
 *
 *   SOFÍA  — Client Relations. Talks to clients: welcome messages, monthly
 *            updates, replies to questions. Warm, bilingual, professional.
 *   MARCO  — Strategist. Brainstorms campaign angles, hooks and channel
 *            ideas grounded in the client's specific business.
 *   LUCÍA  — Creative Director. Reviews and improves Marco's brainstorm:
 *            kills weak ideas, sharpens the strong one, writes the brief.
 *   VALEN  — Creative Producer. Turns the brief into finished ads and a
 *            4-week campaign plan, with real ad images through Higgsfield.
 *
 * Runs on either provider (see lib/llm.js):
 *   - Claude: best quality; Valen calls Higgsfield through native tool use.
 *   - Groq (Llama): fast/free tier; Valen writes visual prompts in her plan
 *     and the orchestrator renders them with Higgsfield afterwards.
 *
 * Campaign pipeline: MARCO → LUCÍA → VALEN → structured plan (+ images).
 */

const crypto = require('crypto');
const llm = require('./llm');
const higgsfield = require('./higgsfield');

let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch { /* dep not installed */ }

const available = () => llm.available();

/* ============================================================
 * Shared helpers
 * ============================================================ */

function clientBrief(client) {
  return [
    `Business name: ${client.business || client.name}`,
    `Owner: ${client.name}`,
    `Industry: ${client.industry || 'small local business'}`,
    `Plan tier: ${client.plan} ($${client.monthlyFee}/month management fee)`,
    `Goals: ${client.goals || 'more local customers and repeat business'}`,
    `Notes from the account manager: ${client.notes || 'none'}`,
    `Primary audience language: ${client.language === 'en' ? 'English' : 'Spanish'} (bilingual US Latino market)`,
  ].join('\n');
}

/* ============================================================
 * SOFÍA — Client Relations agent
 * ============================================================ */

const SOFIA_SYSTEM =
  'You are Sofía, the client relations manager at LocalLift, a small marketing agency for Latino-owned ' +
  'small businesses. You write warm, clear, professional messages to clients — never salesy, never corporate. ' +
  'You write natural, native Spanish (Latin American) and natural English; neither reads as a translation of ' +
  'the other. Business owners are busy: keep messages short, concrete and friendly. Use the client\'s real ' +
  'details; never invent results, numbers or promises that were not given to you.';

const MESSAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subjectEs', 'subjectEn', 'messageEs', 'messageEn'],
  properties: {
    subjectEs: { type: 'string', description: 'Email subject line in Spanish (also fine as a WhatsApp opener)' },
    subjectEn: { type: 'string', description: 'Email subject line in English' },
    messageEs: { type: 'string', description: 'Full message in Spanish' },
    messageEn: { type: 'string', description: 'Full message in English' },
  },
};

const MESSAGE_PURPOSES = {
  welcome: 'Write a welcome message for this brand-new client: thank them for trusting us, tell them what happens in their first week (website/profile work starts now, first campaign draft within days), and how to reach us on WhatsApp anytime.',
  monthly_update: 'Write a short monthly check-in: warm greeting, remind them we are working on their marketing this month, and invite them to share anything new (promotions, new products, schedule changes) we should feature.',
  payment_reminder: 'Write a friendly, zero-pressure payment reminder for their monthly plan. Assume they simply forgot. Make it easy: mention we accept Zelle, card or transfer, and to reply with any questions.',
  reply: 'The client sent us the message included in the context below. Draft our reply.',
  custom: 'Write the message described in the context below.',
};

async function draftClientMessage(client, { purpose = 'custom', context = '' } = {}) {
  const task = MESSAGE_PURPOSES[purpose] || MESSAGE_PURPOSES.custom;
  const { json } = await llm.chat({
    system: SOFIA_SYSTEM,
    user: `Client:\n${clientBrief(client)}\n\nTask: ${task}\n\nExtra context: ${context || 'none'}`,
    maxTokens: 3000,
    schema: MESSAGE_SCHEMA,
  });
  return { agent: 'Sofía (Client Relations)', purpose, provider: llm.label(), ...json };
}

/**
 * Sofía answers a live chat (Telegram) message from a potential client.
 * history: [{ from: 'customer' | 'sofia', text }] oldest first.
 */
async function chatReply(history, { customerName = '', prices = {} } = {}) {
  const transcript = history
    .slice(-10)
    .map((m) => `${m.from === 'customer' ? (customerName || 'Customer') : 'Sofía'}: ${m.text}`)
    .join('\n');

  const { text } = await llm.chat({
    system:
      SOFIA_SYSTEM +
      ' You are chatting live (Telegram). Reply in the SAME language the customer writes in. ' +
      'Keep replies short and conversational — 1-3 sentences, like a real person typing. ' +
      `Our plans: Inicial/Starter $${prices.price1 || 199}/month, Crecimiento/Growth $${prices.price2 || 399}/month, Pro $${prices.price3 || 699}/month — all month-to-month, no long contracts. IMPORTANT: the monthly plans cover marketing and brand identity only. A WEBSITE is a separate one-time project: $${prices.priceWeb1 || 499} for a one-page site or $${prices.priceWeb2 || 899} for a full site — paid once, theirs forever. Hosting is always separate at $${prices.priceHosting || 15}/month. Never say the website is included in a plan. ` +
      'Your goal: answer questions honestly, collect what their business needs, and offer the free 20-minute call with a written plan in 48 hours. ' +
      'If they ask something you cannot know (availability, custom quotes, personal matters), say the owner will follow up personally. Never invent results or discounts.',
    user: `Chat so far:\n${transcript}\n\nWrite Sofía's next reply (plain text only, no name prefix).`,
    maxTokens: 1000,
  });
  return text.trim();
}

/* ============================================================
 * MARCO — Strategist agent
 * ============================================================ */

const MARCO_SYSTEM =
  'You are Marco, the strategist at a small agency serving Latino-owned small businesses in the US. ' +
  'You brainstorm sharp, practical, low-budget marketing ideas a small team can actually execute. ' +
  'You know the bilingual (Spanish/English) local market deeply — cultural moments, WhatsApp habits, ' +
  'how word of mouth works in these communities. Be concrete and specific to THIS business, never generic.';

async function runStrategist(brief, month) {
  const { text } = await llm.chat({
    system: MARCO_SYSTEM,
    user:
      `Brainstorm marketing campaign ideas for ${month} for this client:\n\n${brief}\n\n` +
      'Deliver: 3 distinct campaign angles (each with the customer insight behind it), the most promising ' +
      'channels for this specific business, seasonal or cultural moments in this month worth using, and ' +
      '5 ad hook ideas. Do not pick a winner — the creative director decides.',
    maxTokens: 4000,
  });
  return text;
}

/* ============================================================
 * LUCÍA — Creative Director agent (reviews & improves)
 * ============================================================ */

const LUCIA_SYSTEM =
  'You are Lucía, the creative director. You review the strategist\'s brainstorm with a sharp eye: ' +
  'you kill ideas that are generic, unrealistic for the budget, or off-brand for the client, and you make ' +
  'the strongest idea stronger — sharper insight, clearer promise, more distinctive execution. ' +
  'You are constructive but honest; your job is that only excellent work reaches the client.';

async function runCreativeDirector(brief, brainstorm) {
  const { text } = await llm.chat({
    system: LUCIA_SYSTEM,
    user:
      `Client:\n${brief}\n\nThe strategist's brainstorm:\n${brainstorm}\n\n` +
      'Review it: (1) briefly say what is weak and why, (2) pick the single strongest angle and improve it, ' +
      '(3) write a tight creative brief for the producer: the angle, the core promise, tone of voice, ' +
      'what the ads must show, and what to avoid. The brief is what the producer will build from — make it precise.',
    maxTokens: 4000,
  });
  return text;
}

/* ============================================================
 * VALEN — Creative Producer agent (makes ads; uses Higgsfield)
 * ============================================================ */

const VALEN_SYSTEM =
  'You are Valen, the creative producer. You turn a creative brief into finished, ready-to-run ads and a ' +
  '4-week campaign plan for a small business with a small budget — every dollar must work. Ad copy must be ' +
  'culturally authentic for a bilingual US Latino audience: write natural Spanish, not translated English.';

const IMAGE_TOOL = {
  name: 'generate_ad_image',
  description:
    'Generates a photorealistic ad image with the Higgsfield Soul model. Call once per distinct ad concept ' +
    '(2-3 total). Write the prompt in English as a filmmaker describing one shot, 50-80 words, covering all ' +
    'six slots: camera framing + subject + action + setting + lighting + style. Name ONE camera framing ' +
    '(e.g. "macro close-up, shallow depth of field", "locked-off wide shot", "low-angle medium shot"). ' +
    'Describe observable physics ("steam rises", "flour dust hangs in the light"), never emotions or vague ' +
    'adjectives like beautiful/nice/professional. State concrete lighting ("single warm practical light", ' +
    '"golden hour through the front window"). ' +
    'Never include text, logos or brand names in the prompt — text is added later in the ad tools.',
  input_schema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Detailed visual description of the image' },
      size: { type: 'string', enum: ['square', 'portrait', 'landscape'], description: 'square = Instagram feed, portrait = Stories/Reels, landscape = Facebook/banner' },
    },
    required: ['prompt'],
  },
};

const PRODUCER_TASK = (brief, creativeBrief, month) =>
  `Client:\n${brief}\n\nCreative director's brief:\n${creativeBrief}\n\n` +
  `Produce the ${month} campaign: 3-5 finished ads (Spanish + English versions), the audience targeting, ` +
  `a channel/budget recommendation, a 4-week calendar of actions, and KPIs. For each ad, also write a ` +
  `detailed English visual prompt for its image (subject, setting, lighting, mood, composition — no text or logos).`;

/**
 * Claude path: Valen drives Higgsfield live through native tool use.
 */
async function runProducerClaude(brief, creativeBrief, month) {
  const anthropic = new Anthropic();
  const useImages = higgsfield.available();
  const assets = [];
  const messages = [{
    role: 'user',
    content: PRODUCER_TASK(brief, creativeBrief, month) +
      (useImages ? ' Generate one image per distinct ad concept with your generate_ad_image tool before writing the final ads.' : ''),
  }];

  let response;
  for (let turn = 0; turn < 8; turn++) {
    response = await anthropic.messages.create({
      model: llm.CLAUDE_MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: VALEN_SYSTEM +
        ' When you have a generate_ad_image tool, use it to produce one image for each distinct ad concept (2-3 images total).',
      messages,
      ...(useImages ? { tools: [IMAGE_TOOL] } : {}),
    });

    if (response.stop_reason !== 'tool_use') break;

    messages.push({ role: 'assistant', content: response.content });
    const results = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      try {
        const { url, thumbUrl } = await higgsfield.generateImage(block.input.prompt, { size: block.input.size });
        assets.push({ prompt: block.input.prompt, size: block.input.size || 'square', url, thumbUrl });
        results.push({ type: 'tool_result', tool_use_id: block.id, content: `Image generated successfully. URL: ${url}` });
      } catch (err) {
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Image generation failed: ${err.message}. Continue without this image.`,
          is_error: true,
        });
      }
    }
    messages.push({ role: 'user', content: results });
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to produce this campaign. Review the client notes for problematic content.');
  }

  const draft = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { draft, assets };
}

/**
 * Provider-agnostic path (Groq, or Claude without tool round-trips):
 * Valen writes visual prompts into her draft; images are rendered afterwards.
 */
async function runProducerPlain(brief, creativeBrief, month) {
  const { text } = await llm.chat({
    system: VALEN_SYSTEM,
    user: PRODUCER_TASK(brief, creativeBrief, month),
    maxTokens: 8000,
  });
  return { draft: text, assets: [] };
}

/* ============================================================
 * Formatter — locks the campaign into a machine-readable plan
 * ============================================================ */

const CAMPAIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'objective', 'strategySummary', 'targetAudience', 'channels',
    'budgetSplit', 'ads', 'weeklyCalendar', 'kpis'],
  properties: {
    name: { type: 'string', description: 'Short, catchy campaign name' },
    objective: { type: 'string', description: 'The single main goal, in one sentence' },
    strategySummary: { type: 'string', description: '3-5 sentence plain-language summary of the strategy' },
    targetAudience: { type: 'string', description: 'Location, demographics, interests, behaviors' },
    channels: { type: 'array', items: { type: 'string' } },
    budgetSplit: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['channel', 'percent', 'rationale'],
        properties: {
          channel: { type: 'string' },
          percent: { type: 'integer', description: '0-100, all entries sum to 100' },
          rationale: { type: 'string' },
        },
      },
    },
    ads: {
      type: 'array',
      description: '3-5 finished ad variations',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['platform', 'headline', 'primaryText', 'cta', 'headlineEn', 'primaryTextEn', 'imageUrl', 'imagePrompt'],
        properties: {
          platform: { type: 'string' },
          headline: { type: 'string', description: 'Headline in Spanish' },
          primaryText: { type: 'string', description: 'Body copy in Spanish' },
          cta: { type: 'string' },
          headlineEn: { type: 'string' },
          primaryTextEn: { type: 'string' },
          imageUrl: { type: 'string', description: 'URL of the generated image for this ad, or empty string if none' },
          imagePrompt: { type: 'string', description: 'English visual prompt for this ad\'s image (50-80 words, filmmaker style: one camera framing + subject + action + setting + concrete lighting + style; observable physics, no vague adjectives, no text/logos), or empty string' },
        },
      },
    },
    weeklyCalendar: {
      type: 'array',
      description: 'Exactly 4 weeks',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['week', 'focus', 'actions'],
        properties: {
          week: { type: 'integer' },
          focus: { type: 'string' },
          actions: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    kpis: { type: 'array', items: { type: 'string' } },
  },
};

async function formatCampaign(producerDraft, assets) {
  const assetList = assets.length
    ? assets.map((a, i) => `${i + 1}. [${a.size}] ${a.url} — for: ${a.prompt.slice(0, 120)}`).join('\n')
    : 'none';

  const { json } = await llm.chat({
    system:
      'You convert a finished campaign draft into the exact JSON structure requested. Preserve the producer\'s ' +
      'copy verbatim — do not rewrite it. budgetSplit percents must sum to exactly 100 and weeklyCalendar must ' +
      'have exactly 4 weeks. Match each generated image URL to the ad it belongs to; use "" when an ad has no ' +
      'image. Copy each ad\'s visual prompt into imagePrompt ("" if none was written).',
    user: `Campaign draft:\n${producerDraft}\n\nGenerated images:\n${assetList}`,
    maxTokens: 8000,
    schema: CAMPAIGN_SCHEMA,
  });
  return json;
}

/* ============================================================
 * Orchestrator — manages the team
 * ============================================================ */

async function generateCampaign(client, { month, log = () => {} } = {}) {
  if (!available()) {
    throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY (Claude) or GROQ_API_KEY (Groq) in .env');
  }

  const campaignMonth = month || new Date().toISOString().slice(0, 7);
  const brief = clientBrief(client);
  const useClaudeTools = llm.provider() === 'claude' && Anthropic;

  log(`Marco (strategist) is brainstorming… [${llm.label()}]`);
  const brainstorm = await runStrategist(brief, campaignMonth);

  log('Lucía (creative director) is reviewing and improving…');
  const creativeBrief = await runCreativeDirector(brief, brainstorm);

  log(`Valen (creative producer) is building the ads${higgsfield.available() ? ' + Higgsfield images' : ''}…`);
  const { draft, assets } = useClaudeTools
    ? await runProducerClaude(brief, creativeBrief, campaignMonth)
    : await runProducerPlain(brief, creativeBrief, campaignMonth);

  log('Formatting the final plan…');
  const plan = await formatCampaign(draft, assets);

  // Non-tool path: render Valen's visual prompts with Higgsfield now
  if (!assets.length && higgsfield.available()) {
    let rendered = 0;
    for (const ad of plan.ads) {
      if (rendered >= 3 || !ad.imagePrompt || ad.imageUrl) continue;
      try {
        log(`Rendering ad image ${rendered + 1} with Higgsfield…`);
        const { url, thumbUrl } = await higgsfield.generateImage(ad.imagePrompt, { size: 'square' });
        ad.imageUrl = url;
        assets.push({ prompt: ad.imagePrompt, size: 'square', url, thumbUrl });
        rendered++;
      } catch (err) {
        log(`Image failed (${err.message}) — continuing without it`);
      }
    }
  }

  return {
    id: crypto.randomUUID(),
    clientId: client.id,
    month: campaignMonth,
    status: 'draft', // draft | approved | live | archived
    team: {
      strategist: 'Marco',
      creativeDirector: 'Lucía',
      producer: 'Valen',
      provider: llm.label(),
      imagesBy: assets.length ? 'Higgsfield Soul' : null,
    },
    brainstorm,
    creativeBrief,
    assets,
    plan,
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  generateCampaign,
  draftClientMessage,
  chatReply,
  available,
  imagesAvailable: () => higgsfield.available(),
  providerLabel: () => llm.label(),
};

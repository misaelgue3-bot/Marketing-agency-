/**
 * The LocalLift AI agent team.
 *
 * Four Claude agents with distinct roles, coordinated by an orchestrator:
 *
 *   SOFÍA  — Client Relations. Talks to clients: welcome messages, monthly
 *            updates, replies to questions. Warm, bilingual, professional.
 *   MARCO  — Strategist. Brainstorms campaign angles, hooks and channel
 *            ideas grounded in the client's specific business.
 *   LUCÍA  — Creative Director. Reviews and improves Marco's brainstorm:
 *            kills weak ideas, sharpens the strong one, writes the brief.
 *   VALEN  — Creative Producer. Turns the brief into finished ads and a
 *            4-week campaign plan. Can generate real ad images through
 *            Higgsfield (Soul model) using a generate_ad_image tool.
 *
 * Campaign pipeline: MARCO → LUCÍA → VALEN (+ Higgsfield) → structured plan.
 * Requires ANTHROPIC_API_KEY. Image generation additionally requires
 * HIGGSFIELD_API_KEY / HIGGSFIELD_API_SECRET.
 */

const crypto = require('crypto');
const higgsfield = require('./higgsfield');

const MODEL = 'claude-opus-4-8';

let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch { /* dep not installed */ }

function available() {
  return Boolean(Anthropic && process.env.ANTHROPIC_API_KEY);
}

/* ============================================================
 * Shared helpers
 * ============================================================ */

function textOf(response) {
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

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
  if (!available()) throw new Error('AI agents are not configured. Set ANTHROPIC_API_KEY in .env');

  const anthropic = new Anthropic();
  const task = MESSAGE_PURPOSES[purpose] || MESSAGE_PURPOSES.custom;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    thinking: { type: 'adaptive' },
    system: SOFIA_SYSTEM,
    messages: [{
      role: 'user',
      content: `Client:\n${clientBrief(client)}\n\nTask: ${task}\n\nExtra context: ${context || 'none'}`,
    }],
    output_config: { format: { type: 'json_schema', schema: MESSAGE_SCHEMA } },
  });

  if (response.stop_reason === 'refusal') throw new Error('The model declined to write this message.');
  return { agent: 'Sofía (Client Relations)', purpose, ...JSON.parse(textOf(response)) };
}

/* ============================================================
 * MARCO — Strategist agent
 * ============================================================ */

const MARCO_SYSTEM =
  'You are Marco, the strategist at a small agency serving Latino-owned small businesses in the US. ' +
  'You brainstorm sharp, practical, low-budget marketing ideas a small team can actually execute. ' +
  'You know the bilingual (Spanish/English) local market deeply — cultural moments, WhatsApp habits, ' +
  'how word of mouth works in these communities. Be concrete and specific to THIS business, never generic.';

async function runStrategist(anthropic, brief, month) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    system: MARCO_SYSTEM,
    messages: [{
      role: 'user',
      content:
        `Brainstorm marketing campaign ideas for ${month} for this client:\n\n${brief}\n\n` +
        'Deliver: 3 distinct campaign angles (each with the customer insight behind it), the most promising ' +
        'channels for this specific business, seasonal or cultural moments in this month worth using, and ' +
        '5 ad hook ideas. Do not pick a winner — the creative director decides.',
    }],
  });
  return textOf(response);
}

/* ============================================================
 * LUCÍA — Creative Director agent (reviews & improves)
 * ============================================================ */

const LUCIA_SYSTEM =
  'You are Lucía, the creative director. You review the strategist\'s brainstorm with a sharp eye: ' +
  'you kill ideas that are generic, unrealistic for the budget, or off-brand for the client, and you make ' +
  'the strongest idea stronger — sharper insight, clearer promise, more distinctive execution. ' +
  'You are constructive but honest; your job is that only excellent work reaches the client.';

async function runCreativeDirector(anthropic, brief, brainstorm) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    system: LUCIA_SYSTEM,
    messages: [{
      role: 'user',
      content:
        `Client:\n${brief}\n\nThe strategist's brainstorm:\n${brainstorm}\n\n` +
        'Review it: (1) briefly say what is weak and why, (2) pick the single strongest angle and improve it, ' +
        '(3) write a tight creative brief for the producer: the angle, the core promise, tone of voice, ' +
        'what the ads must show, and what to avoid. The brief is what the producer will build from — make it precise.',
    }],
  });
  return textOf(response);
}

/* ============================================================
 * VALEN — Creative Producer agent (makes ads; uses Higgsfield)
 * ============================================================ */

const VALEN_SYSTEM =
  'You are Valen, the creative producer. You turn a creative brief into finished, ready-to-run ads and a ' +
  '4-week campaign plan for a small business with a small budget — every dollar must work. Ad copy must be ' +
  'culturally authentic for a bilingual US Latino audience: write natural Spanish, not translated English. ' +
  'When you have a generate_ad_image tool, use it to produce one image for each distinct ad concept ' +
  '(2-3 images total): write rich, specific visual prompts — subject, setting, lighting, mood, composition — ' +
  'in English, with no text or logos in the image.';

const IMAGE_TOOL = {
  name: 'generate_ad_image',
  description:
    'Generates a photorealistic ad image with the Higgsfield Soul model. Call once per distinct ad concept ' +
    '(2-3 total). Describe subject, setting, lighting, mood and composition in English. ' +
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

async function runCreativeProducer(anthropic, brief, creativeBrief, month) {
  const useImages = higgsfield.available();
  const assets = [];
  const messages = [{
    role: 'user',
    content:
      `Client:\n${brief}\n\nCreative director's brief:\n${creativeBrief}\n\n` +
      `Produce the ${month} campaign: 3-5 finished ads (Spanish + English versions), the audience targeting, ` +
      `a channel/budget recommendation, a 4-week calendar of actions, and KPIs.` +
      (useImages
        ? ' Generate one image per distinct ad concept with your generate_ad_image tool before writing the final ads.'
        : ''),
  }];

  // Manual tool loop (stable, non-beta API surface)
  let response;
  for (let turn = 0; turn < 8; turn++) {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: VALEN_SYSTEM,
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
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Image generated successfully. URL: ${url}`,
        });
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

  return { draft: textOf(response), assets };
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
        required: ['platform', 'headline', 'primaryText', 'cta', 'headlineEn', 'primaryTextEn', 'imageUrl'],
        properties: {
          platform: { type: 'string' },
          headline: { type: 'string', description: 'Headline in Spanish' },
          primaryText: { type: 'string', description: 'Body copy in Spanish' },
          cta: { type: 'string' },
          headlineEn: { type: 'string' },
          primaryTextEn: { type: 'string' },
          imageUrl: { type: 'string', description: 'URL of the generated image for this ad, or empty string if none' },
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

async function formatCampaign(anthropic, producerDraft, assets) {
  const assetList = assets.length
    ? assets.map((a, i) => `${i + 1}. [${a.size}] ${a.url} — for: ${a.prompt.slice(0, 120)}`).join('\n')
    : 'none';

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system:
      'You convert a finished campaign draft into the exact JSON structure requested. Preserve the producer\'s ' +
      'copy verbatim — do not rewrite it. budgetSplit percents must sum to exactly 100 and weeklyCalendar must ' +
      'have exactly 4 weeks. Match each generated image URL to the ad it belongs to; use "" when an ad has no image.',
    messages: [{
      role: 'user',
      content: `Campaign draft:\n${producerDraft}\n\nGenerated images:\n${assetList}`,
    }],
    output_config: { format: { type: 'json_schema', schema: CAMPAIGN_SCHEMA } },
  });

  return JSON.parse(textOf(response));
}

/* ============================================================
 * Orchestrator — manages the team
 * ============================================================ */

async function generateCampaign(client, { month, log = () => {} } = {}) {
  if (!available()) {
    throw new Error('AI agents are not configured. Install @anthropic-ai/sdk and set ANTHROPIC_API_KEY in .env');
  }

  const anthropic = new Anthropic();
  const campaignMonth = month || new Date().toISOString().slice(0, 7);
  const brief = clientBrief(client);

  log('Marco (strategist) is brainstorming…');
  const brainstorm = await runStrategist(anthropic, brief, campaignMonth);

  log('Lucía (creative director) is reviewing and improving…');
  const creativeBrief = await runCreativeDirector(anthropic, brief, brainstorm);

  log(`Valen (creative producer) is building the ads${higgsfield.available() ? ' + Higgsfield images' : ''}…`);
  const { draft, assets } = await runCreativeProducer(anthropic, brief, creativeBrief, campaignMonth);

  log('Formatting the final plan…');
  const plan = await formatCampaign(anthropic, draft, assets);

  return {
    id: crypto.randomUUID(),
    clientId: client.id,
    month: campaignMonth,
    status: 'draft', // draft | approved | live | archived
    team: {
      strategist: 'Marco',
      creativeDirector: 'Lucía',
      producer: 'Valen',
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
  available,
  imagesAvailable: () => higgsfield.available(),
  MODEL,
};

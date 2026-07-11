/**
 * AI campaign agents.
 *
 * Two Claude agents collaborate to produce a monthly marketing campaign
 * for a client, with no human input required:
 *
 *   1. The STRATEGIST brainstorms angles, hooks and channel ideas for the
 *      client's specific business, audience and budget.
 *   2. The PLANNER turns the best ideas into a structured, ready-to-execute
 *      campaign plan (ad copy, audiences, budget split, 4-week calendar),
 *      enforced by a JSON schema so the output is always machine-readable.
 *
 * Requires ANTHROPIC_API_KEY in the environment.
 */

const MODEL = 'claude-opus-4-8';

let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch { /* dep not installed */ }

function available() {
  return Boolean(Anthropic && process.env.ANTHROPIC_API_KEY);
}

const CAMPAIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'objective', 'strategySummary', 'targetAudience', 'channels',
    'budgetSplit', 'ads', 'weeklyCalendar', 'kpis'],
  properties: {
    name: { type: 'string', description: 'Short, catchy campaign name' },
    objective: { type: 'string', description: 'The single main goal, in one sentence' },
    strategySummary: { type: 'string', description: '3-5 sentence plain-language summary of the strategy and why it fits this business' },
    targetAudience: { type: 'string', description: 'Who the campaign targets: location, demographics, interests, behaviors' },
    channels: {
      type: 'array',
      description: 'Channels used, e.g. Google Ads, Meta Ads, Instagram organic, WhatsApp, email',
      items: { type: 'string' },
    },
    budgetSplit: {
      type: 'array',
      description: 'How to divide the monthly ad budget across channels',
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
      description: '3-5 ready-to-use ad variations',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['platform', 'headline', 'primaryText', 'cta', 'headlineEn', 'primaryTextEn'],
        properties: {
          platform: { type: 'string' },
          headline: { type: 'string', description: 'Headline in Spanish' },
          primaryText: { type: 'string', description: 'Body copy in Spanish' },
          cta: { type: 'string', description: 'Call to action button text' },
          headlineEn: { type: 'string', description: 'Headline in English' },
          primaryTextEn: { type: 'string', description: 'Body copy in English' },
        },
      },
    },
    weeklyCalendar: {
      type: 'array',
      description: 'Exactly 4 weeks of planned actions',
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
    kpis: {
      type: 'array',
      description: 'How success is measured, with realistic monthly targets',
      items: { type: 'string' },
    },
  },
};

function clientBrief(client) {
  return [
    `Business name: ${client.business || client.name}`,
    `Industry: ${client.industry || 'small local business'}`,
    `Plan tier: ${client.plan} ($${client.monthlyFee}/month management fee)`,
    `Goals: ${client.goals || 'more local customers and repeat business'}`,
    `Notes from the account manager: ${client.notes || 'none'}`,
    `Primary audience language: ${client.language === 'en' ? 'English' : 'Spanish'} (bilingual US Latino market)`,
  ].join('\n');
}

/**
 * Runs the two-agent pipeline and returns a structured campaign object.
 */
async function generateCampaign(client, { month } = {}) {
  if (!available()) {
    throw new Error('AI campaigns are not configured. Install @anthropic-ai/sdk and set ANTHROPIC_API_KEY in .env');
  }

  const anthropic = new Anthropic();
  const campaignMonth = month || new Date().toISOString().slice(0, 7);
  const brief = clientBrief(client);

  // Agent 1 — the strategist brainstorms
  const brainstorm = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    system:
      'You are a senior marketing strategist at a small agency serving Latino-owned small businesses in the US. ' +
      'You brainstorm sharp, practical, low-budget marketing ideas that a small team can actually execute. ' +
      'You know the bilingual (Spanish/English) local market deeply. Be concrete, not generic.',
    messages: [{
      role: 'user',
      content:
        `Brainstorm marketing campaign ideas for the month ${campaignMonth} for this client:\n\n${brief}\n\n` +
        'Give me: 3 distinct campaign angles (with the customer insight behind each), ' +
        'the most promising channels for this specific business, seasonal or cultural moments this month worth using, ' +
        'and 5 hook ideas for ads. Then pick the single strongest angle and explain why.',
    }],
  });

  const ideas = brainstorm.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  // Agent 2 — the planner turns ideas into a structured, executable plan
  const plan = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system:
      'You are a meticulous media planner. You turn a strategist\'s brainstorm into an executable monthly ' +
      'campaign plan for a small business. Budgets are small, so every dollar must work. Ad copy must be ' +
      'culturally authentic for a bilingual US Latino audience — write natural Spanish, not translated English. ' +
      'budgetSplit percents must sum to exactly 100 and weeklyCalendar must have exactly 4 weeks.',
    messages: [{
      role: 'user',
      content:
        `Client brief:\n${brief}\n\nStrategist's brainstorm:\n${ideas}\n\n` +
        `Build the ${campaignMonth} campaign plan using the strongest angle from the brainstorm.`,
    }],
    output_config: { format: { type: 'json_schema', schema: CAMPAIGN_SCHEMA } },
  });

  if (plan.stop_reason === 'refusal') {
    throw new Error('The model declined to generate this campaign. Review the client notes for problematic content.');
  }

  const jsonText = plan.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const campaign = JSON.parse(jsonText);

  return {
    id: require('crypto').randomUUID(),
    clientId: client.id,
    month: campaignMonth,
    status: 'draft', // draft | approved | live | archived
    brainstorm: ideas,
    plan: campaign,
    createdAt: new Date().toISOString(),
  };
}

module.exports = { generateCampaign, available, MODEL };

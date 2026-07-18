/**
 * LLM provider abstraction for the agent team.
 *
 * Two providers, selected via AI_PROVIDER in .env (or auto-detected from
 * whichever API key is present):
 *
 *   claude — Anthropic Claude (best quality, native structured outputs,
 *            tool use for Higgsfield image generation). Needs ANTHROPIC_API_KEY.
 *   groq   — Groq's OpenAI-compatible API running open models like
 *            Llama 3.3 70B (very fast, generous free tier). Needs GROQ_API_KEY.
 *
 * chat({ system, user, maxTokens, schema }) returns { text } — or, when a
 * schema is given, { text, json } with the parsed structured result.
 */

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-8';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch { /* dep not installed */ }

function provider() {
  const forced = (process.env.AI_PROVIDER || '').toLowerCase();
  if (forced === 'groq') return 'groq';
  if (forced === 'claude' || forced === 'anthropic') return 'claude';
  // auto-detect: prefer Claude when both keys exist
  if (Anthropic && process.env.ANTHROPIC_API_KEY) return 'claude';
  if (process.env.GROQ_API_KEY) return 'groq';
  return null;
}

function available() {
  const p = provider();
  if (p === 'claude') return Boolean(Anthropic && process.env.ANTHROPIC_API_KEY);
  if (p === 'groq') return Boolean(process.env.GROQ_API_KEY);
  return false;
}

function label() {
  const p = provider();
  if (p === 'claude') return `Claude (${CLAUDE_MODEL})`;
  if (p === 'groq') return `Groq (${GROQ_MODEL})`;
  return 'not configured';
}

/* ---------------- Claude ---------------- */

async function chatClaude({ system, user, maxTokens = 4000, schema = null }) {
  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: user }],
    ...(schema ? { output_config: { format: { type: 'json_schema', schema } } } : {}),
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined this request. Review the input for problematic content.');
  }

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return schema ? { text, json: JSON.parse(text) } : { text };
}

/* ---------------- Groq (OpenAI-compatible) ---------------- */

async function chatGroq({ system, user, maxTokens = 4000, schema = null }) {
  const messages = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: schema
        ? `${user}\n\nRespond ONLY with a JSON object that follows this exact JSON schema (no markdown, no commentary):\n${JSON.stringify(schema)}`
        : user,
    },
  ];

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: maxTokens,
      ...(schema ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';

  if (!schema) return { text };

  try {
    return { text, json: JSON.parse(text) };
  } catch {
    // one repair attempt: models sometimes wrap JSON in fences
    const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    return { text, json: JSON.parse(stripped) };
  }
}

/* ---------------- Public API ---------------- */

async function chat(opts) {
  const p = provider();
  if (p === 'claude') return chatClaude(opts);
  if (p === 'groq') return chatGroq(opts);
  throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY (Claude) or GROQ_API_KEY (Groq) in .env');
}

module.exports = { chat, provider, available, label, CLAUDE_MODEL, GROQ_MODEL };

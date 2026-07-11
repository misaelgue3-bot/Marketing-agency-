/**
 * Higgsfield integration — AI image generation for ad creatives.
 *
 * Used as a tool by the creative agent: it writes a visual prompt for each
 * ad concept and this module renders it with Higgsfield's Soul model.
 *
 * Setup: create an API key at https://cloud.higgsfield.ai and set
 * HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET in .env
 */

let HiggsfieldClient = null;
let helpers = null;
try {
  ({ HiggsfieldClient } = require('@higgsfield/client'));
  helpers = require('@higgsfield/client'); // SoulSize/SoulQuality/BatchSize re-exported from index
} catch { /* dep not installed */ }

function available() {
  return Boolean(HiggsfieldClient && process.env.HIGGSFIELD_API_KEY && process.env.HIGGSFIELD_API_SECRET);
}

// Ad-friendly sizes mapped to Soul model presets
const SIZES = {
  square: '1536x1536',    // Instagram feed
  portrait: '1152x2048',  // Stories / Reels / TikTok
  landscape: '2048x1152', // Facebook / banner
};

/**
 * Generates one image and returns { url, thumbUrl }.
 * Throws with a readable message on failure.
 */
async function generateImage(prompt, { size = 'square' } = {}) {
  if (!available()) {
    throw new Error('Higgsfield is not configured. Set HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET in .env');
  }

  const client = new HiggsfieldClient({
    apiKey: process.env.HIGGSFIELD_API_KEY,
    apiSecret: process.env.HIGGSFIELD_API_SECRET,
    maxPollTime: 5 * 60 * 1000,
  });

  try {
    const jobSet = await client.generate('/v1/text2image/soul', {
      prompt,
      width_and_height: SIZES[size] || SIZES.square,
      quality: helpers?.SoulQuality?.HD || '1080p',
      batch_size: helpers?.BatchSize?.SINGLE || 1,
    });

    if (jobSet.isNsfw) throw new Error('Higgsfield flagged the prompt as NSFW');
    if (!jobSet.isCompleted) throw new Error('Higgsfield job did not complete in time');

    const job = jobSet.jobs.find((j) => j.results);
    if (!job) throw new Error('Higgsfield returned no results');

    return {
      url: job.results.raw?.url || job.results.min?.url,
      thumbUrl: job.results.min?.url || job.results.raw?.url,
    };
  } finally {
    if (typeof client.close === 'function') await client.close().catch(() => {});
  }
}

module.exports = { generateImage, available, SIZES };

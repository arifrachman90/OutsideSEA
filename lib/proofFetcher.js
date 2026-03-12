'use strict';

const logger = require('./logger');

/**
 * Fetch proof JSON from a URL.
 * Returns the parsed object/array; throws on network or parse errors.
 */
async function fetchProofJson(url) {
  logger.info(`Fetching proof JSON from: ${url}`);

  let fetch;
  try {
    // Node 18+ has global fetch; fall back to node-fetch
    fetch = globalThis.fetch || (await import('node-fetch')).default;
  } catch {
    throw new Error('No fetch implementation available. Run: npm install node-fetch');
  }

  let res;
  try {
    res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'nft-mint-bot/1.0' },
    });
  } catch (err) {
    throw new Error(`Network error fetching ${url}: ${err.message}`);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
  }

  let text;
  try {
    text = await res.text();
  } catch (err) {
    throw new Error(`Failed to read response body: ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse proof JSON: ${err.message}`);
  }

  logger.debug(`Proof JSON type: ${Array.isArray(data) ? 'array' : typeof data}`);
  return data;
}

module.exports = { fetchProofJson };

'use strict';

const { ethers } = require('ethers');
const logger = require('./logger');

// Known field names for each logical slot
const ADDRESS_FIELDS   = ['address', 'wallet', 'account', 'user'];
const PROOF_FIELDS     = ['proof', 'merkleProof', 'merkle_proof', 'MerkleProof'];
const AMOUNT_FIELDS    = ['amount', 'quantity', 'qty', 'maxQuantity', 'maxMint', 'allowance', 'quantityLimit'];
const INDEX_FIELDS     = ['index', 'nonce'];
const PRICE_FIELDS     = ['priceWei', 'price', 'priceInWei'];
const PHASE_FIELDS     = ['phaseId', 'phase', 'phaseID'];
const TOKEN_FIELDS     = ['tokenId', 'token'];
const NONCE_FIELDS     = ['nonce'];

function getField(obj, fields) {
  for (const f of fields) {
    if (obj[f] !== undefined) return obj[f];
  }
  return undefined;
}

/**
 * Validate that a value is a bytes32 hex string.
 */
function isBytes32(val) {
  return typeof val === 'string' && /^0x[0-9a-fA-F]{64}$/.test(val);
}

/**
 * Validate the proof array: each element must be a bytes32 hex string.
 * Throws if invalid.
 */
function validateProof(proof) {
  if (!Array.isArray(proof) || proof.length === 0) {
    throw new Error('proof field is missing or empty');
  }
  for (let i = 0; i < proof.length; i++) {
    if (!isBytes32(proof[i])) {
      throw new Error(`proof[${i}] is not a valid bytes32 hex string: ${proof[i]}`);
    }
  }
}

/**
 * Find the entry in the proof JSON that matches walletAddress (case-insensitive).
 * Supports:
 *   - Object map: { "0xABC...": { proof, ... }, ... }
 *   - Claims map: { claims: { "0xABC...": {...} } }
 *   - Merkle map: { merkleRoot, claims: {...} }
 *   - Array:      [ { address, proof, ... }, ... ]
 */
function findEntry(data, walletAddress) {
  const lowerWallet = walletAddress.toLowerCase();

  // Array of objects
  if (Array.isArray(data)) {
    return data.find(item => {
      if (typeof item !== 'object' || item === null) return false;
      const addr = getField(item, ADDRESS_FIELDS);
      return addr && addr.toLowerCase() === lowerWallet;
    }) || null;
  }

  if (typeof data !== 'object' || data === null) return null;

  // Nested claims object: { claims: { "0x...": {...} } }
  const claimsObj = data.claims || data.merkle || data.whitelist || data.allowlist;
  if (claimsObj && typeof claimsObj === 'object' && !Array.isArray(claimsObj)) {
    // Try key match first
    const match = Object.keys(claimsObj).find(k => k.toLowerCase() === lowerWallet);
    if (match) {
      const entry = claimsObj[match];
      // If entry already has address-like key, return as-is; otherwise inject wallet
      return typeof entry === 'object' ? { ...entry, _wallet: walletAddress } : null;
    }
    // Try searching inside each value for address field
    for (const val of Object.values(claimsObj)) {
      if (typeof val !== 'object' || val === null) continue;
      const addr = getField(val, ADDRESS_FIELDS);
      if (addr && addr.toLowerCase() === lowerWallet) return val;
    }
  }

  // Also try nested array formats
  if (claimsObj && Array.isArray(claimsObj)) {
    return claimsObj.find(item => {
      if (typeof item !== 'object' || item === null) return false;
      const addr = getField(item, ADDRESS_FIELDS);
      return addr && addr.toLowerCase() === lowerWallet;
    }) || null;
  }

  // Flat object map: { "0x...": { proof, ... } }
  const keyMatch = Object.keys(data).find(k => k.toLowerCase() === lowerWallet);
  if (keyMatch) {
    const entry = data[keyMatch];
    return typeof entry === 'object' ? { ...entry, _wallet: walletAddress } : null;
  }

  return null;
}

/**
 * Normalize a raw proof entry into a standard shape.
 * Returns null and logs if not found.
 */
function normalizeEntry(data, walletAddress) {
  const raw = findEntry(data, walletAddress);
  if (!raw) {
    return null;
  }

  logger.debug('Raw proof entry: ' + JSON.stringify(raw, null, 2));

  // Extract wallet
  const wallet = getField(raw, ADDRESS_FIELDS) || raw._wallet || walletAddress;

  // Extract proof
  const proof = getField(raw, PROOF_FIELDS);
  if (!proof) throw new Error('proof field not found in proof entry');
  validateProof(proof);

  // Extract numeric fields
  const rawAmount   = getField(raw, AMOUNT_FIELDS);
  const rawIndex    = getField(raw, INDEX_FIELDS);
  const rawPhase    = getField(raw, PHASE_FIELDS);
  const rawToken    = getField(raw, TOKEN_FIELDS);
  const rawPrice    = getField(raw, PRICE_FIELDS);

  // Determine specific named fields
  const allowance     = raw.allowance    !== undefined ? BigInt(raw.allowance)    : undefined;
  const quantityLimit = raw.quantityLimit !== undefined ? BigInt(raw.quantityLimit) :
                        raw.maxQuantity   !== undefined ? BigInt(raw.maxQuantity)   :
                        raw.maxMint       !== undefined ? BigInt(raw.maxMint)       : undefined;
  const amount        = raw.amount !== undefined ? BigInt(raw.amount) :
                        raw.qty    !== undefined ? BigInt(raw.qty)    : undefined;
  const quantity      = raw.quantity !== undefined ? BigInt(raw.quantity) : undefined;

  // Parse priceWei – support numeric, string, hex
  let priceWei;
  if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
    try {
      priceWei = BigInt(rawPrice);
    } catch {
      try {
        priceWei = ethers.parseEther(String(rawPrice));
      } catch {
        logger.warn(`Could not parse price field: ${rawPrice}`);
      }
    }
  }

  const normalized = {
    wallet,
    proof,
    index:         rawIndex !== undefined ? Number(rawIndex) : undefined,
    amount,
    quantity,
    quantityLimit,
    allowance,
    priceWei,
    nonce:         raw.nonce   !== undefined ? BigInt(raw.nonce)   : undefined,
    phaseId:       rawPhase    !== undefined ? BigInt(rawPhase)    : undefined,
    tokenId:       rawToken    !== undefined ? BigInt(rawToken)    : undefined,
    rawEntry:      raw,
  };

  return normalized;
}

module.exports = { normalizeEntry, findEntry, validateProof };

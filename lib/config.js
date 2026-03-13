'use strict';

require('dotenv').config();

const { ethers } = require('ethers');

function requireEnv(name) {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return val.trim();
}

function optionalEnv(name, defaultValue = '') {
  const val = process.env[name];
  return (val && val.trim() !== '') ? val.trim() : defaultValue;
}

function parseBool(val, defaultValue = false) {
  if (val === undefined || val === null || val === '') return defaultValue;
  return val.toLowerCase() === 'true' || val === '1';
}

// ── Load & validate ──────────────────────────────────────────────────────────

const RPC_URL       = requireEnv('RPC_URL');
const PRIVATE_KEY   = requireEnv('PRIVATE_KEY');
const NFT_CONTRACT  = optionalEnv('NFT_CONTRACT', '0x6392eb340C2d431E3BB9e3fc0FC579CC54690cFc');
const PROOF_URL     = optionalEnv('MERKLE_PROOF_URL', 'https://mint.froge.io/merkle/phase2.json');
const CHAIN_ID      = parseInt(optionalEnv('CHAIN_ID', '1'), 10);
const MINT_QUANTITY = parseInt(optionalEnv('MINT_QUANTITY', '1'), 10);
const DRY_RUN       = parseBool(process.env.DRY_RUN, true);
const DEBUG         = parseBool(process.env.DEBUG, false);

// ── Polling mode ─────────────────────────────────────────────────────────────
const POLL_ENABLED        = parseBool(process.env.POLL_ENABLED, false);
const POLL_INTERVAL_MS    = parseInt(optionalEnv('POLL_INTERVAL_MS', '1500'), 10);
const AUTO_SEND_ON_PASS   = parseBool(process.env.AUTO_SEND_ON_PASS, false);
const STOP_AFTER_SUCCESS  = parseBool(process.env.STOP_AFTER_SUCCESS, true);

const MAX_FEE_GWEI          = optionalEnv('MAX_FEE_GWEI');
const MAX_PRIORITY_FEE_GWEI = optionalEnv('MAX_PRIORITY_FEE_GWEI');
const GAS_LIMIT             = optionalEnv('GAS_LIMIT');
const MINT_TO               = optionalEnv('MINT_TO');
const VALUE_ETH             = optionalEnv('VALUE_ETH');

// ── Raw selector override ────────────────────────────────────────────────────
const RAW_SELECTOR   = optionalEnv('RAW_SELECTOR');      // e.g. 0x00d52478
const RAW_ARG_TYPES  = optionalEnv('RAW_ARG_TYPES');     // e.g. uint256,uint256,bytes32[]
const RAW_ARG_MODE   = optionalEnv('RAW_ARG_MODE');      // e.g. quantity,allocation,proof

// Validate NFT_CONTRACT is a valid address
if (!ethers.isAddress(NFT_CONTRACT)) {
  throw new Error(`NFT_CONTRACT is not a valid Ethereum address: ${NFT_CONTRACT}`);
}

// Validate RAW_SELECTOR format if provided
if (RAW_SELECTOR && !/^0x[0-9a-fA-F]{8}$/.test(RAW_SELECTOR)) {
  throw new Error(`RAW_SELECTOR must be a 4-byte hex selector (e.g. 0x00d52478), got: ${RAW_SELECTOR}`);
}

// Parse RAW_ARG_TYPES and RAW_ARG_MODE into arrays
const rawArgTypes = RAW_ARG_TYPES ? RAW_ARG_TYPES.split(',').map(s => s.trim()) : null;
const rawArgMode  = RAW_ARG_MODE  ? RAW_ARG_MODE.split(',').map(s => s.trim())  : null;

// Validate consistency: if selector is set, types and mode should match
if (RAW_SELECTOR) {
  if (!rawArgTypes || rawArgTypes.length === 0) {
    throw new Error('RAW_ARG_TYPES is required when RAW_SELECTOR is set.');
  }
  if (!rawArgMode || rawArgMode.length === 0) {
    throw new Error('RAW_ARG_MODE is required when RAW_SELECTOR is set.');
  }
  if (rawArgTypes.length !== rawArgMode.length) {
    throw new Error(
      `RAW_ARG_TYPES has ${rawArgTypes.length} entries but RAW_ARG_MODE has ${rawArgMode.length}. They must match.`
    );
  }
}

// Validate PRIVATE_KEY is not the placeholder
if (PRIVATE_KEY.includes('YOUR_PRIVATE_KEY') || PRIVATE_KEY === '') {
  throw new Error('PRIVATE_KEY appears to be a placeholder. Set a real private key.');
}

// Validate MINT_QUANTITY
if (!Number.isInteger(MINT_QUANTITY) || MINT_QUANTITY < 1) {
  throw new Error(`MINT_QUANTITY must be a positive integer, got: ${MINT_QUANTITY}`);
}

// Optional gas overrides
const gasConfig = {};
if (MAX_FEE_GWEI)          gasConfig.maxFeePerGas          = ethers.parseUnits(MAX_FEE_GWEI, 'gwei');
if (MAX_PRIORITY_FEE_GWEI) gasConfig.maxPriorityFeePerGas  = ethers.parseUnits(MAX_PRIORITY_FEE_GWEI, 'gwei');
if (GAS_LIMIT)             gasConfig.gasLimit               = BigInt(GAS_LIMIT);

// Parse value
let VALUE_WEI = 0n;
if (VALUE_ETH) {
  try {
    VALUE_WEI = ethers.parseEther(VALUE_ETH);
  } catch {
    throw new Error(`VALUE_ETH is not a valid ETH amount: ${VALUE_ETH}`);
  }
}

module.exports = {
  RPC_URL,
  PRIVATE_KEY,
  NFT_CONTRACT,
  PROOF_URL,
  CHAIN_ID,
  MINT_QUANTITY,
  DRY_RUN,
  DEBUG,
  gasConfig,
  VALUE_WEI,
  MINT_TO,
  VALUE_ETH,
  POLL_ENABLED,
  POLL_INTERVAL_MS,
  AUTO_SEND_ON_PASS,
  STOP_AFTER_SUCCESS,
  RAW_SELECTOR,
  rawArgTypes,
  rawArgMode,
};

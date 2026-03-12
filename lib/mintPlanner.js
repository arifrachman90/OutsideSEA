'use strict';

const { ethers } = require('ethers');
const logger = require('./logger');

/**
 * Resolve argument values for a candidate ABI based on the normalized proof
 * entry and runtime config values.
 *
 * @param {object} candidate   - Entry from CANDIDATE_ABIS
 * @param {object} normalized  - Normalized proof entry
 * @param {object} opts
 *   @param {number}  opts.mintQuantity  - from config.MINT_QUANTITY
 *   @param {string}  opts.mintTo        - from config.MINT_TO or signer address
 *   @param {bigint}  opts.valueWei      - tx value override from config
 */
function buildArgs(candidate, normalized, opts) {
  const { mintQuantity, mintTo } = opts;

  // Determine quantity
  const quantity = BigInt(
    mintQuantity > 0 ? mintQuantity :
    normalized.quantity !== undefined ? normalized.quantity :
    normalized.amount   !== undefined ? normalized.amount   : 1n
  );

  // Second uint256 for the top-priority 3-arg candidates
  // Priority: allowance > quantityLimit > amount > 1
  const secondUint = (
    normalized.allowance     !== undefined ? normalized.allowance     :
    normalized.quantityLimit !== undefined ? normalized.quantityLimit :
    normalized.amount        !== undefined ? normalized.amount        : 1n
  );

  const argMap = {};

  for (const key of candidate.argKeys) {
    switch (key) {
      case 'quantity':
        argMap[key] = quantity;
        break;
      case 'allowance':
        argMap[key] = secondUint;
        break;
      case 'a':
        argMap[key] = quantity;
        break;
      case 'b':
        argMap[key] = secondUint;
        break;
      case 'proof':
      case 'merkleProof':
        argMap[key] = normalized.proof;
        break;
      case 'to':
        argMap[key] = mintTo;
        break;
      default:
        throw new Error(
          `Unknown arg key "${key}" in candidate ${candidate.id}. ` +
          `Update candidateAbis.js or mintPlanner.js to handle this key.`
        );
    }
  }

  // Ordered arg array
  const args = candidate.argKeys.map(k => argMap[k]);
  return args;
}

/**
 * Determine tx value in wei.
 * Priority: config override > proof priceWei > 0
 */
function resolveValue(opts, normalized) {
  if (opts.valueWei && opts.valueWei > 0n) return opts.valueWei;
  if (normalized.priceWei && normalized.priceWei > 0n) return normalized.priceWei;
  return 0n;
}

/**
 * Build a plan for the raw-selector candidate (0x00d52478).
 * Uses AbiCoder directly instead of Interface/function name.
 *
 * @param {object} normalized  - Normalized proof entry
 * @param {object} opts        - { mintQuantity, mintTo, valueWei }
 * @returns {object|null}      - Plan object or null on failure
 */
function buildRawSelectorPlan(normalized, opts) {
  const RAW_SELECTOR = '0x00d52478';

  const quantity = BigInt(
    opts.mintQuantity > 0 ? opts.mintQuantity : 1
  );

  const secondValue = (
    normalized.allowance     !== undefined ? normalized.allowance     :
    normalized.quantityLimit !== undefined ? normalized.quantityLimit :
    normalized.amount        !== undefined ? normalized.amount        :
    normalized.allocation    !== undefined ? normalized.allocation    : 1n
  );

  const proof = normalized.proof;
  const value = resolveValue(opts, normalized);

  const candidate = {
    id: 0,
    priority: 'critical',
    type: 'rawSelector',
    selector: RAW_SELECTOR,
    argKeys: ['quantity', 'secondValue', 'proof'],
  };

  try {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const encodedArgs = coder.encode(
      ['uint256', 'uint256', 'bytes32[]'],
      [quantity, secondValue, proof]
    );
    const calldata = RAW_SELECTOR + encodedArgs.slice(2);

    const args = [quantity, secondValue, proof];
    const fnName = RAW_SELECTOR;

    logger.debug(
      `[Raw Selector Candidate] ${RAW_SELECTOR}` +
      ` | args: [${quantity}, ${secondValue}, [${proof.length} proofs]]` +
      ` | calldata prefix: ${calldata.slice(0, 10)}`
    );

    return { candidate, args, value, iface: null, fnName, calldata };
  } catch (err) {
    logger.warn(`Failed to build raw selector plan: ${err.message}`);
    return null;
  }
}

/**
 * Build a tx plan for each candidate.
 * Returns array of { candidate, args, value, iface, calldata }.
 */
function buildPlans(candidates, normalized, opts) {
  const plans = [];

  for (const candidate of candidates) {
    try {
      const iface = new ethers.Interface([candidate.fragment]);
      const args  = buildArgs(candidate, normalized, opts);
      const value = resolveValue(opts, normalized);

      // Encode calldata
      const fnName   = candidate.fragment.match(/function (\w+)/)[1];
      const calldata = iface.encodeFunctionData(fnName, args);

      logger.debug(
        `[Candidate ${candidate.id}] ${fnName}(${candidate.argKeys.join(', ')})` +
        ` | args: [${args.map(a => Array.isArray(a) ? `[${a.length} proofs]` : String(a)).join(', ')}]` +
        ` | calldata prefix: ${calldata.slice(0, 10)}`
      );

      plans.push({ candidate, args, value, iface, fnName, calldata });
    } catch (err) {
      logger.warn(`Failed to build plan for candidate ${candidate.id}: ${err.message}`);
    }
  }

  return plans;
}

module.exports = { buildPlans, buildRawSelectorPlan, buildArgs, resolveValue };

'use strict';

const { ethers } = require('ethers');
const logger = require('./logger');

/**
 * Attempt eth_call (staticCall) then gas estimation for one plan.
 *
 * @param {object} plan      - { candidate, fnName, iface, args, value, calldata }
 * @param {string} contract  - NFT contract address
 * @param {string} from      - Caller address
 * @param {object} provider  - ethers JsonRpcProvider
 * @returns {object}         - { ok, gasEstimate, revertReason }
 */
async function simulatePlan(plan, contract, from, provider) {
  const { candidate, fnName, iface, args, value, calldata } = plan;
  const label = `[Candidate ${candidate.id}] ${fnName}(${candidate.argKeys.join(', ')})`;

  logger.info(`Simulating ${label}`);
  logger.debug(`  calldata: ${calldata.slice(0, 74)}...`);

  const txRequest = {
    to:    contract,
    from,
    data:  calldata,
    value: value ?? 0n,
  };

  // Step 1: eth_call
  let callOk = false;
  let revertReason = null;
  try {
    const contract_ = new ethers.Contract(contract, [plan.candidate.fragment], provider);
    await contract_[fnName].staticCall(...args, {
      from,
      value: value ?? 0n,
    });
    callOk = true;
    logger.success(`  eth_call: PASS`);
  } catch (err) {
    revertReason = decodeRevert(err);
    logger.warn(`  eth_call: FAIL – ${revertReason}`);
  }

  // Step 2: estimate gas (even if call failed, attempt so we can log both)
  let gasEstimate = null;
  try {
    gasEstimate = await provider.estimateGas(txRequest);
    logger.success(`  estimateGas: ${gasEstimate.toString()}`);
    // If estimateGas passes, treat as pass even if staticCall above failed
    if (!callOk) {
      callOk = true;
      logger.info('  (eth_call reverted but estimateGas succeeded – treating as pass)');
    }
  } catch (err) {
    const gasErr = decodeRevert(err);
    if (callOk) {
      // staticCall passed but estimate failed – still viable
      logger.warn(`  estimateGas: FAIL – ${gasErr} (will use GAS_LIMIT fallback)`);
    } else {
      logger.warn(`  estimateGas: FAIL – ${gasErr}`);
    }
  }

  return { ok: callOk, gasEstimate, revertReason };
}

/**
 * Run simulation for all plans; return results annotated with ok/gasEstimate.
 */
async function simulateAll(plans, contract, from, provider) {
  const results = [];

  for (const plan of plans) {
    const { ok, gasEstimate, revertReason } = await simulatePlan(plan, contract, from, provider);
    results.push({ ...plan, ok, gasEstimate, revertReason });
  }

  return results;
}

/**
 * Decode a revert reason from an ethers error.
 */
function decodeRevert(err) {
  if (!err) return 'unknown error';

  // ethers v6 structured error
  if (err.reason)         return `revert: ${err.reason}`;
  if (err.data && err.data !== '0x') {
    try {
      // Decode as Error(string); handle both '0x' prefixed and raw hex
      const hexData = err.data.startsWith('0x') ? err.data : '0x' + err.data;
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['string'], '0x' + hexData.slice(10));
      return `revert: ${decoded[0]}`;
    } catch { /* ignore */ }
    return `revert data: ${err.data.slice(0, 42)}`;
  }
  if (err.message) return err.message.split('\n')[0].slice(0, 120);
  return 'unknown error';
}

module.exports = { simulateAll, simulatePlan, decodeRevert };

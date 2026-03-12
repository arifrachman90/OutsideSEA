'use strict';

const { ethers } = require('ethers');
const logger = require('./logger');

// Safety multiplier for gas estimation (1.3×)
const GAS_MULTIPLIER = 130n;
const GAS_DIVISOR    = 100n;

/**
 * Send a mint transaction.
 *
 * @param {object} plan         - Selected simulation result (with ok=true)
 * @param {object} signer       - ethers Signer
 * @param {string} contract     - NFT contract address
 * @param {object} gasConfig    - { maxFeePerGas, maxPriorityFeePerGas, gasLimit } (partial)
 * @param {boolean} dryRun      - If true, log but do NOT broadcast
 * @returns {object|null}       - { txHash, receipt } or null for dry run
 */
async function sendMint(plan, signer, contract, gasConfig, dryRun) {
  const { fnName, args, value, calldata, gasEstimate } = plan;

  // Determine gas limit
  let gasLimit = gasConfig.gasLimit;
  if (!gasLimit) {
    if (gasEstimate) {
      gasLimit = (gasEstimate * GAS_MULTIPLIER) / GAS_DIVISOR;
      logger.info(`Using estimated gas × 1.3: ${gasLimit.toString()}`);
    } else {
      // Hard fallback; user should set GAS_LIMIT in .env
      gasLimit = 300000n;
      logger.warn(`No gas estimate available; using fallback gasLimit=${gasLimit}`);
    }
  } else {
    logger.info(`Using configured GAS_LIMIT: ${gasLimit.toString()}`);
  }

  // Build tx overrides
  const overrides = {
    value:    value ?? 0n,
    gasLimit,
  };

  if (gasConfig.maxFeePerGas)         overrides.maxFeePerGas         = gasConfig.maxFeePerGas;
  if (gasConfig.maxPriorityFeePerGas) overrides.maxPriorityFeePerGas = gasConfig.maxPriorityFeePerGas;

  logger.section('Transaction Details');
  logger.info(`  to:         ${contract}`);
  logger.info(`  function:   ${fnName}(${plan.candidate.argKeys.join(', ')})`);
  logger.info(`  value:      ${ethers.formatEther(overrides.value)} ETH`);
  logger.info(`  gasLimit:   ${overrides.gasLimit.toString()}`);
  if (overrides.maxFeePerGas)         logger.info(`  maxFee:     ${ethers.formatUnits(overrides.maxFeePerGas, 'gwei')} gwei`);
  if (overrides.maxPriorityFeePerGas) logger.info(`  priorityFee:${ethers.formatUnits(overrides.maxPriorityFeePerGas, 'gwei')} gwei`);
  logger.debug(`  calldata:   ${calldata.slice(0, 74)}...`);

  if (dryRun) {
    logger.warn('DRY_RUN=true – transaction NOT broadcast.');
    return null;
  }

  logger.info('Broadcasting transaction...');

  const contractObj = new ethers.Contract(contract, [plan.candidate.fragment], signer);

  let tx;
  try {
    tx = await contractObj[fnName](...args, overrides);
  } catch (err) {
    throw new Error(`Transaction broadcast failed: ${err.message}`);
  }

  logger.success(`Transaction sent! Hash: ${tx.hash}`);
  logger.info('Waiting for confirmation...');

  let receipt;
  try {
    receipt = await tx.wait(1);
  } catch (err) {
    throw new Error(`Transaction failed during confirmation: ${err.message}`);
  }

  if (receipt.status === 1) {
    logger.success(`Transaction confirmed in block ${receipt.blockNumber}`);
    logger.success(`Gas used: ${receipt.gasUsed.toString()}`);
  } else {
    logger.error(`Transaction reverted in block ${receipt.blockNumber}`);
  }

  return { txHash: tx.hash, receipt };
}

module.exports = { sendMint };

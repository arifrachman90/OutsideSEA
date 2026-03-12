'use strict';

// ─── Bootstrap ───────────────────────────────────────────────────────────────
const config          = require('./lib/config');
const logger          = require('./lib/logger');

logger.setDebug(config.DEBUG);

const { ethers }         = require('ethers');
const { fetchProofJson } = require('./lib/proofFetcher');
const { normalizeEntry } = require('./lib/proofNormalizer');
const { CANDIDATE_ABIS } = require('./lib/candidateAbis');
const { buildPlans, buildRawSelectorPlan } = require('./lib/mintPlanner');
const { simulateAll }    = require('./lib/simulate');
const { sendMint }       = require('./lib/sendMint');
const {
  resolveMintTo,
  selectBestCandidate,
  printSimulationReport,
  sleep,
} = require('./lib/utils');

// ─── Shared State ────────────────────────────────────────────────────────────
let provider;
let signer;
let signerAddress;
let mintTo;
let planOpts;
let isFirstRun = true;

// ─── Setup (runs once) ──────────────────────────────────────────────────────

async function setup() {
  logger.section('NFT Mint Bot – Starting');

  // ── 1. Provider & Signer ──────────────────────────────────────────────────
  provider = new ethers.JsonRpcProvider(config.RPC_URL, config.CHAIN_ID);
  signer   = new ethers.Wallet(config.PRIVATE_KEY, provider);

  signerAddress = await signer.getAddress();

  // Verify we are on the correct chain
  const network = await provider.getNetwork();
  logger.info(`Network:       ${network.name} (chainId ${network.chainId})`);
  logger.info(`Signer:        ${signerAddress}`);
  logger.info(`Contract:      ${config.NFT_CONTRACT}`);
  logger.info(`Proof URL:     ${config.PROOF_URL}`);
  logger.info(`MINT_QUANTITY: ${config.MINT_QUANTITY}`);
  logger.info(`DRY_RUN:       ${config.DRY_RUN}`);
  if (config.VALUE_ETH) logger.info(`VALUE_ETH:     ${config.VALUE_ETH}`);
  if (config.POLL_ENABLED) {
    logger.info(`POLL_ENABLED:  true`);
    logger.info(`POLL_INTERVAL: ${config.POLL_INTERVAL_MS}ms`);
    logger.info(`AUTO_SEND:     ${config.AUTO_SEND_ON_PASS}`);
    logger.info(`STOP_AFTER_OK: ${config.STOP_AFTER_SUCCESS}`);
  }

  if (Number(network.chainId) !== config.CHAIN_ID) {
    throw new Error(
      `Chain mismatch: expected ${config.CHAIN_ID} but RPC returned ${network.chainId}`
    );
  }

  // ── Resolve Recipient ─────────────────────────────────────────────────────
  mintTo = resolveMintTo(config.MINT_TO, signerAddress);
  planOpts = {
    mintQuantity: config.MINT_QUANTITY,
    mintTo,
    valueWei: config.VALUE_WEI,
  };
}

// ─── Run Once ────────────────────────────────────────────────────────────────
// Returns { best, result } on success, or null if no candidate passed.

async function runOnce() {
  const verbose = isFirstRun;

  // ── Fetch Proof JSON ──────────────────────────────────────────────────────
  if (verbose) logger.section('Fetching Proof');
  const proofData = await fetchProofJson(config.PROOF_URL);
  if (verbose) logger.success('Proof JSON fetched successfully.');

  // ── Find & Normalize Wallet Entry ─────────────────────────────────────────
  if (verbose) logger.section('Normalizing Proof Entry');
  const normalized = normalizeEntry(proofData, signerAddress);

  if (!normalized) {
    if (verbose) {
      logger.error(`proof not found for wallet: ${signerAddress}`);
    }
    return null;
  }

  if (verbose) {
    logger.success(`Proof found for ${normalized.wallet}`);
    logger.info(`  proof length:  ${normalized.proof.length}`);
    logger.info(`  allowance:     ${normalized.allowance    !== undefined ? normalized.allowance.toString()    : 'N/A'}`);
    logger.info(`  quantityLimit: ${normalized.quantityLimit !== undefined ? normalized.quantityLimit.toString() : 'N/A'}`);
    logger.info(`  amount:        ${normalized.amount       !== undefined ? normalized.amount.toString()       : 'N/A'}`);
    logger.info(`  priceWei:      ${normalized.priceWei     !== undefined ? normalized.priceWei.toString()     : 'N/A'}`);
    logger.info(`  allocation:    ${normalized.allocation   !== undefined ? normalized.allocation.toString()   : 'N/A'}`);
    logger.info(`  index:         ${normalized.index        !== undefined ? normalized.index                   : 'N/A'}`);
    logger.info(`Mint to: ${mintTo}`);
  }

  // ── Build Mint Plans ──────────────────────────────────────────────────────
  if (verbose) logger.section('Building Candidate Plans');

  const rawPlan  = buildRawSelectorPlan(normalized, planOpts);
  const abiPlans = buildPlans(CANDIDATE_ABIS, normalized, planOpts);
  const plans    = rawPlan ? [rawPlan, ...abiPlans] : abiPlans;

  if (verbose) {
    logger.info(`Built ${plans.length} candidate plan(s) (${rawPlan ? 'including raw selector' : 'no raw selector'}).`);
  }

  // ── Simulate Each Candidate ───────────────────────────────────────────────
  if (verbose) logger.section('Simulating Candidates');
  const results = await simulateAll(plans, config.NFT_CONTRACT, signerAddress, provider);

  // ── Report & Select ───────────────────────────────────────────────────────
  if (verbose) {
    logger.section('Simulation Report');
    printSimulationReport(results);
  }

  const best = selectBestCandidate(results);

  if (!best) {
    return null;
  }

  return { best, results };
}

// ─── Run Loop (polling mode) ─────────────────────────────────────────────────

async function runLoop() {
  let cycle = 0;

  while (true) {
    cycle++;
    let outcome;

    try {
      outcome = await runOnce();
    } catch (err) {
      // Concise error on repeated cycles; full detail on first run
      if (isFirstRun) {
        logger.error(err.message || String(err));
        if (config.DEBUG) console.error(err);
      } else {
        logger.warn(`[POLL] Cycle ${cycle} error: ${(err.message || String(err)).split('\n')[0]}`);
        logger.debug(`Full error: ${err.message || String(err)}`);
      }
      isFirstRun = false;
      logger.info(`[WAIT] Error during cycle ${cycle}. Retrying in ${config.POLL_INTERVAL_MS}ms...`);
      await sleep(config.POLL_INTERVAL_MS);
      continue;
    }

    isFirstRun = false;

    if (!outcome) {
      // No candidate passed
      logger.info(`[WAIT] No candidate passed. Retrying in ${config.POLL_INTERVAL_MS}ms...`);
      await sleep(config.POLL_INTERVAL_MS);
      continue;
    }

    // ── A candidate passed! ─────────────────────────────────────────────────
    const { best } = outcome;

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║           ✅  CANDIDATE PASSED SIMULATION  ✅           ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');

    if (best.candidate.type === 'rawSelector') {
      logger.success(
        `Best candidate: [${best.candidate.id}] ${best.candidate.selector} (raw selector)`
      );
    } else {
      logger.success(
        `Best candidate: [${best.candidate.id}] ${best.fnName}(${best.candidate.argKeys.join(', ')})`
      );
    }

    if (config.DRY_RUN) {
      logger.section('Dry Run (no broadcast)');
      await sendMint(best, signer, config.NFT_CONTRACT, config.gasConfig, true);
      logger.info('Dry run complete. A valid candidate was found.');

      if (config.STOP_AFTER_SUCCESS) {
        logger.info('STOP_AFTER_SUCCESS=true – exiting.');
        return;
      }

      logger.info(`Continuing to poll in ${config.POLL_INTERVAL_MS}ms...`);
      await sleep(config.POLL_INTERVAL_MS);
      continue;
    }

    // Live mode
    if (config.AUTO_SEND_ON_PASS) {
      logger.section('Sending Transaction (AUTO_SEND_ON_PASS=true)');
      const result = await sendMint(best, signer, config.NFT_CONTRACT, config.gasConfig, false);

      if (result) {
        logger.success(`Mint complete! txHash: ${result.txHash}`);
        if (result.receipt.status === 1) {
          logger.success(`Status: SUCCESS | Block: ${result.receipt.blockNumber} | Gas used: ${result.receipt.gasUsed}`);
        } else {
          logger.error(`Status: REVERTED | Block: ${result.receipt.blockNumber}`);
        }
      }

      if (config.STOP_AFTER_SUCCESS) {
        logger.info('STOP_AFTER_SUCCESS=true – exiting after tx.');
        return;
      }

      logger.info(`Continuing to poll in ${config.POLL_INTERVAL_MS}ms...`);
      await sleep(config.POLL_INTERVAL_MS);
      continue;
    }

    // AUTO_SEND_ON_PASS=false in live mode – print and let user decide
    logger.section('Candidate Ready');
    logger.info('A valid candidate was found but AUTO_SEND_ON_PASS=false.');
    logger.info('Set AUTO_SEND_ON_PASS=true to send automatically.');

    if (config.STOP_AFTER_SUCCESS) {
      logger.info('STOP_AFTER_SUCCESS=true – exiting.');
      return;
    }

    logger.info(`Continuing to poll in ${config.POLL_INTERVAL_MS}ms...`);
    await sleep(config.POLL_INTERVAL_MS);
  }
}

// ─── Main (one-shot mode, preserved for POLL_ENABLED=false) ──────────────────

async function main() {
  await setup();

  if (config.POLL_ENABLED) {
    logger.section('Polling Mode');
    logger.info(`Polling every ${config.POLL_INTERVAL_MS}ms until a candidate passes.`);
    await runLoop();
    return;
  }

  // ── One-shot mode (original behaviour) ────────────────────────────────────
  const outcome = await runOnce();

  if (!outcome) {
    logger.error('No candidate passed simulation. Aborting.');
    logger.error('Troubleshooting tips:');
    logger.error('  1. Verify the NFT contract address is correct.');
    logger.error('  2. Check that your wallet is on the allowlist (correct proof).');
    logger.error('  3. Check that the mint window is open.');
    logger.error('  4. Try setting DEBUG=true for more detail.');
    process.exit(1);
  }

  const { best } = outcome;

  if (best.candidate.type === 'rawSelector') {
    logger.success(
      `Best candidate: [${best.candidate.id}] ${best.candidate.selector} (raw selector)`
    );
  } else {
    logger.success(
      `Best candidate: [${best.candidate.id}] ${best.fnName}(${best.candidate.argKeys.join(', ')})`
    );
  }

  // ── Send (or Dry-Run) ─────────────────────────────────────────────────────
  logger.section(config.DRY_RUN ? 'Dry Run (no broadcast)' : 'Sending Transaction');

  const result = await sendMint(best, signer, config.NFT_CONTRACT, config.gasConfig, config.DRY_RUN);

  if (config.DRY_RUN) {
    logger.info('Dry run complete. Set DRY_RUN=false to broadcast.');
  } else if (result) {
    logger.success(`Mint complete! txHash: ${result.txHash}`);
    if (result.receipt.status === 1) {
      logger.success(`Status: SUCCESS | Block: ${result.receipt.blockNumber} | Gas used: ${result.receipt.gasUsed}`);
    } else {
      logger.error(`Status: REVERTED | Block: ${result.receipt.blockNumber}`);
      process.exit(1);
    }
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────
main().catch(err => {
  logger.error(err.message || String(err));
  if (config.DEBUG) console.error(err);
  process.exit(1);
});

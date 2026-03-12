'use strict';

// ─── Bootstrap ───────────────────────────────────────────────────────────────
const config          = require('./lib/config');
const logger          = require('./lib/logger');

logger.setDebug(config.DEBUG);

const { ethers }         = require('ethers');
const { fetchProofJson } = require('./lib/proofFetcher');
const { normalizeEntry } = require('./lib/proofNormalizer');
const { CANDIDATE_ABIS } = require('./lib/candidateAbis');
const { buildPlans }     = require('./lib/mintPlanner');
const { simulateAll }    = require('./lib/simulate');
const { sendMint }       = require('./lib/sendMint');
const {
  resolveMintTo,
  selectBestCandidate,
  printSimulationReport,
} = require('./lib/utils');

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  logger.section('NFT Mint Bot – Starting');

  // ── 1. Provider & Signer ──────────────────────────────────────────────────
  const provider = new ethers.JsonRpcProvider(config.RPC_URL, config.CHAIN_ID);
  const signer   = new ethers.Wallet(config.PRIVATE_KEY, provider);

  const signerAddress = await signer.getAddress();

  // Verify we are on the correct chain
  const network = await provider.getNetwork();
  logger.info(`Network:       ${network.name} (chainId ${network.chainId})`);
  logger.info(`Signer:        ${signerAddress}`);
  logger.info(`Contract:      ${config.NFT_CONTRACT}`);
  logger.info(`Proof URL:     ${config.PROOF_URL}`);
  logger.info(`MINT_QUANTITY: ${config.MINT_QUANTITY}`);
  logger.info(`DRY_RUN:       ${config.DRY_RUN}`);
  if (config.VALUE_ETH) logger.info(`VALUE_ETH:     ${config.VALUE_ETH}`);

  if (Number(network.chainId) !== config.CHAIN_ID) {
    throw new Error(
      `Chain mismatch: expected ${config.CHAIN_ID} but RPC returned ${network.chainId}`
    );
  }

  // ── 2. Fetch Proof JSON ───────────────────────────────────────────────────
  logger.section('Fetching Proof');
  const proofData = await fetchProofJson(config.PROOF_URL);
  logger.success('Proof JSON fetched successfully.');

  // ── 3. Find & Normalize Wallet Entry ─────────────────────────────────────
  logger.section('Normalizing Proof Entry');
  const normalized = normalizeEntry(proofData, signerAddress);

  if (!normalized) {
    logger.error(`proof not found for wallet: ${signerAddress}`);
    process.exit(1);
  }

  logger.success(`Proof found for ${normalized.wallet}`);
  logger.info(`  proof length:  ${normalized.proof.length}`);
  logger.info(`  allowance:     ${normalized.allowance    !== undefined ? normalized.allowance.toString()    : 'N/A'}`);
  logger.info(`  quantityLimit: ${normalized.quantityLimit !== undefined ? normalized.quantityLimit.toString() : 'N/A'}`);
  logger.info(`  amount:        ${normalized.amount       !== undefined ? normalized.amount.toString()       : 'N/A'}`);
  logger.info(`  priceWei:      ${normalized.priceWei     !== undefined ? normalized.priceWei.toString()     : 'N/A'}`);
  logger.info(`  index:         ${normalized.index        !== undefined ? normalized.index                   : 'N/A'}`);

  // ── 4. Resolve Recipient & Value ─────────────────────────────────────────
  const mintTo = resolveMintTo(config.MINT_TO, signerAddress);
  logger.info(`Mint to: ${mintTo}`);

  // ── 5. Build Mint Plans ───────────────────────────────────────────────────
  logger.section('Building Candidate Plans');
  const plans = buildPlans(CANDIDATE_ABIS, normalized, {
    mintQuantity: config.MINT_QUANTITY,
    mintTo,
    valueWei: config.VALUE_WEI,
  });

  logger.info(`Built ${plans.length} candidate plan(s).`);

  // ── 6. Simulate Each Candidate ────────────────────────────────────────────
  logger.section('Simulating Candidates');
  const results = await simulateAll(plans, config.NFT_CONTRACT, signerAddress, provider);

  // ── 7. Report & Select ────────────────────────────────────────────────────
  logger.section('Simulation Report');
  printSimulationReport(results);

  const best = selectBestCandidate(results);

  if (!best) {
    logger.error('No candidate passed simulation. Aborting.');
    logger.error('Troubleshooting tips:');
    logger.error('  1. Verify the NFT contract address is correct.');
    logger.error('  2. Check that your wallet is on the allowlist (correct proof).');
    logger.error('  3. Check that the mint window is open.');
    logger.error('  4. Try setting DEBUG=true for more detail.');
    process.exit(1);
  }

  logger.success(
    `Best candidate: [${best.candidate.id}] ${best.fnName}(${best.candidate.argKeys.join(', ')})`
  );

  // ── 8. Send (or Dry-Run) ──────────────────────────────────────────────────
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

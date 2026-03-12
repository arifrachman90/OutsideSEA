'use strict';

const { ethers } = require('ethers');

/**
 * Truncate a hex string for display (e.g. calldata preview).
 */
function truncateHex(hex, maxLen = 42) {
  if (!hex || hex.length <= maxLen) return hex;
  return hex.slice(0, maxLen) + '...';
}

/**
 * Format BigInt as a decimal string, or 'undefined' if not present.
 */
function fmtBigInt(val) {
  if (val === undefined || val === null) return 'undefined';
  return val.toString();
}

/**
 * Resolve the mint recipient address.
 * If MINT_TO is set and valid, use it; otherwise use signer address.
 */
function resolveMintTo(mintToConfig, signerAddress) {
  if (mintToConfig && ethers.isAddress(mintToConfig)) {
    return mintToConfig;
  }
  return signerAddress;
}

/**
 * Select the best passing candidate from simulation results.
 * Rules:
 *  1. If exactly one passes, use it.
 *  2. If multiple pass, prefer the highest-priority (lowest id) one.
 *  3. If none pass, return null.
 */
function selectBestCandidate(results) {
  const passing = results.filter(r => r.ok);
  if (passing.length === 0) return null;

  // Sort by candidate.id ascending (lower id = higher priority)
  passing.sort((a, b) => a.candidate.id - b.candidate.id);
  return passing[0];
}

/**
 * Print a simulation report for all candidates.
 */
function printSimulationReport(results) {
  console.log('');
  console.log('Simulation Report:');
  console.log('─'.repeat(80));
  for (const r of results) {
    const status = r.ok ? '✓ PASS' : '✗ FAIL';
    const gas    = r.gasEstimate ? `gas≈${r.gasEstimate}` : 'gas=N/A';
    const reason = r.ok ? '' : ` | ${r.revertReason || 'unknown'}`;
    console.log(
      `  [${String(r.candidate.id).padStart(2)}] ${status} | ${gas.padEnd(18)} | ` +
      `${r.fnName}(${r.candidate.argKeys.join(', ')})${reason}`
    );
  }
  console.log('─'.repeat(80));
}

module.exports = { truncateHex, fmtBigInt, resolveMintTo, selectBestCandidate, printSimulationReport };

'use strict';

/**
 * Candidate ABI fragments listed in priority order.
 *
 * Priority rationale:
 *   The successful GTD tx (0x2d3c2991...) uses selector 0x00d52478 with
 *   3 args: uint256, uint256, bytes32[]. These candidates are tried first.
 *
 * NOTE: The GTD tx used a different proof source. The FCFS session uses
 * phase2.json and will have different proof content, but the same function shape.
 */
const CANDIDATE_ABIS = [
  // ── TOP PRIORITY: 3-arg uint256, uint256, bytes32[] ───────────────────────
  {
    id: 1,
    priority: 'high',
    fragment: 'function mint(uint256 quantity, uint256 allowance, bytes32[] proof) payable',
    argKeys: ['quantity', 'allowance', 'proof'],
  },
  {
    id: 2,
    priority: 'high',
    fragment: 'function mint(uint256 quantity, uint256 allowance, bytes32[] proof)',
    argKeys: ['quantity', 'allowance', 'proof'],
  },
  {
    id: 3,
    priority: 'high',
    fragment: 'function claim(uint256 quantity, uint256 allowance, bytes32[] proof) payable',
    argKeys: ['quantity', 'allowance', 'proof'],
  },
  {
    id: 4,
    priority: 'high',
    fragment: 'function claim(uint256 quantity, uint256 allowance, bytes32[] proof)',
    argKeys: ['quantity', 'allowance', 'proof'],
  },
  {
    id: 5,
    priority: 'high',
    fragment: 'function mint(uint256 a, uint256 b, bytes32[] proof) payable',
    argKeys: ['a', 'b', 'proof'],
  },
  {
    id: 6,
    priority: 'high',
    fragment: 'function mint(uint256 a, uint256 b, bytes32[] proof)',
    argKeys: ['a', 'b', 'proof'],
  },

  // ── SECONDARY: 2-arg quantity + bytes32[] ────────────────────────────────
  {
    id: 7,
    priority: 'medium',
    fragment: 'function mint(uint256 quantity, bytes32[] proof) payable',
    argKeys: ['quantity', 'proof'],
  },
  {
    id: 8,
    priority: 'medium',
    fragment: 'function mint(uint256 quantity, bytes32[] proof)',
    argKeys: ['quantity', 'proof'],
  },
  {
    id: 9,
    priority: 'medium',
    fragment: 'function whitelistMint(uint256 quantity, bytes32[] proof) payable',
    argKeys: ['quantity', 'proof'],
  },
  {
    id: 10,
    priority: 'medium',
    fragment: 'function whitelistMint(uint256 quantity, bytes32[] proof)',
    argKeys: ['quantity', 'proof'],
  },
  {
    id: 11,
    priority: 'medium',
    fragment: 'function allowlistMint(uint256 quantity, bytes32[] proof) payable',
    argKeys: ['quantity', 'proof'],
  },
  {
    id: 12,
    priority: 'medium',
    fragment: 'function allowlistMint(uint256 quantity, bytes32[] proof)',
    argKeys: ['quantity', 'proof'],
  },

  // ── SECONDARY: address + quantity + bytes32[] ────────────────────────────
  {
    id: 13,
    priority: 'medium',
    fragment: 'function mint(address to, uint256 quantity, bytes32[] proof) payable',
    argKeys: ['to', 'quantity', 'proof'],
  },
  {
    id: 14,
    priority: 'medium',
    fragment: 'function mint(address to, uint256 quantity, bytes32[] proof)',
    argKeys: ['to', 'quantity', 'proof'],
  },
  {
    id: 15,
    priority: 'medium',
    fragment: 'function claim(address to, uint256 quantity, bytes32[] proof) payable',
    argKeys: ['to', 'quantity', 'proof'],
  },
  {
    id: 16,
    priority: 'medium',
    fragment: 'function claim(address to, uint256 quantity, bytes32[] proof)',
    argKeys: ['to', 'quantity', 'proof'],
  },
];

module.exports = { CANDIDATE_ABIS };

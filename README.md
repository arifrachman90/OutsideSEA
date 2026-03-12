# OutsideSEA – NFT Mint Bot

A minimal Node.js CLI bot for merkle/allowlist (FCFS) NFT mints.

- **Chain:** Ethereum mainnet
- **Contract:** `0x6392eb340C2d431E3BB9e3fc0FC579CC54690cFc`
- **Proof source (FCFS):** `https://mint.froge.io/merkle/phase2.json`
- **Stack:** Node.js CommonJS, ethers v6, dotenv

> **Note on the GTD tx reference:** The successful GTD transaction
> `0x2d3c2991c4c33d2227e010b83175884c355f5e461ad0fac6a5ef75b6d4ff09f0`
> was analysed to determine the function shape (selector `0x00d52478`,
> three arguments: `uint256, uint256, bytes32[]`).
> The FCFS session uses **phase2.json** as its proof source; the proof
> content will differ from the GTD transaction but the function signature
> is expected to be the same.

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/arifrachman90/OutsideSEA.git
cd OutsideSEA
npm install
```

### 2. Configure `.env`

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values:

| Variable | Required | Description |
|---|---|---|
| `RPC_URL` | ✅ | Ethereum mainnet RPC (e.g. Infura, Alchemy, or local node) |
| `PRIVATE_KEY` | ✅ | Private key of your minting wallet (never committed) |
| `NFT_CONTRACT` | — | Contract address (defaults to `0x6392eb340C2d431E3BB9e3fc0FC579CC54690cFc`) |
| `MERKLE_PROOF_URL` | — | Proof JSON URL (defaults to phase2.json) |
| `CHAIN_ID` | — | Chain ID (defaults to `1` for mainnet) |
| `MINT_QUANTITY` | — | Tokens to mint per tx (defaults to `1`) |
| `DRY_RUN` | — | `true` = simulate only, `false` = broadcast (defaults to `true`) |
| `DEBUG` | — | Verbose output (defaults to `false`) |
| `MAX_FEE_GWEI` | — | EIP-1559 max fee per gas in Gwei |
| `MAX_PRIORITY_FEE_GWEI` | — | EIP-1559 max priority fee in Gwei |
| `GAS_LIMIT` | — | Override gas limit (auto-estimated if blank) |
| `MINT_TO` | — | Override recipient address (uses signer address if blank) |
| `VALUE_ETH` | — | Override tx value in ETH (auto-detected from proof if blank, else 0) |
| `POLL_ENABLED` | — | `true` = polling mode, `false` = one-shot (defaults to `false`) |
| `POLL_INTERVAL_MS` | — | Milliseconds between poll cycles (defaults to `1500`) |
| `AUTO_SEND_ON_PASS` | — | `true` = auto-send tx when a candidate passes (defaults to `false`) |
| `STOP_AFTER_SUCCESS` | — | `true` = stop after first success (defaults to `true`) |

### 3. Run a dry run (recommended first step)

```bash
# Make sure DRY_RUN=true in your .env (it is by default)
npm start
```

Or explicitly:

```bash
DRY_RUN=true node index.js
```

Expected output:
```
[INFO]  Network:       homestead (chainId 1)
[INFO]  Signer:        0xYourAddress
...
[OK]    Proof found for 0xYourAddress
...
[OK]    Best candidate: [1] mint(quantity, allowance, proof)
...
[WARN]  DRY_RUN=true – transaction NOT broadcast.
[INFO]  Dry run complete. Set DRY_RUN=false to broadcast.
```

### 4. Live mint

When ready to broadcast:

```bash
# In your .env, set:
#   DRY_RUN=false
#   MAX_FEE_GWEI=<your gas price>
node index.js
```

Or via environment override:

```bash
DRY_RUN=false MAX_FEE_GWEI=30 MAX_PRIORITY_FEE_GWEI=1 node index.js
```

Expected output on success:
```
[OK]    Transaction sent! Hash: 0x...
[INFO]  Waiting for confirmation...
[OK]    Transaction confirmed in block 12345678
[OK]    Gas used: 150000
[OK]    Mint complete! txHash: 0x...
[OK]    Status: SUCCESS | Block: 12345678 | Gas used: 150000
```

---

## Runtime modes

### One-shot mode (default)

When `POLL_ENABLED=false` (the default), the bot runs once: it fetches the proof, simulates all candidates, and either sends a transaction or exits. This is the original behaviour.

```bash
POLL_ENABLED=false DRY_RUN=true node index.js
```

### Polling mode – dry-run before mint opens

Set `POLL_ENABLED=true` and `DRY_RUN=true` to keep the bot running before the mint window opens. It will re-fetch the proof, rebuild candidates, and re-run simulation every `POLL_INTERVAL_MS` milliseconds. When no candidate passes it prints a single status line and retries instead of exiting.

```bash
POLL_ENABLED=true DRY_RUN=true POLL_INTERVAL_MS=1500 node index.js
```

Once a candidate passes simulation, the bot prints a success banner and – if `STOP_AFTER_SUCCESS=true` – exits. Otherwise it continues polling.

### Live mode with AUTO_SEND_ON_PASS

For fully automatic minting as soon as the contract is ready:

```bash
POLL_ENABLED=true DRY_RUN=false AUTO_SEND_ON_PASS=true STOP_AFTER_SUCCESS=true node index.js
```

The bot will poll until simulation passes, then immediately broadcast the transaction and exit after the tx result.

| Scenario | `DRY_RUN` | `POLL_ENABLED` | `AUTO_SEND_ON_PASS` | `STOP_AFTER_SUCCESS` |
|---|---|---|---|---|
| Quick test | `true` | `false` | — | — |
| Wait for mint (dry) | `true` | `true` | — | `true` |
| Auto-mint on open | `false` | `true` | `true` | `true` |
| Manual send after pass | `false` | `true` | `false` | `true` |

---

## How it works

1. **Load config** – reads `.env` and validates all values.
2. **Fetch proof** – downloads the allowlist JSON from `MERKLE_PROOF_URL`.
3. **Find wallet** – case-insensitive search across all supported JSON formats.
4. **Normalize entry** – extracts proof, allowance, price, etc. from the entry.
5. **Build candidate plans** – generates calldata for all 16 ABI candidates.
6. **Simulate** – runs `eth_call` + `estimateGas` for each candidate in order.
7. **Select best** – picks the highest-priority candidate that passes.
8. **Send (or dry-run)** – broadcasts the tx if `DRY_RUN=false`.

### ABI candidate priority

The bot tries candidates in this order (matching the GTD tx pattern):

| # | Signature | Priority |
|---|---|---|
| 1 | `mint(uint256 quantity, uint256 allowance, bytes32[] proof)` payable | ⭐ highest |
| 2 | `mint(uint256 quantity, uint256 allowance, bytes32[] proof)` | ⭐ |
| 3 | `claim(uint256 quantity, uint256 allowance, bytes32[] proof)` payable | ⭐ |
| 4 | `claim(uint256 quantity, uint256 allowance, bytes32[] proof)` | ⭐ |
| 5-6 | `mint(uint256 a, uint256 b, bytes32[] proof)` | ⭐ |
| 7-12 | `mint/whitelistMint/allowlistMint(uint256, bytes32[])` | medium |
| 13-16 | `mint/claim(address, uint256, bytes32[])` | medium |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `Missing required env var: RPC_URL` | Check your `.env` file has `RPC_URL` set |
| `proof not found for wallet` | Your wallet is not on the allowlist for phase2 |
| `No candidate passed simulation` | Mint may not be open yet, or the contract uses a different function shape |
| `Chain mismatch` | Ensure `RPC_URL` points to Ethereum mainnet and `CHAIN_ID=1` |
| All candidates fail with `execution reverted` | Check mint window timing and allowance values |
| `HTTP 403 / 404` on proof URL | The proof endpoint may be temporarily unavailable |

Enable `DEBUG=true` for detailed calldata and simulation output.

---

## Security

- **Never** commit your `.env` file or share your `PRIVATE_KEY`.
- The bot will refuse to start if `PRIVATE_KEY` looks like a placeholder.
- `DRY_RUN=true` is the default – always verify with a dry run first.

---

## Project structure

```
OutsideSEA/
├── index.js              # Main entry point
├── lib/
│   ├── config.js         # Load & validate environment variables
│   ├── logger.js         # Logging helpers
│   ├── proofFetcher.js   # Fetch proof JSON from URL
│   ├── proofNormalizer.js# Parse & normalize proof entry
│   ├── candidateAbis.js  # ABI candidate list (ordered by priority)
│   ├── mintPlanner.js    # Build tx args for each candidate
│   ├── simulate.js       # eth_call + estimateGas simulation
│   ├── sendMint.js       # Broadcast transaction
│   └── utils.js          # Shared utilities
├── .env.example          # Environment variable template
└── package.json
```

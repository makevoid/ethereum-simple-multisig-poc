# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Ethereum multisig vault implementation using Foundry where ETH is stored directly in the contract. The architecture follows a 3-step flow:

1. **Owner1** initiates transfers on-chain
2. **Owner2** reviews and signs transfer approval off-chain (saves to JSON files)
3. **Owner1** completes the transfer with Owner2's signature

## Key Architecture Components

### Smart Contract (`src/MultisigVault.sol`)
- Two immutable owners with distinct roles
- Uses `ecrecover` for on-chain signature verification
- Nonce-based replay protection via `transferNonce`
- Custom errors for gas efficiency
- Pending transfers stored in `mapping(uint256 => PendingTransfer)`

### File-Based Workflow
The system uses JSON files for off-chain coordination:
- `transfer-{nonce}.json`: Transfer details created by Owner1
- `signature-{nonce}.json`: Signatures created by Owner2
- `deployment.json`: Contract deployment info
- `.env`: Generated owner private keys (created during deployment)

### Testing Architecture
- **Unit tests**: `test/MultisigVault.t.sol` - comprehensive function testing
- **Integration tests**: `test/integration/MultisigVault.integration.t.sol` - real-world scenarios
- **JavaScript tests**: `test-js/integration.test.js` - end-to-end flow testing with Vitest

## Essential Commands

### Development Setup
```bash
# Install dependencies
forge install && npm install

# Build contracts
npm run build
# or
forge build

# Start local blockchain (required for deployment/testing)
anvil
```

### Testing
```bash
# Run unified test suite (builds contracts, starts Anvil, runs all tests, cleans up)
npm test
npm run test:suite

# Individual test commands
npm run test:foundry    # Foundry tests only
npm run test:js         # JavaScript tests only (requires Anvil)
forge test             # Direct Foundry execution
forge test --match-test testCompleteTransferWithValidSignature  # Specific test
forge test --gas-report  # Gas usage analysis
```

### Deployment and Usage
```bash
# Deploy to local Anvil (generates new owner keys)
npm run deploy

# 3-step multisig transfer flow:
npm run user1:initiate <recipient_address> <amount_in_eth>
npm run user2:sign <nonce>
npm run user1:complete <nonce>
```

## Technical Configuration

### Solidity Version
- Uses Solidity ^0.8.30 with `via_ir = true` for stack optimization
- Optimizer enabled with 200 runs

### Project Structure
- ES6 modules (`"type": "module"` in package.json)
- All scripts use import/export syntax
- Ethers.js v6 for blockchain interactions
- Foundry for smart contract development and testing

### Important Files
- `foundry.toml`: Foundry configuration with via_ir enabled
- `vitest.config.js`: JavaScript testing configuration
- Scripts in `scripts/` handle the complete multisig workflow

## Key Considerations

### Nonce Management
The deployment script includes explicit nonce handling to avoid "nonce too low" errors when redeploying to fresh Anvil instances.

### Signature Format
Owner2 signs using Ethereum's signed message format (`\x19Ethereum Signed Message:\n32`) and the contract expects v, r, s signature components for `ecrecover`.

### Test Patterns
Modern Foundry test naming: use `testRevertWhen_*` instead of deprecated `testFail*` patterns.
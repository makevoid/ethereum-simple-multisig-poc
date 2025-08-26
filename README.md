# Multisig Vault - Ethereum Smart Contract

A traditional multisig vault implementation using Foundry, where ETH is stored directly in the contract and requires signatures from two owners to execute transfers.

The code inplements a 2/2 multi signature scheme in which two signatures are required to unlock the funds managed by the smart contract.

## Features

- **Two-Owner Multisig**: Requires both owners to authorize transfers
- **Off-chain Signing**: Owner2 signs messages off-chain, reducing gas costs
- **ERC-1271 Compatible**: Uses OpenZeppelin's SignatureChecker for signature verification
- **Smart Contract Support**: Supports both EOA and smart contract signers
- **Direct ETH Storage**: Contract acts as a vault for ETH
- **Comprehensive Testing**: Unit tests, integration tests, and JavaScript tests

## Architecture

1. **Owner1** initiates transfers
2. **Owner2** reviews and signs transfer approval off-chain
3. **Owner1** completes the transfer with Owner2's signature
4. Contract verifies signature using OpenZeppelin's SignatureChecker (ERC-1271 compatible)

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Node.js](https://nodejs.org/) (v16 or higher)
- [npm](https://www.npmjs.com/)

## Installation

```bash
# Install Foundry dependencies (including OpenZeppelin)
forge install

# Install Node.js dependencies
npm install
```

**Note**: This project uses OpenZeppelin Contracts which are installed via Forge and gitignored. After cloning, make sure to run `forge install` to get the required dependencies.

## Setup & Deployment

### 1. Start Anvil (Local Ethereum Network)

```bash
anvil
```

### 2. Deploy the Contract

```bash
npm run deploy
# or
node scripts/deploy.js
```

This will:
- Generate two new wallets for Owner1 and Owner2
- Save private keys to `.env` file
- Deploy the MultisigVault contract
- Fund the vault with 10 ETH
- Save deployment info to `deployment.json`

## Usage

### Complete Transfer Flow

#### 1. Owner1 Initiates Transfer

```bash
npm run user1:initiate <recipient_address> <amount_in_eth>
# Example:
npm run user1:initiate 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 1.5
```

This creates a pending transfer and saves details to `transfer-{nonce}.json`.

#### 2. Owner2 Reviews and Signs

```bash
npm run user2:sign <nonce>
# Example:
npm run user2:sign 0
```

Owner2 can review the transfer details before signing. The signature is saved to `signature-{nonce}.json`.

#### 3. Owner1 Completes Transfer

```bash
npm run user1:complete <nonce>
# Example:
npm run user1:complete 0
```

Owner1 submits the signature to complete the transfer.

## Testing

### Unified Test Suite (Recommended)

The project includes a unified test suite that runs both Solidity and JavaScript tests automatically:

```bash
# Run complete test suite (Foundry + JavaScript)
npm test
# or
npm run test:suite
```

This will automatically:
1. Build the contracts
2. Start Anvil blockchain
3. Run Foundry tests (22 Solidity tests)
4. Run JavaScript integration test
5. Stop Anvil and cleanup

### Individual Test Commands

```bash
# Foundry tests only (Solidity)
npm run test:foundry
forge test -vvv

# JavaScript tests only (requires Anvil running)
npm run test:js

# Specific Foundry test
forge test --match-test testCompleteTransferWithValidSignature

# Gas report
forge test --gas-report

# Watch mode for development
npm run test:watch
```

## Contract Methods

### Core Functions

- `initiateTransfer(address to, uint256 amount)`: Start a new transfer (Owner1 only)
- `completeTransfer(uint256 nonce, uint8 v, bytes32 r, bytes32 s)`: Complete transfer with signature (Owner1 only)
- `deposit()`: Deposit ETH into the vault
- `receive()`: Fallback function to receive ETH

### View Functions

- `getTransferDetails(uint256 nonce)`: Get details of a pending/completed transfer
- `getMessageToSign(uint256 nonce)`: Get the message hash for Owner2 to sign
- `getBalance()`: Get vault's ETH balance
- `owner1()`: Get Owner1's address
- `owner2()`: Get Owner2's address
- `transferNonce()`: Get current transfer nonce

## Security Considerations

1. **Private Key Management**: Store private keys securely, never commit `.env` to version control
2. **Signature Verification**: All signatures are verified on-chain using OpenZeppelin's battle-tested SignatureChecker
3. **ERC-1271 Support**: Supports both EOA signatures and smart contract signatures via ERC-1271 standard
4. **Access Control**: Only Owner1 can initiate and complete transfers
5. **Replay Protection**: Each transfer has a unique nonce
6. **Balance Checks**: Contract verifies sufficient balance before transfers

## File Structure

```
multisig-vault/
├── src/
│   └── MultisigVault.sol          # Main contract
├── test/
│   ├── MultisigVault.t.sol        # Unit tests
│   └── integration/
│       └── MultisigVault.integration.t.sol  # Integration tests
├── scripts/
│   ├── deploy.js                  # Deployment script
│   ├── user1-initiate.js          # Initiate transfer
│   ├── user2-sign.js              # Sign transfer
│   └── user1-complete.js          # Complete transfer
├── test-js/
│   └── integration.test.js        # JavaScript tests
├── foundry.toml                   # Foundry configuration
├── package.json                   # Node.js configuration
├── vitest.config.js              # Vitest configuration
└── .env.example                   # Environment variables template
```

## Generated Files

- `.env`: Private keys and addresses (created during deployment)
- `deployment.json`: Contract address and deployment info
- `transfer-{nonce}.json`: Transfer details for each initiated transfer
- `signature-{nonce}.json`: Signatures from Owner2

## Gas Optimization

The contract is optimized for gas efficiency:
- Off-chain signing reduces transaction costs for Owner2
- Efficient storage layout using mappings
- Minimal state changes per transaction

## License

MIT

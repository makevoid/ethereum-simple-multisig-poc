import { MultisigClient } from '../lib/MultisigClient.js';
import { ethers } from 'ethers';

async function main() {
    // Parse arguments
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.error('Usage: node user1-initiate.js <to_address> <amount_in_eth>');
        process.exit(1);
    }
    
    const toAddress = args[0];
    const amountInEth = parseFloat(args[1]);
    const amount = ethers.parseEther(amountInEth.toString());
    
    console.log('🏦 Initiating multisig transfer...\n');
    
    try {
        const client = new MultisigClient();
        
        // Load environment and deployment info
        const env = client.loadEnv();
        const deployment = client.loadDeployment();
        
        // Create Owner1 wallet and connect to contract
        const owner1Wallet = client.createWallet(env.OWNER1_PRIVATE_KEY);
        await client.connect(deployment.contractAddress, owner1Wallet);
        
        // Show current vault balance
        const vaultBalance = await client.getBalance();
        console.log(`📊 Current vault balance: ${ethers.formatEther(vaultBalance)} ETH`);
        console.log(`💸 Transfer amount: ${amountInEth} ETH`);
        console.log(`📍 Recipient: ${toAddress}\n`);
        
        // Initiate transfer
        const result = await client.initiateTransfer(owner1Wallet, toAddress, amount);
        
        console.log('✅ Transfer initiated successfully!');
        console.log(`🔢 Transfer nonce: ${result.nonce}`);
        console.log(`📋 Transaction hash: ${result.tx.hash}\n`);
        
        // Save transfer details
        const transferData = {
            nonce: result.nonce.toString(),
            recipient: toAddress,
            amount: amountInEth.toString(),
            amountWei: amount.toString(),
            txHash: result.tx.hash,
            timestamp: new Date().toISOString(),
            initiated: true,
            completed: false
        };
        
        client.saveTransfer(result.nonce, transferData);
        console.log(`📄 Transfer details saved to transfer-${result.nonce}.json\n`);
        
        console.log('Next steps:');
        console.log(`1. Run: npm run user2:sign ${result.nonce}`);
        console.log(`2. Then run: npm run user1:complete ${result.nonce}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Error:', error);
        process.exit(1);
    });
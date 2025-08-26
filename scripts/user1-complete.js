import { MultisigClient } from '../lib/MultisigClient.js';
import { ethers } from 'ethers';

async function main() {
    // Parse arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error('Usage: node scripts/user1-complete.js <nonce>');
        process.exit(1);
    }
    
    const nonce = parseInt(args[0]);
    
    console.log('🚀 Completing multisig transfer...\n');
    
    try {
        const client = new MultisigClient();
        
        // Load environment and deployment info
        const env = client.loadEnv();
        const deployment = client.loadDeployment();
        
        // Create Owner1 wallet and connect to contract
        const owner1Wallet = client.createWallet(env.OWNER1_PRIVATE_KEY);
        await client.connect(deployment.contractAddress, owner1Wallet);
        
        // Load transfer and signature data
        const transferData = client.loadTransfer(nonce);
        const signatureData = client.loadSignature(nonce);
        
        console.log('📋 Transfer summary:');
        console.log(`🔢 Nonce: ${transferData.nonce}`);
        console.log(`📍 Recipient: ${transferData.recipient}`);
        console.log(`💸 Amount: ${transferData.amount} ETH`);
        console.log(`✍️  Signed by: ${signatureData.signer}\n`);
        
        // Get current balances
        const vaultBalanceBefore = await client.getBalance();
        const recipientBalanceBefore = await client.provider.getBalance(transferData.recipient);
        
        console.log('💰 Balances before transfer:');
        console.log(`🏦 Vault: ${ethers.formatEther(vaultBalanceBefore)} ETH`);
        console.log(`👤 Recipient: ${ethers.formatEther(recipientBalanceBefore)} ETH\n`);
        
        // Complete the transfer
        const result = await client.completeTransfer(owner1Wallet, nonce, signatureData.signature);
        
        console.log('✅ Transfer completed successfully!');
        console.log(`📋 Transaction hash: ${result.tx.hash}\n`);
        
        // Get updated balances
        const vaultBalanceAfter = await client.getBalance();
        const recipientBalanceAfter = await client.provider.getBalance(transferData.recipient);
        
        console.log('💰 Balances after transfer:');
        console.log(`🏦 Vault: ${ethers.formatEther(vaultBalanceAfter)} ETH`);
        console.log(`👤 Recipient: ${ethers.formatEther(recipientBalanceAfter)} ETH\n`);
        
        // Update transfer data to mark as completed
        transferData.completed = true;
        transferData.completionTxHash = result.tx.hash;
        transferData.completionTimestamp = new Date().toISOString();
        client.saveTransfer(nonce, transferData);
        
        console.log('🎉 Multisig transfer workflow completed successfully!');
        
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
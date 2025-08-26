import { MultisigClient } from '../lib/MultisigClient.js';
import { ethers } from 'ethers';

async function main() {
    // Parse arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error('Usage: node user2-sign.js <nonce>');
        process.exit(1);
    }
    
    const nonce = parseInt(args[0]);
    
    console.log('✍️  Owner2 signing transfer...\n');
    
    try {
        const client = new MultisigClient();
        
        // Load environment and deployment info
        const env = client.loadEnv();
        const deployment = client.loadDeployment();
        
        // Create Owner2 wallet and connect to contract
        const owner2Wallet = client.createWallet(env.OWNER2_PRIVATE_KEY);
        await client.connect(deployment.contractAddress);
        
        // Load transfer details to review
        const transferData = client.loadTransfer(nonce);
        console.log('📋 Transfer details to review:');
        console.log(`🔢 Nonce: ${transferData.nonce}`);
        console.log(`📍 Recipient: ${transferData.recipient}`);
        console.log(`💸 Amount: ${transferData.amount} ETH`);
        console.log(`📅 Initiated: ${transferData.timestamp}\n`);
        
        // Get transfer details from contract
        const contractDetails = await client.getTransferDetails(nonce);
        console.log('🔍 Contract verification:');
        console.log(`✅ Recipient matches: ${contractDetails.to === transferData.recipient}`);
        console.log(`✅ Amount matches: ${ethers.formatEther(contractDetails.amount) === transferData.amount}`);
        console.log(`✅ Transfer initiated: ${contractDetails.initiated}`);
        console.log(`✅ Transfer not completed: ${!contractDetails.completed}\n`);
        
        // Sign the transfer
        const signatureResult = await client.signTransfer(owner2Wallet, nonce);
        
        console.log('✅ Transfer signed by Owner2!');
        console.log(`🔐 Message hash: ${signatureResult.messageHash}`);
        console.log(`📝 Signature: ${signatureResult.signatureString}\n`);
        
        // Save signature
        const signatureData = {
            nonce: nonce.toString(),
            messageToSign: signatureResult.messageToSign,
            messageHash: signatureResult.messageHash,
            signature: signatureResult.signature,
            signatureString: signatureResult.signatureString,
            signer: owner2Wallet.address,
            timestamp: new Date().toISOString()
        };
        
        client.saveSignature(nonce, signatureData);
        console.log(`📄 Signature saved to signature-${nonce}.json\n`);
        
        console.log('Next step:');
        console.log(`Run: npm run user1:complete ${nonce}`);
        
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
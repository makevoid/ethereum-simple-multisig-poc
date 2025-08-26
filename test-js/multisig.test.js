import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { MultisigClient } from '../lib/MultisigClient.js';

describe('MultisigVault Integration Test', () => {
    it('should complete full multisig transfer workflow', async () => {
        console.log('\n🧪 Running JavaScript Integration Test...');
        
        const client = new MultisigClient();
        
        // Use different accounts to avoid nonce conflicts
        const deployerPrivateKey = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';
        const owner1PrivateKey = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a';
        const owner2PrivateKey = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
        
        const deployer = client.createWallet(deployerPrivateKey);
        const owner1 = client.createWallet(owner1PrivateKey);
        const owner2 = client.createWallet(owner2PrivateKey);
        
        // Deploy contract using MultisigClient
        const deployment = await client.deploy(owner1.address, owner2.address, deployer);
        
        // Fund the vault
        await client.fundContract(deployer, ethers.parseEther('10'));
        
        // Test the full transfer flow
        const recipient = ethers.Wallet.createRandom().address;
        const amount = ethers.parseEther('1');
        
        // Initiate transfer using MultisigClient
        const initiateResult = await client.initiateTransfer(owner1, recipient, amount);
        const nonce = initiateResult.nonce;
        
        // Owner2 signs using MultisigClient
        const signatureResult = await client.signTransfer(owner2, nonce);
        
        // Complete transfer using MultisigClient
        await client.completeTransfer(owner1, nonce, signatureResult.signature);
        
        // Verify transfer completed
        const recipientBalance = await client.provider.getBalance(recipient);
        expect(recipientBalance).toBe(amount);
        
        console.log('✅ JavaScript Integration Test: Full multisig transfer workflow completed successfully');
        console.log(`   📊 Transfer Details: ${ethers.formatEther(amount)} ETH sent to ${recipient.slice(0,8)}...`);
        console.log(`   🏦 Final vault balance: ${ethers.formatEther(await client.getBalance())} ETH`);
    });
});
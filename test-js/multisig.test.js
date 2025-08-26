import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('MultisigVault Integration Test', () => {
    it('should complete full multisig transfer workflow', async () => {
        console.log('\n🧪 Running JavaScript Integration Test...');
        // Connect to Anvil
        const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
        
        // Use different accounts to avoid nonce conflicts
        const deployerPrivateKey = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';
        const owner1PrivateKey = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a';
        const owner2PrivateKey = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
        
        const deployer = new ethers.Wallet(deployerPrivateKey, provider);
        const owner1 = new ethers.Wallet(owner1PrivateKey, provider);
        const owner2 = new ethers.Wallet(owner2PrivateKey, provider);
        
        // Load contract ABI
        const contractPath = path.join(__dirname, '../out/MultisigVault.sol/MultisigVault.json');
        const contractJson = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
        
        // Deploy contract
        const factory = new ethers.ContractFactory(
            contractJson.abi,
            contractJson.bytecode.object,
            deployer
        );
        
        const vault = await factory.deploy(owner1.address, owner2.address);
        await vault.waitForDeployment();
        
        // Fund the vault
        await deployer.sendTransaction({
            to: await vault.getAddress(),
            value: ethers.parseEther('10')
        });
        
        // Test the full transfer flow
        const recipient = ethers.Wallet.createRandom().address;
        const amount = ethers.parseEther('1');
        
        const vaultAsOwner1 = vault.connect(owner1);
        
        // Initiate transfer
        const initTx = await vaultAsOwner1.initiateTransfer(recipient, amount);
        const initReceipt = await initTx.wait();
        
        // Get nonce from event
        const event = initReceipt.logs.find(log => {
            try {
                const parsed = vault.interface.parseLog(log);
                return parsed.name === 'TransferInitiated';
            } catch {
                return false;
            }
        });
        
        const parsedEvent = vault.interface.parseLog(event);
        const nonce = parsedEvent.args[0];
        
        // Owner2 signs
        const messageToSign = await vault.getMessageToSign(nonce);
        const messageHash = ethers.solidityPackedKeccak256(
            ['string', 'bytes32'],
            ['\x19Ethereum Signed Message:\n32', messageToSign]
        );
        
        const signature = owner2.signingKey.sign(messageHash);
        
        // Complete transfer
        const completeTx = await vaultAsOwner1.completeTransfer(
            nonce,
            signature.v,
            signature.r,
            signature.s
        );
        await completeTx.wait();
        
        // Verify transfer completed
        const recipientBalance = await provider.getBalance(recipient);
        expect(recipientBalance).toBe(amount);
        
        console.log('✅ JavaScript Integration Test: Full multisig transfer workflow completed successfully');
        console.log(`   📊 Transfer Details: ${ethers.formatEther(amount)} ETH sent to ${recipient.slice(0,8)}...`);
        console.log(`   🏦 Final vault balance: ${ethers.formatEther(await vault.getBalance())} ETH`);
    });
});
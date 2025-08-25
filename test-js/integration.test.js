import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { spawn, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let anvilProcess;
let provider;
let deployer;
let owner1;
let owner2;
let vault;
let vaultAddress;
let contractAbi;

describe('MultisigVault Integration Tests', () => {
    beforeAll(async () => {
        console.log('Starting Anvil...');
        
        // Start Anvil
        anvilProcess = spawn('anvil', ['--port', '8545'], {
            stdio: 'pipe'
        });
        
        // Wait for Anvil to start
        await new Promise((resolve) => {
            anvilProcess.stdout.on('data', (data) => {
                if (data.toString().includes('Listening on')) {
                    resolve();
                }
            });
        });
        
        console.log('Anvil started successfully');
        
        // Connect to provider
        provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
        
        // Compile contracts
        console.log('Compiling contracts...');
        await execAsync('forge build');
        
        // Setup wallets
        const deployerPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
        deployer = new ethers.Wallet(deployerPrivateKey, provider);
        
        // Create owner wallets
        const owner1PrivateKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
        const owner2PrivateKey = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
        
        owner1 = new ethers.Wallet(owner1PrivateKey, provider);
        owner2 = new ethers.Wallet(owner2PrivateKey, provider);
        
        // Fund owner wallets
        await deployer.sendTransaction({
            to: owner1.address,
            value: ethers.parseEther('10')
        });
        
        await deployer.sendTransaction({
            to: owner2.address,
            value: ethers.parseEther('10')
        });
        
        // Load contract ABI
        const contractPath = path.join(__dirname, '../out/MultisigVault.sol/MultisigVault.json');
        const contractJson = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
        contractAbi = contractJson.abi;
        
        // Deploy contract
        const factory = new ethers.ContractFactory(
            contractAbi,
            contractJson.bytecode.object,
            deployer
        );
        
        vault = await factory.deploy(owner1.address, owner2.address);
        await vault.waitForDeployment();
        vaultAddress = await vault.getAddress();
        
        console.log('Contract deployed to:', vaultAddress);
        
        // Fund the vault
        await deployer.sendTransaction({
            to: vaultAddress,
            value: ethers.parseEther('100')
        });
        
    }, 60000); // 60 second timeout
    
    afterAll(async () => {
        if (anvilProcess) {
            anvilProcess.kill();
            console.log('Anvil stopped');
        }
    });
    
    beforeEach(async () => {
        // Reset any state if needed
    });
    
    it('should deploy with correct owners', async () => {
        const contractOwner1 = await vault.owner1();
        const contractOwner2 = await vault.owner2();
        
        expect(contractOwner1).toBe(owner1.address);
        expect(contractOwner2).toBe(owner2.address);
    });
    
    it('should have initial balance', async () => {
        const balance = await vault.getBalance();
        expect(balance).toBe(ethers.parseEther('100'));
    });
    
    it('should complete full transfer flow', async () => {
        const recipient = ethers.Wallet.createRandom().address;
        const amount = ethers.parseEther('5');
        
        // Connect vault to owner1
        const vaultAsOwner1 = vault.connect(owner1);
        
        // Step 1: Initiate transfer
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
        
        // Step 2: Get message to sign
        const messageToSign = await vault.getMessageToSign(nonce);
        
        // Step 3: Owner2 signs
        const messageHash = ethers.solidityPackedKeccak256(
            ['string', 'bytes32'],
            ['\x19Ethereum Signed Message:\n32', messageToSign]
        );
        
        const signature = owner2.signingKey.sign(messageHash);
        
        // Step 4: Complete transfer
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
        
        const details = await vault.getTransferDetails(nonce);
        expect(details[4]).toBe(true); // completed flag
    });
    
    it('should handle multiple concurrent transfers', async () => {
        const recipients = [
            ethers.Wallet.createRandom().address,
            ethers.Wallet.createRandom().address,
            ethers.Wallet.createRandom().address
        ];
        const amounts = [
            ethers.parseEther('2'),
            ethers.parseEther('3'),
            ethers.parseEther('1')
        ];
        
        const vaultAsOwner1 = vault.connect(owner1);
        const nonces = [];
        
        // Initiate all transfers
        for (let i = 0; i < recipients.length; i++) {
            const tx = await vaultAsOwner1.initiateTransfer(recipients[i], amounts[i]);
            const receipt = await tx.wait();
            
            const event = receipt.logs.find(log => {
                try {
                    const parsed = vault.interface.parseLog(log);
                    return parsed.name === 'TransferInitiated';
                } catch {
                    return false;
                }
            });
            
            const parsedEvent = vault.interface.parseLog(event);
            nonces.push(parsedEvent.args[0]);
        }
        
        // Complete transfers in reverse order
        for (let i = nonces.length - 1; i >= 0; i--) {
            const messageToSign = await vault.getMessageToSign(nonces[i]);
            const messageHash = ethers.solidityPackedKeccak256(
                ['string', 'bytes32'],
                ['\x19Ethereum Signed Message:\n32', messageToSign]
            );
            
            const signature = owner2.signingKey.sign(messageHash);
            
            const tx = await vaultAsOwner1.completeTransfer(
                nonces[i],
                signature.v,
                signature.r,
                signature.s
            );
            await tx.wait();
        }
        
        // Verify all transfers completed
        for (let i = 0; i < recipients.length; i++) {
            const balance = await provider.getBalance(recipients[i]);
            expect(balance).toBe(amounts[i]);
        }
    });
    
    it('should reject invalid signatures', async () => {
        const recipient = ethers.Wallet.createRandom().address;
        const amount = ethers.parseEther('1');
        
        const vaultAsOwner1 = vault.connect(owner1);
        
        // Initiate transfer
        const initTx = await vaultAsOwner1.initiateTransfer(recipient, amount);
        const initReceipt = await initTx.wait();
        
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
        
        // Sign with wrong key (owner1 instead of owner2)
        const messageToSign = await vault.getMessageToSign(nonce);
        const messageHash = ethers.solidityPackedKeccak256(
            ['string', 'bytes32'],
            ['\x19Ethereum Signed Message:\n32', messageToSign]
        );
        
        const wrongSignature = owner1.signingKey.sign(messageHash);
        
        // Should revert
        await expect(
            vaultAsOwner1.completeTransfer(
                nonce,
                wrongSignature.v,
                wrongSignature.r,
                wrongSignature.s
            )
        ).rejects.toThrow();
    });
    
    it('should handle deposits correctly', async () => {
        const initialBalance = await vault.getBalance();
        const depositAmount = ethers.parseEther('10');
        
        // Send ETH directly
        await deployer.sendTransaction({
            to: vaultAddress,
            value: depositAmount
        });
        
        const newBalance = await vault.getBalance();
        expect(newBalance).toBe(initialBalance + depositAmount);
        
        // Use deposit function
        const vaultAsDeployer = vault.connect(deployer);
        await vaultAsDeployer.deposit({ value: depositAmount });
        
        const finalBalance = await vault.getBalance();
        expect(finalBalance).toBe(initialBalance + depositAmount + depositAmount);
    });
    
    it('should prevent double spending', async () => {
        const recipient = ethers.Wallet.createRandom().address;
        const amount = ethers.parseEther('1');
        
        const vaultAsOwner1 = vault.connect(owner1);
        
        // Initiate and complete transfer
        const initTx = await vaultAsOwner1.initiateTransfer(recipient, amount);
        const initReceipt = await initTx.wait();
        
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
        
        const messageToSign = await vault.getMessageToSign(nonce);
        const messageHash = ethers.solidityPackedKeccak256(
            ['string', 'bytes32'],
            ['\x19Ethereum Signed Message:\n32', messageToSign]
        );
        
        const signature = owner2.signingKey.sign(messageHash);
        
        // Complete transfer
        await vaultAsOwner1.completeTransfer(
            nonce,
            signature.v,
            signature.r,
            signature.s
        );
        
        // Try to complete again
        await expect(
            vaultAsOwner1.completeTransfer(
                nonce,
                signature.v,
                signature.r,
                signature.s
            )
        ).rejects.toThrow();
    });
    
    it('should enforce owner permissions', async () => {
        const recipient = ethers.Wallet.createRandom().address;
        const amount = ethers.parseEther('1');
        
        // Try to initiate as owner2 (should fail)
        const vaultAsOwner2 = vault.connect(owner2);
        await expect(
            vaultAsOwner2.initiateTransfer(recipient, amount)
        ).rejects.toThrow();
        
        // Try to initiate as random address (should fail)
        const randomWallet = ethers.Wallet.createRandom().connect(provider);
        await deployer.sendTransaction({
            to: randomWallet.address,
            value: ethers.parseEther('1')
        });
        
        const vaultAsRandom = vault.connect(randomWallet);
        await expect(
            vaultAsRandom.initiateTransfer(recipient, amount)
        ).rejects.toThrow();
    });
    
    it('should provide correct getters', async () => {
        const vaultAsOwner1 = vault.connect(owner1);
        
        // Check initial nonce
        const initialNonce = await vault.transferNonce();
        
        // Initiate a transfer
        const recipient = ethers.Wallet.createRandom().address;
        const amount = ethers.parseEther('2');
        
        const tx = await vaultAsOwner1.initiateTransfer(recipient, amount);
        const receipt = await tx.wait();
        
        const event = receipt.logs.find(log => {
            try {
                const parsed = vault.interface.parseLog(log);
                return parsed.name === 'TransferInitiated';
            } catch {
                return false;
            }
        });
        
        const parsedEvent = vault.interface.parseLog(event);
        const nonce = parsedEvent.args[0];
        
        // Check nonce incremented
        const newNonce = await vault.transferNonce();
        expect(newNonce).toBe(initialNonce + 1n);
        
        // Check transfer details
        const details = await vault.getTransferDetails(nonce);
        expect(details[0]).toBe(recipient); // to
        expect(details[1]).toBe(amount); // amount
        expect(details[3]).toBe(true); // initiated
        expect(details[4]).toBe(false); // completed
        
        // Check message to sign
        const messageToSign = await vault.getMessageToSign(nonce);
        expect(messageToSign).toBe(details[2]); // dataHash
    });
});
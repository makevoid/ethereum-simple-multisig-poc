import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MultisigVault {
    constructor(options = {}) {
        this.rpcUrl = options.rpcUrl || 'http://127.0.0.1:8545';
        this.provider = null;
        this.contract = null;
        this.deployment = null;
        this.contractAbi = null;
        this.contractBytecode = null;
        
        // Load environment variables
        dotenv.config();
        
        // Initialize immediately
        this._initialize();
    }

    _initialize() {
        this._setupProvider();
        this._loadContractAbi();
        this._loadDeployment();
    }

    _setupProvider() {
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    }

    _loadContractAbi() {
        const contractPath = path.join(__dirname, '../out/MultisigVault.sol/MultisigVault.json');
        if (fs.existsSync(contractPath)) {
            const contractJson = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
            this.contractAbi = contractJson.abi;
            this.contractBytecode = contractJson.bytecode.object;
        } else {
            throw new Error(`Contract ABI not found at ${contractPath}. Run 'forge build' first.`);
        }
    }

    _loadDeployment() {
        const deploymentPath = path.join(__dirname, '../deployment.json');
        if (fs.existsSync(deploymentPath)) {
            this.deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
        }
    }

    getContract(signer = null) {
        if (!this.deployment) {
            throw new Error('No deployment found. Run deployment script first.');
        }

        const signerOrProvider = signer || this.provider;
        
        if (!this.contract || (signer && this.contract.runner !== signer)) {
            this.contract = new ethers.Contract(
                this.deployment.vaultAddress,
                this.contractAbi,
                signerOrProvider
            );
        }

        return this.contract;
    }

    getOwner1Wallet() {
        if (!process.env.OWNER1_PRIVATE_KEY) {
            throw new Error('OWNER1_PRIVATE_KEY not found in environment');
        }
        return new ethers.Wallet(process.env.OWNER1_PRIVATE_KEY, this.provider);
    }

    getOwner2Wallet() {
        if (!process.env.OWNER2_PRIVATE_KEY) {
            throw new Error('OWNER2_PRIVATE_KEY not found in environment');
        }
        return new ethers.Wallet(process.env.OWNER2_PRIVATE_KEY, this.provider);
    }

    getDeployerWallet() {
        const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY || 
            '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
        return new ethers.Wallet(deployerPrivateKey, this.provider);
    }

    async deploy(owner1Address, owner2Address) {
        const deployer = this.getDeployerWallet();
        
        // Generate wallets if addresses not provided
        let wallet1, wallet2;
        if (!owner1Address || !owner2Address) {
            wallet1 = ethers.Wallet.createRandom();
            wallet2 = ethers.Wallet.createRandom();
            owner1Address = wallet1.address;
            owner2Address = wallet2.address;
            
            console.log('Generated Owner1:', owner1Address);
            console.log('Generated Owner2:', owner2Address);
            
            // Save to .env
            const envContent = `
# Generated Private Keys
OWNER1_PRIVATE_KEY=${wallet1.privateKey}
OWNER1_ADDRESS=${wallet1.address}
OWNER2_PRIVATE_KEY=${wallet2.privateKey}
OWNER2_ADDRESS=${wallet2.address}

# Anvil default account for deployment
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
`;
            fs.writeFileSync('.env', envContent);
            console.log('Private keys saved to .env file');
            
            // Fund the wallets
            console.log('Funding owner wallets...');
            const currentNonce = await deployer.getNonce();
            
            const tx1 = await deployer.sendTransaction({
                to: wallet1.address,
                value: ethers.parseEther('1'),
                nonce: currentNonce
            });
            await tx1.wait();
            
            const tx2 = await deployer.sendTransaction({
                to: wallet2.address,
                value: ethers.parseEther('1'),
                nonce: currentNonce + 1
            });
            await tx2.wait();
        }

        // Deploy contract
        console.log('Deploying MultisigVault...');
        const factory = new ethers.ContractFactory(
            this.contractAbi,
            this.contractBytecode,
            deployer
        );

        const vault = await factory.deploy(owner1Address, owner2Address);
        await vault.waitForDeployment();

        const vaultAddress = await vault.getAddress();
        console.log('MultisigVault deployed to:', vaultAddress);

        // Fund vault
        console.log('Funding vault with 10 ETH...');
        const finalNonce = await deployer.getNonce();
        const fundTx = await deployer.sendTransaction({
            to: vaultAddress,
            value: ethers.parseEther('10'),
            nonce: finalNonce
        });
        await fundTx.wait();

        // Save deployment info
        this.deployment = {
            vaultAddress: vaultAddress,
            owner1: owner1Address,
            owner2: owner2Address,
            deployedAt: new Date().toISOString(),
            network: 'anvil'
        };

        fs.writeFileSync('deployment.json', JSON.stringify(this.deployment, null, 2));
        console.log('Deployment info saved to deployment.json');

        return this.deployment;
    }

    async initiateTransfer(toAddress, amountInEth) {
        if (!ethers.isAddress(toAddress)) {
            throw new Error(`Invalid address: ${toAddress}`);
        }

        const owner1 = this.getOwner1Wallet();
        const vault = this.getContract(owner1);

        const vaultBalance = await vault.getBalance();
        const amount = ethers.parseEther(amountInEth.toString());

        if (amount > vaultBalance) {
            throw new Error('Insufficient vault balance');
        }

        console.log('Initiating transfer...');
        console.log('To:', toAddress);
        console.log('Amount:', amountInEth, 'ETH');
        console.log('From:', owner1.address);

        const tx = await vault.initiateTransfer(toAddress, amount);
        const receipt = await tx.wait();

        // Extract nonce from event
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

        console.log('Transfer initiated successfully!');
        console.log('Nonce:', nonce.toString());
        console.log('Transaction hash:', receipt.hash);

        // Save transfer info
        const transferInfo = {
            nonce: nonce.toString(),
            to: toAddress,
            amount: amountInEth.toString(),
            amountWei: amount.toString(),
            initiatedBy: owner1.address,
            txHash: receipt.hash,
            timestamp: new Date().toISOString(),
            status: 'pending'
        };

        const transferFile = `transfer-${nonce}.json`;
        fs.writeFileSync(transferFile, JSON.stringify(transferInfo, null, 2));
        console.log(`Transfer details saved to ${transferFile}`);

        return { nonce: nonce.toString(), transferInfo, receipt };
    }

    async signTransfer(nonce) {
        const owner2 = this.getOwner2Wallet();
        const vault = this.getContract();

        console.log('Fetching transfer details from contract...');
        const details = await vault.getTransferDetails(nonce);
        const [to, amount, dataHash, initiated, completed] = details;

        if (!initiated) {
            throw new Error('Transfer not initiated');
        }
        if (completed) {
            throw new Error('Transfer already completed');
        }

        console.log('Transfer Details:');
        console.log('To:', to);
        console.log('Amount:', ethers.formatEther(amount), 'ETH');
        console.log('Data Hash:', dataHash);
        console.log('Status: Pending signature');

        // Get message to sign
        const messageToSign = await vault.getMessageToSign(nonce);
        console.log('Message to sign:', messageToSign);

        // Sign the message
        console.log('Signing message with Owner2 private key...');
        const messageHash = ethers.solidityPackedKeccak256(
            ['string', 'bytes32'],
            ['\x19Ethereum Signed Message:\n32', messageToSign]
        );

        const signature = owner2.signingKey.sign(messageHash);
        const { v, r, s } = signature;

        console.log('Signature generated:');
        console.log('v:', v);
        console.log('r:', r);
        console.log('s:', s);

        // Save signature
        const signatureData = {
            nonce: nonce.toString(),
            signer: owner2.address,
            messageHash: messageToSign,
            signature: { v, r, s, compact: signature.compact },
            timestamp: new Date().toISOString()
        };

        const signatureFile = `signature-${nonce}.json`;
        fs.writeFileSync(signatureFile, JSON.stringify(signatureData, null, 2));
        console.log(`Signature saved to ${signatureFile}`);

        return { signatureData, details };
    }

    async completeTransfer(nonce) {
        const signatureFile = `signature-${nonce}.json`;
        if (!fs.existsSync(signatureFile)) {
            throw new Error(`Signature file not found: ${signatureFile}. Run signTransfer first.`);
        }

        const signatureData = JSON.parse(fs.readFileSync(signatureFile, 'utf8'));
        const owner1 = this.getOwner1Wallet();
        const vault = this.getContract(owner1);

        console.log('Fetching transfer details...');
        const details = await vault.getTransferDetails(nonce);
        const [to, amount, dataHash, initiated, completed] = details;

        if (!initiated) {
            throw new Error('Transfer not initiated');
        }
        if (completed) {
            throw new Error('Transfer already completed');
        }

        console.log('Transfer to:', to);
        console.log('Amount:', ethers.formatEther(amount), 'ETH');

        // Check balance before
        const balanceBefore = await this.provider.getBalance(to);
        console.log('Recipient balance before:', ethers.formatEther(balanceBefore), 'ETH');

        // Complete transfer
        console.log('Completing transfer with Owner2 signature...');
        const tx = await vault.completeTransfer(
            nonce,
            signatureData.signature.v,
            signatureData.signature.r,
            signatureData.signature.s
        );

        console.log('Transaction submitted:', tx.hash);
        const receipt = await tx.wait();
        console.log('Transaction confirmed!');

        // Check balance after
        const balanceAfter = await this.provider.getBalance(to);
        console.log('Recipient balance after:', ethers.formatEther(balanceAfter), 'ETH');
        console.log('Amount received:', ethers.formatEther(balanceAfter - balanceBefore), 'ETH');

        // Update transfer file
        const transferFile = `transfer-${nonce}.json`;
        if (fs.existsSync(transferFile)) {
            const transferInfo = JSON.parse(fs.readFileSync(transferFile, 'utf8'));
            transferInfo.status = 'completed';
            transferInfo.completedTxHash = receipt.hash;
            transferInfo.completedAt = new Date().toISOString();
            fs.writeFileSync(transferFile, JSON.stringify(transferInfo, null, 2));
        }

        // Show vault balance
        const vaultBalance = await vault.getBalance();
        console.log('Vault balance remaining:', ethers.formatEther(vaultBalance), 'ETH');
        console.log('✅ Transfer completed successfully!');

        return { receipt, balanceAfter, balanceBefore };
    }

    async getVaultBalance() {
        const vault = this.getContract();
        return await vault.getBalance();
    }

    async getTransferDetails(nonce) {
        const vault = this.getContract();
        return await vault.getTransferDetails(nonce);
    }

    getDeploymentInfo() {
        return this.deployment;
    }
}
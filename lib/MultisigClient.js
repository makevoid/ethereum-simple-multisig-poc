import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProvider, createWallet, generateWallet } from './utils/rpc.js';
import { loadContractABI, loadContractArtifact } from './utils/abi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * MultisigClient - Abstraction layer for interacting with MultisigVault contract
 */
export class MultisigClient {
    constructor(rpcUrl = 'http://127.0.0.1:8545') {
        this.provider = createProvider(rpcUrl);
        this.contract = null;
        this.contractAddress = null;
        this.abi = null;
    }

    /**
     * Load contract ABI from compiled artifact
     */
    loadABI() {
        this.abi = loadContractABI('MultisigVault');
        return this.abi;
    }

    /**
     * Connect to deployed contract
     */
    async connect(contractAddress, signer = null) {
        if (!this.abi) {
            this.loadABI();
        }

        this.contractAddress = contractAddress;
        
        if (signer) {
            this.contract = new ethers.Contract(contractAddress, this.abi, signer);
        } else {
            this.contract = new ethers.Contract(contractAddress, this.abi, this.provider);
        }

        return this.contract;
    }

    /**
     * Deploy new MultisigVault contract
     */
    async deploy(owner1Address, owner2Address, deployerSigner) {
        const artifact = loadContractArtifact('MultisigVault');
        this.abi = artifact.abi;
        
        const factory = new ethers.ContractFactory(
            artifact.abi,
            artifact.bytecode,
            deployerSigner
        );

        // Get current nonce to avoid conflicts
        const nonce = await deployerSigner.getNonce();
        
        const vault = await factory.deploy(owner1Address, owner2Address, { nonce });
        await vault.waitForDeployment();

        this.contractAddress = await vault.getAddress();
        this.contract = vault;

        return {
            contract: vault,
            address: this.contractAddress,
            deploymentTx: vault.deploymentTransaction()
        };
    }

    /**
     * Create wallet from private key
     */
    createWallet(privateKey) {
        return createWallet(privateKey, this.provider);
    }

    /**
     * Generate random wallet
     */
    generateWallet() {
        return generateWallet(this.provider);
    }

    /**
     * Load deployment information
     */
    loadDeployment() {
        const deploymentPath = path.join(__dirname, '../deployment.json');
        
        if (!fs.existsSync(deploymentPath)) {
            throw new Error('Deployment file not found. Run deployment first.');
        }

        return JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    }

    /**
     * Save deployment information
     */
    saveDeployment(deploymentInfo) {
        const deploymentPath = path.join(__dirname, '../deployment.json');
        fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    }

    /**
     * Load environment variables
     */
    loadEnv() {
        const envPath = path.join(__dirname, '../.env');
        
        if (!fs.existsSync(envPath)) {
            throw new Error('.env file not found. Run deployment first.');
        }

        const env = {};
        const envContent = fs.readFileSync(envPath, 'utf8');
        
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                env[key] = value;
            }
        });

        return env;
    }

    /**
     * Save environment variables
     */
    saveEnv(envVars) {
        const envPath = path.join(__dirname, '../.env');
        const envContent = Object.entries(envVars)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        fs.writeFileSync(envPath, envContent);
    }

    /**
     * Load transfer details from JSON file
     */
    loadTransfer(nonce) {
        const transferPath = path.join(__dirname, `../transfer-${nonce}.json`);
        
        if (!fs.existsSync(transferPath)) {
            throw new Error(`Transfer file for nonce ${nonce} not found.`);
        }

        return JSON.parse(fs.readFileSync(transferPath, 'utf8'));
    }

    /**
     * Save transfer details to JSON file
     */
    saveTransfer(nonce, transferData) {
        const transferPath = path.join(__dirname, `../transfer-${nonce}.json`);
        fs.writeFileSync(transferPath, JSON.stringify(transferData, null, 2));
    }

    /**
     * Load signature from JSON file
     */
    loadSignature(nonce) {
        const signaturePath = path.join(__dirname, `../signature-${nonce}.json`);
        
        if (!fs.existsSync(signaturePath)) {
            throw new Error(`Signature file for nonce ${nonce} not found.`);
        }

        return JSON.parse(fs.readFileSync(signaturePath, 'utf8'));
    }

    /**
     * Save signature to JSON file
     */
    saveSignature(nonce, signatureData) {
        const signaturePath = path.join(__dirname, `../signature-${nonce}.json`);
        fs.writeFileSync(signaturePath, JSON.stringify(signatureData, null, 2));
    }

    /**
     * Initiate a transfer (Owner1 only)
     */
    async initiateTransfer(owner1Signer, recipient, amount) {
        if (!this.contract) {
            throw new Error('Contract not connected. Call connect() first.');
        }

        const vaultAsOwner1 = this.contract.connect(owner1Signer);
        const tx = await vaultAsOwner1.initiateTransfer(recipient, amount);
        const receipt = await tx.wait();

        // Extract nonce from event
        const event = receipt.logs.find(log => {
            try {
                const parsed = this.contract.interface.parseLog(log);
                return parsed.name === 'TransferInitiated';
            } catch {
                return false;
            }
        });

        if (!event) {
            throw new Error('TransferInitiated event not found');
        }

        const parsedEvent = this.contract.interface.parseLog(event);
        const nonce = parsedEvent.args[0];

        return {
            nonce,
            recipient,
            amount,
            tx,
            receipt
        };
    }

    /**
     * Get message to sign for Owner2
     */
    async getMessageToSign(nonce) {
        if (!this.contract) {
            throw new Error('Contract not connected. Call connect() first.');
        }

        return await this.contract.getMessageToSign(nonce);
    }

    /**
     * Sign transfer approval (Owner2)
     */
    async signTransfer(owner2Signer, nonce) {
        const messageToSign = await this.getMessageToSign(nonce);
        
        // Create Ethereum signed message hash
        const messageHash = ethers.solidityPackedKeccak256(
            ['string', 'bytes32'],
            ['\x19Ethereum Signed Message:\n32', messageToSign]
        );

        const signature = owner2Signer.signingKey.sign(messageHash);

        return {
            messageToSign,
            messageHash,
            signature: {
                v: signature.v,
                r: signature.r,
                s: signature.s
            },
            signatureString: ethers.Signature.from(signature).serialized
        };
    }

    /**
     * Complete transfer with signature (Owner1 only)
     */
    async completeTransfer(owner1Signer, nonce, signature) {
        if (!this.contract) {
            throw new Error('Contract not connected. Call connect() first.');
        }

        const vaultAsOwner1 = this.contract.connect(owner1Signer);
        const tx = await vaultAsOwner1.completeTransfer(
            nonce,
            signature.v,
            signature.r,
            signature.s
        );
        const receipt = await tx.wait();

        return {
            tx,
            receipt
        };
    }

    /**
     * Get contract balance
     */
    async getBalance() {
        if (!this.contract) {
            throw new Error('Contract not connected. Call connect() first.');
        }

        return await this.contract.getBalance();
    }

    /**
     * Get transfer details
     */
    async getTransferDetails(nonce) {
        if (!this.contract) {
            throw new Error('Contract not connected. Call connect() first.');
        }

        const details = await this.contract.getTransferDetails(nonce);
        return {
            to: details[0],
            amount: details[1],
            dataHash: details[2],
            initiated: details[3],
            completed: details[4]
        };
    }

    /**
     * Get current transfer nonce
     */
    async getCurrentNonce() {
        if (!this.contract) {
            throw new Error('Contract not connected. Call connect() first.');
        }

        return await this.contract.transferNonce();
    }

    /**
     * Validate signature using ERC-1271 standard
     */
    async isValidSignature(hash, signature) {
        if (!this.contract) {
            throw new Error('Contract not connected. Call connect() first.');
        }

        try {
            const result = await this.contract.isValidSignature(hash, signature);
            return result === '0x1626ba7e';
        } catch (error) {
            return false;
        }
    }

    /**
     * Fund contract with ETH
     */
    async fundContract(signer, amount) {
        if (!this.contract) {
            throw new Error('Contract not connected. Call connect() first.');
        }

        const tx = await signer.sendTransaction({
            to: this.contractAddress,
            value: amount
        });
        
        return await tx.wait();
    }
}

export default MultisigClient;
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    // Parse arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error('Usage: node scripts/user1-complete.js <nonce>');
        process.exit(1);
    }
    
    const nonce = args[0];
    
    // Load signature file
    const signatureFile = `signature-${nonce}.json`;
    if (!fs.existsSync(signatureFile)) {
        console.error(`Signature file not found: ${signatureFile}`);
        console.error('Please run user2-sign.js first');
        process.exit(1);
    }
    
    const signatureData = JSON.parse(fs.readFileSync(signatureFile, 'utf8'));
    
    // Connect to provider
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    
    // Get owner1 wallet
    const owner1 = new ethers.Wallet(process.env.OWNER1_PRIVATE_KEY, provider);
    console.log('Using Owner1:', owner1.address);
    
    // Load deployment info
    const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf8'));
    
    // Load contract ABI
    const contractPath = path.join(__dirname, '../out/MultisigVault.sol/MultisigVault.json');
    const contractJson = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    
    // Connect to contract
    const vault = new ethers.Contract(
        deployment.vaultAddress,
        contractJson.abi,
        owner1
    );
    
    // Get transfer details
    console.log('\nFetching transfer details...');
    const details = await vault.getTransferDetails(nonce);
    const [to, amount, dataHash, initiated, completed] = details;
    
    if (!initiated) {
        console.error('Transfer not initiated');
        process.exit(1);
    }
    
    if (completed) {
        console.error('Transfer already completed');
        process.exit(1);
    }
    
    console.log('Transfer to:', to);
    console.log('Amount:', ethers.formatEther(amount), 'ETH');
    
    // Check recipient balance before
    const balanceBefore = await provider.getBalance(to);
    console.log('\nRecipient balance before:', ethers.formatEther(balanceBefore), 'ETH');
    
    // Complete the transfer with signature
    console.log('\nCompleting transfer with Owner2 signature...');
    
    const tx = await vault.completeTransfer(
        nonce,
        signatureData.signature.v,
        signatureData.signature.r,
        signatureData.signature.s
    );
    
    console.log('Transaction submitted:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('Transaction confirmed!');
    
    // Check recipient balance after
    const balanceAfter = await provider.getBalance(to);
    console.log('\nRecipient balance after:', ethers.formatEther(balanceAfter), 'ETH');
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
    
    // Check vault balance
    const vaultBalance = await vault.getBalance();
    console.log('\nVault balance remaining:', ethers.formatEther(vaultBalance), 'ETH');
    
    console.log('\n✅ Transfer completed successfully!');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Error:', error);
        process.exit(1);
    });
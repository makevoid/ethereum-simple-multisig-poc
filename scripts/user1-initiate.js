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
    if (args.length !== 2) {
        console.error('Usage: node user1-initiate.js <to_address> <amount_in_eth>');
        process.exit(1);
    }
    
    const toAddress = args[0];
    const amountInEth = args[1];
    
    // Validate address
    if (!ethers.isAddress(toAddress)) {
        console.error('Invalid address:', toAddress);
        process.exit(1);
    }
    
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
    
    // Check vault balance
    const vaultBalance = await vault.getBalance();
    console.log('\nVault balance:', ethers.formatEther(vaultBalance), 'ETH');
    
    const amount = ethers.parseEther(amountInEth);
    
    if (amount > vaultBalance) {
        console.error('Insufficient vault balance');
        process.exit(1);
    }
    
    // Initiate transfer
    console.log('\nInitiating transfer...');
    console.log('To:', toAddress);
    console.log('Amount:', amountInEth, 'ETH');
    
    const tx = await vault.initiateTransfer(toAddress, amount);
    const receipt = await tx.wait();
    
    // Get nonce from events
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
    
    console.log('\nTransfer initiated successfully!');
    console.log('Nonce:', nonce.toString());
    console.log('Transaction hash:', receipt.hash);
    
    // Save transfer info
    const transferInfo = {
        nonce: nonce.toString(),
        to: toAddress,
        amount: amountInEth,
        amountWei: amount.toString(),
        initiatedBy: owner1.address,
        txHash: receipt.hash,
        timestamp: new Date().toISOString(),
        status: 'pending'
    };
    
    const transferFile = `transfer-${nonce}.json`;
    fs.writeFileSync(transferFile, JSON.stringify(transferInfo, null, 2));
    
    console.log(`\nTransfer details saved to ${transferFile}`);
    console.log('\nNext steps:');
    console.log(`1. Run: node scripts/user2-sign.js ${nonce}`);
    console.log(`2. Then run: node scripts/user1-complete.js ${nonce}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Error:', error);
        process.exit(1);
    });
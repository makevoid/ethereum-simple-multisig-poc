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
        console.error('Usage: node user2-sign.js <nonce>');
        process.exit(1);
    }
    
    const nonce = args[0];
    
    // Connect to provider
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    
    // Get owner2 wallet
    const owner2 = new ethers.Wallet(process.env.OWNER2_PRIVATE_KEY, provider);
    console.log('Using Owner2:', owner2.address);
    
    // Load deployment info
    const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf8'));
    
    // Load contract ABI
    const contractPath = path.join(__dirname, '../out/MultisigVault.sol/MultisigVault.json');
    const contractJson = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    
    // Connect to contract (read-only for owner2)
    const vault = new ethers.Contract(
        deployment.vaultAddress,
        contractJson.abi,
        provider
    );
    
    // Get transfer details from contract
    console.log('\nFetching transfer details from contract...');
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
    
    console.log('\nTransfer Details:');
    console.log('To:', to);
    console.log('Amount:', ethers.formatEther(amount), 'ETH');
    console.log('Data Hash:', dataHash);
    console.log('Status: Pending signature');
    
    // Get the message to sign
    const messageToSign = await vault.getMessageToSign(nonce);
    console.log('\nMessage to sign:', messageToSign);
    
    // Sign the message
    console.log('\nSigning message with Owner2 private key...');
    
    // Create the Ethereum signed message hash
    const messageHash = ethers.solidityPackedKeccak256(
        ['string', 'bytes32'],
        ['\x19Ethereum Signed Message:\n32', messageToSign]
    );
    
    // Sign the hash
    const signature = owner2.signingKey.sign(messageHash);
    
    // Extract v, r, s
    const v = signature.v;
    const r = signature.r;
    const s = signature.s;
    
    console.log('\nSignature generated:');
    console.log('v:', v);
    console.log('r:', r);
    console.log('s:', s);
    
    // Save signature to file
    const signatureData = {
        nonce: nonce,
        signer: owner2.address,
        messageHash: messageToSign,
        signature: {
            v: v,
            r: r,
            s: s,
            compact: signature.compact
        },
        timestamp: new Date().toISOString()
    };
    
    const signatureFile = `signature-${nonce}.json`;
    fs.writeFileSync(signatureFile, JSON.stringify(signatureData, null, 2));
    
    console.log(`\nSignature saved to ${signatureFile}`);
    console.log('\nNext step:');
    console.log(`Run: node scripts/user1-complete.js ${nonce}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Error:', error);
        process.exit(1);
    });
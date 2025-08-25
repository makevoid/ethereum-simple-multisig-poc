import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    // Connect to Anvil
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    
    // Generate two new wallets for owner1 and owner2
    const wallet1 = ethers.Wallet.createRandom();
    const wallet2 = ethers.Wallet.createRandom();
    
    console.log('Generated Owner1:', wallet1.address);
    console.log('Generated Owner2:', wallet2.address);
    
    // Save private keys to .env file
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
    console.log('\nPrivate keys saved to .env file');
    
    // Get deployer wallet (Anvil's first default account)
    const deployerPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const deployer = new ethers.Wallet(deployerPrivateKey, provider);
    
    // Fund the owner wallets for gas
    console.log('\nFunding owner wallets...');
    
    // Get current nonce to avoid nonce issues
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
    
    // Load compiled contract
    const contractPath = path.join(__dirname, '../out/MultisigVault.sol/MultisigVault.json');
    const contractJson = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    
    // Deploy contract
    console.log('\nDeploying MultisigVault...');
    const factory = new ethers.ContractFactory(
        contractJson.abi,
        contractJson.bytecode.object,
        deployer
    );
    
    const vault = await factory.deploy(wallet1.address, wallet2.address);
    await vault.waitForDeployment();
    
    const vaultAddress = await vault.getAddress();
    console.log('MultisigVault deployed to:', vaultAddress);
    
    // Fund the vault with some ETH
    console.log('\nFunding vault with 10 ETH...');
    const finalNonce = await deployer.getNonce();
    const fundTx = await deployer.sendTransaction({
        to: vaultAddress,
        value: ethers.parseEther('10'),
        nonce: finalNonce
    });
    await fundTx.wait();
    
    // Save deployment info
    const deploymentInfo = {
        vaultAddress: vaultAddress,
        owner1: wallet1.address,
        owner2: wallet2.address,
        deployedAt: new Date().toISOString(),
        network: 'anvil'
    };
    
    fs.writeFileSync(
        'deployment.json',
        JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log('\nDeployment info saved to deployment.json');
    console.log('\nSetup complete! You can now run:');
    console.log('  - node scripts/user1-initiate.js <to_address> <amount_in_eth>');
    console.log('  - node scripts/user2-sign.js <nonce>');
    console.log('  - node scripts/user1-complete.js <nonce>');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
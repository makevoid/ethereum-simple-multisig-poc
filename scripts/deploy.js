import { MultisigClient } from '../lib/MultisigClient.js';
import { ethers } from 'ethers';

async function main() {
    console.log('🚀 Deploying MultisigVault...\n');

    const client = new MultisigClient();
    
    // Use pre-funded Anvil accounts
    const deployerWallet = client.createWallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'); // Anvil account #0
    const owner1Wallet = client.createWallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'); // Anvil account #1  
    const owner2Wallet = client.createWallet('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'); // Anvil account #2
    
    console.log('📝 Using pre-funded Anvil wallets:');
    console.log(`Owner1: ${owner1Wallet.address}`);
    console.log(`Owner2: ${owner2Wallet.address}`);
    console.log(`Deployer: ${deployerWallet.address}\n`);
    
    // Deploy contract
    const deployment = await client.deploy(
        owner1Wallet.address,
        owner2Wallet.address,
        deployerWallet
    );
    
    console.log(`✅ Contract deployed at: ${deployment.address}`);
    
    // Fund the vault with 10 ETH
    console.log('\n💰 Funding vault with 10 ETH...');
    await client.fundContract(deployerWallet, ethers.parseEther('10'));
    
    const balance = await client.getBalance();
    console.log(`✅ Vault balance: ${ethers.formatEther(balance)} ETH\n`);
    
    // Save deployment info
    const deploymentInfo = {
        contractAddress: deployment.address,
        owner1: owner1Wallet.address,
        owner2: owner2Wallet.address,
        deployer: deployerWallet.address,
        deploymentTx: deployment.deploymentTx.hash,
        timestamp: new Date().toISOString(),
        network: 'anvil-local'
    };
    
    client.saveDeployment(deploymentInfo);
    
    // Save private keys to .env
    const envVars = {
        OWNER1_PRIVATE_KEY: owner1Wallet.privateKey,
        OWNER2_PRIVATE_KEY: owner2Wallet.privateKey,
        DEPLOYER_PRIVATE_KEY: deployerWallet.privateKey,
        CONTRACT_ADDRESS: deployment.address
    };
    
    client.saveEnv(envVars);
    
    console.log('📄 Saved deployment info to deployment.json');
    console.log('🔐 Saved private keys to .env\n');
    
    console.log('Setup complete! You can now run:');
    console.log('  - npm run user1:initiate <to_address> <amount_in_eth>');
    console.log('  - npm run user2:sign <nonce>');
    console.log('  - npm run user1:complete <nonce>');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
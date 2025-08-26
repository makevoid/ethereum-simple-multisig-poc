import { ethers } from 'ethers';

/**
 * RPC Provider utilities for Ethereum connections
 */

/**
 * Create a JSON RPC provider instance
 * @param {string} rpcUrl - RPC endpoint URL
 * @returns {ethers.JsonRpcProvider} Provider instance
 */
export function createProvider(rpcUrl = 'http://127.0.0.1:8545') {
    return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Create a wallet instance connected to provider
 * @param {string} privateKey - Private key for the wallet
 * @param {ethers.JsonRpcProvider} provider - Provider instance
 * @returns {ethers.Wallet} Connected wallet
 */
export function createWallet(privateKey, provider) {
    return new ethers.Wallet(privateKey, provider);
}

/**
 * Generate a random wallet connected to provider
 * @param {ethers.JsonRpcProvider} provider - Provider instance
 * @returns {ethers.Wallet} Connected random wallet
 */
export function generateWallet(provider) {
    const wallet = ethers.Wallet.createRandom();
    return wallet.connect(provider);
}

export default {
    createProvider,
    createWallet,
    generateWallet
};
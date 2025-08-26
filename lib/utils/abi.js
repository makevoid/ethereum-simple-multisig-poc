import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ABI loading utilities for Foundry contract artifacts
 */

/**
 * Load contract ABI from Foundry build artifacts
 * @param {string} contractName - Name of the contract (e.g., 'MultisigVault')
 * @param {string} basePath - Base path to search from (defaults to project root)
 * @returns {Array} Contract ABI
 */
export function loadContractABI(contractName, basePath = null) {
    const projectRoot = basePath || path.join(__dirname, '../..');
    const contractPath = path.join(projectRoot, 'out', `${contractName}.sol`, `${contractName}.json`);
    
    if (!fs.existsSync(contractPath)) {
        throw new Error(`Contract artifact not found at ${contractPath}. Run "forge build" first.`);
    }

    const contractJson = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    
    if (!contractJson.abi) {
        throw new Error(`ABI not found in contract artifact: ${contractPath}`);
    }

    return contractJson.abi;
}

/**
 * Load full contract artifact (ABI + bytecode)
 * @param {string} contractName - Name of the contract
 * @param {string} basePath - Base path to search from (defaults to project root)
 * @returns {Object} Full contract artifact with abi and bytecode
 */
export function loadContractArtifact(contractName, basePath = null) {
    const projectRoot = basePath || path.join(__dirname, '../..');
    const contractPath = path.join(projectRoot, 'out', `${contractName}.sol`, `${contractName}.json`);
    
    if (!fs.existsSync(contractPath)) {
        throw new Error(`Contract artifact not found at ${contractPath}. Run "forge build" first.`);
    }

    const contractJson = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    
    if (!contractJson.abi) {
        throw new Error(`ABI not found in contract artifact: ${contractPath}`);
    }
    
    if (!contractJson.bytecode || !contractJson.bytecode.object) {
        throw new Error(`Bytecode not found in contract artifact: ${contractPath}`);
    }

    return {
        abi: contractJson.abi,
        bytecode: contractJson.bytecode.object,
        metadata: {
            compiler: contractJson.metadata?.compiler,
            settings: contractJson.metadata?.settings,
            version: contractJson.metadata?.compiler?.version
        }
    };
}

export default {
    loadContractABI,
    loadContractArtifact
};
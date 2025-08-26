#!/usr/bin/env node

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

let anvilProcess;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTestSuite() {
    console.log('🚀 Starting Multisig Vault Test Suite');
    console.log('=====================================');
    
    try {
        // Step 1: Build contracts
        console.log('\n📦 Building contracts...');
        await execAsync('forge build');
        console.log('✅ Contracts built successfully');
        
        // Step 2: Start Anvil
        console.log('\n⚡ Starting Anvil...');
        anvilProcess = spawn('anvil', ['--chain-id', '1337', '--block-time', '1'], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        // Wait for Anvil to start
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Anvil startup timeout')), 10000);
            
            anvilProcess.stdout.on('data', (data) => {
                if (data.toString().includes('Listening on')) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            
            anvilProcess.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
        
        console.log('✅ Anvil started successfully');
        
        // Step 3: Run Foundry tests
        console.log('\n🧪 Running Foundry Tests (Solidity)...');
        try {
            const { stdout } = await execAsync('forge test');
            console.log(stdout);
        } catch (error) {
            console.error('❌ Foundry tests failed:', error.message);
            throw error;
        }
        
        // Step 4: Run JavaScript tests  
        console.log('\n🧪 Running JavaScript Tests...');
        try {
            const { stdout } = await execAsync('npx vitest run test-js/multisig.test.js');
            console.log(stdout);
        } catch (error) {
            console.error('❌ JavaScript tests failed:', error.message);
            throw error;
        }
        
        console.log('\n🎉 All tests passed successfully!');
        console.log('=====================================');
        console.log('✅ Foundry Tests: Solidity unit & integration tests');
        console.log('✅ JavaScript Tests: End-to-end multisig workflow');
        
    } catch (error) {
        console.error('\n💥 Test suite failed:', error.message);
        process.exit(1);
    } finally {
        // Cleanup
        if (anvilProcess) {
            console.log('\n🛑 Stopping Anvil...');
            anvilProcess.kill();
            await sleep(1000);
        }
    }
}

// Handle cleanup on exit
process.on('SIGINT', () => {
    console.log('\n⚠️  Received interrupt signal');
    if (anvilProcess) {
        anvilProcess.kill();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    if (anvilProcess) {
        anvilProcess.kill();
    }
    process.exit(0);
});

runTestSuite();
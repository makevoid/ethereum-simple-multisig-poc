// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../src/MultisigVault.sol";

contract MultisigVaultIntegrationTest is Test {
    MultisigVault public vault;
    
    address owner1;
    uint256 owner1PrivateKey;
    address owner2;
    uint256 owner2PrivateKey;
    
    address alice;
    address bob;
    address charlie;
    
    function setUp() public {
        // Setup owners with known private keys
        owner1PrivateKey = 0xA11CE;
        owner1 = vm.addr(owner1PrivateKey);
        
        owner2PrivateKey = 0xB0B;
        owner2 = vm.addr(owner2PrivateKey);
        
        // Setup recipients
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        charlie = makeAddr("charlie");
        
        // Deploy and fund vault
        vault = new MultisigVault(owner1, owner2);
        vm.deal(address(vault), 100 ether);
        
        // Give owner1 some ETH for gas
        vm.deal(owner1, 1 ether);
        vm.deal(owner2, 1 ether);
    }
    
    function testFullFlowSingleTransfer() public {
        uint256 transferAmount = 5 ether;
        uint256 aliceInitialBalance = alice.balance;
        
        // Step 1: Owner1 initiates transfer
        vm.prank(owner1);
        uint256 nonce = vault.initiateTransfer(alice, transferAmount);
        
        // Verify transfer is pending
        (address to, uint256 amount, , bool initiated, bool completed) = vault.getTransferDetails(nonce);
        assertEq(to, alice);
        assertEq(amount, transferAmount);
        assertTrue(initiated);
        assertFalse(completed);
        
        // Step 2: Owner2 retrieves transfer details and signs
        bytes32 messageToSign = vault.getMessageToSign(nonce);
        bytes32 ethSignedHash = vault.getEthSignedMessageHash(messageToSign);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(owner2PrivateKey, ethSignedHash);
        
        // Step 3: Owner1 completes transfer with signature
        vm.prank(owner1);
        vault.completeTransfer(nonce, v, r, s);
        
        // Verify transfer completed
        (, , , , bool completedAfter) = vault.getTransferDetails(nonce);
        assertTrue(completedAfter);
        assertEq(alice.balance, aliceInitialBalance + transferAmount);
        assertEq(vault.getBalance(), 95 ether);
    }
    
    function testConcurrentTransfers() public {
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 3 ether;
        amounts[1] = 5 ether;
        amounts[2] = 2 ether;
        
        address[] memory recipients = new address[](3);
        recipients[0] = alice;
        recipients[1] = bob;
        recipients[2] = charlie;
        
        uint256[] memory nonces = new uint256[](3);
        
        // Initiate multiple transfers
        vm.startPrank(owner1);
        for (uint i = 0; i < 3; i++) {
            nonces[i] = vault.initiateTransfer(recipients[i], amounts[i]);
        }
        vm.stopPrank();
        
        // Complete transfers in different order (2, 0, 1)
        uint256[] memory order = new uint256[](3);
        order[0] = 2;
        order[1] = 0;
        order[2] = 1;
        
        for (uint i = 0; i < 3; i++) {
            uint256 idx = order[i];
            
            bytes32 messageToSign = vault.getMessageToSign(nonces[idx]);
            bytes32 ethSignedHash = vault.getEthSignedMessageHash(messageToSign);
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(owner2PrivateKey, ethSignedHash);
            
            vm.prank(owner1);
            vault.completeTransfer(nonces[idx], v, r, s);
        }
        
        // Verify all transfers completed correctly
        assertEq(alice.balance, amounts[0]);
        assertEq(bob.balance, amounts[1]);
        assertEq(charlie.balance, amounts[2]);
        assertEq(vault.getBalance(), 90 ether);
    }
    
    function testRealisticScenarioWithDepositsAndWithdrawals() public {
        // Initial state
        assertEq(vault.getBalance(), 100 ether);
        
        // Deposit more funds
        address depositor = makeAddr("depositor");
        vm.deal(depositor, 50 ether);
        vm.prank(depositor);
        vault.deposit{value: 50 ether}();
        assertEq(vault.getBalance(), 150 ether);
        
        // Transfer 1: Large transfer
        vm.prank(owner1);
        uint256 nonce1 = vault.initiateTransfer(alice, 75 ether);
        
        bytes32 msg1 = vault.getMessageToSign(nonce1);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(owner2PrivateKey, vault.getEthSignedMessageHash(msg1));
        
        vm.prank(owner1);
        vault.completeTransfer(nonce1, v1, r1, s1);
        
        assertEq(vault.getBalance(), 75 ether);
        assertEq(alice.balance, 75 ether);
        
        // Transfer 2: Another transfer
        vm.prank(owner1);
        uint256 nonce2 = vault.initiateTransfer(bob, 25 ether);
        
        bytes32 msg2 = vault.getMessageToSign(nonce2);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(owner2PrivateKey, vault.getEthSignedMessageHash(msg2));
        
        vm.prank(owner1);
        vault.completeTransfer(nonce2, v2, r2, s2);
        
        assertEq(vault.getBalance(), 50 ether);
        assertEq(bob.balance, 25 ether);
    }
    
    function testRevertWhen_FailedTransferScenarios() public {
        // Scenario 1: Initiate transfer but never complete
        vm.prank(owner1);
        uint256 nonce1 = vault.initiateTransfer(alice, 10 ether);
        
        // Scenario 2: Try to complete with wrong signature
        vm.prank(owner1);
        uint256 nonce2 = vault.initiateTransfer(bob, 5 ether);
        
        bytes32 wrongMessage = keccak256("wrong message");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(owner2PrivateKey, wrongMessage);
        
        vm.prank(owner1);
        vm.expectRevert(MultisigVault.InvalidSignature.selector);
        vault.completeTransfer(nonce2, v, r, s);
        
        // Verify no funds were transferred
        assertEq(alice.balance, 0);
        assertEq(bob.balance, 0);
        assertEq(vault.getBalance(), 100 ether);
        
        // Verify transfers are still pending
        (, , , bool initiated1, bool completed1) = vault.getTransferDetails(nonce1);
        (, , , bool initiated2, bool completed2) = vault.getTransferDetails(nonce2);
        
        assertTrue(initiated1 && !completed1);
        assertTrue(initiated2 && !completed2);
    }
    
    function testEmergencyScenarios() public {
        // Scenario: Vault runs out of funds mid-operation
        vm.prank(owner1);
        uint256 nonce1 = vault.initiateTransfer(alice, 60 ether);
        
        vm.prank(owner1);
        uint256 nonce2 = vault.initiateTransfer(bob, 60 ether);
        
        // Complete first transfer
        bytes32 msg1 = vault.getMessageToSign(nonce1);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(owner2PrivateKey, vault.getEthSignedMessageHash(msg1));
        
        vm.prank(owner1);
        vault.completeTransfer(nonce1, v1, r1, s1);
        
        assertEq(vault.getBalance(), 40 ether);
        
        // Try to complete second transfer (should fail due to insufficient balance)
        bytes32 msg2 = vault.getMessageToSign(nonce2);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(owner2PrivateKey, vault.getEthSignedMessageHash(msg2));
        
        vm.prank(owner1);
        vm.expectRevert(MultisigVault.InsufficientBalance.selector);
        vault.completeTransfer(nonce2, v2, r2, s2);
        
        // Add more funds and retry
        vm.deal(address(vault), vault.getBalance() + 20 ether);
        
        vm.prank(owner1);
        vault.completeTransfer(nonce2, v2, r2, s2);
        
        assertEq(bob.balance, 60 ether);
    }
    
    function testGasOptimizationMultipleTransfers() public {
        uint256 gasUsed;
        uint256 gasBefore;
        
        // Measure gas for first transfer
        vm.prank(owner1);
        uint256 nonce1 = vault.initiateTransfer(alice, 1 ether);
        
        bytes32 msg1 = vault.getMessageToSign(nonce1);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(owner2PrivateKey, vault.getEthSignedMessageHash(msg1));
        
        gasBefore = gasleft();
        vm.prank(owner1);
        vault.completeTransfer(nonce1, v1, r1, s1);
        gasUsed = gasBefore - gasleft();
        
        console.log("Gas used for first transfer:", gasUsed);
        
        // Measure gas for subsequent transfer
        vm.prank(owner1);
        uint256 nonce2 = vault.initiateTransfer(bob, 1 ether);
        
        bytes32 msg2 = vault.getMessageToSign(nonce2);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(owner2PrivateKey, vault.getEthSignedMessageHash(msg2));
        
        gasBefore = gasleft();
        vm.prank(owner1);
        vault.completeTransfer(nonce2, v2, r2, s2);
        gasUsed = gasBefore - gasleft();
        
        console.log("Gas used for second transfer:", gasUsed);
    }
}
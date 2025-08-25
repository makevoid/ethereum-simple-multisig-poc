// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/MultisigVault.sol";

contract MultisigVaultTest is Test {
    MultisigVault public vault;
    
    address owner1;
    uint256 owner1PrivateKey;
    address owner2;
    uint256 owner2PrivateKey;
    address recipient;
    
    event TransferInitiated(uint256 indexed nonce, address indexed to, uint256 amount, bytes32 dataHash);
    event TransferCompleted(uint256 indexed nonce, address indexed to, uint256 amount);
    event Deposit(address indexed from, uint256 amount);
    
    function setUp() public {
        // Create test accounts with known private keys
        owner1PrivateKey = 0x1234;
        owner1 = vm.addr(owner1PrivateKey);
        
        owner2PrivateKey = 0x5678;
        owner2 = vm.addr(owner2PrivateKey);
        
        recipient = makeAddr("recipient");
        
        // Deploy contract
        vault = new MultisigVault(owner1, owner2);
        
        // Fund the vault
        vm.deal(address(vault), 10 ether);
    }
    
    function testConstructor() public {
        assertEq(vault.owner1(), owner1);
        assertEq(vault.owner2(), owner2);
    }
    
    function testConstructorRevertsWithInvalidOwners() public {
        vm.expectRevert("Invalid owner1");
        new MultisigVault(address(0), owner2);
        
        vm.expectRevert("Invalid owner2");
        new MultisigVault(owner1, address(0));
        
        vm.expectRevert("Owners must be different");
        new MultisigVault(owner1, owner1);
    }
    
    function testDeposit() public {
        uint256 depositAmount = 1 ether;
        address depositor = makeAddr("depositor");
        vm.deal(depositor, depositAmount);
        
        vm.expectEmit(true, true, false, true);
        emit Deposit(depositor, depositAmount);
        
        vm.prank(depositor);
        vault.deposit{value: depositAmount}();
        
        assertEq(vault.getBalance(), 11 ether);
    }
    
    function testReceive() public {
        uint256 depositAmount = 1 ether;
        address depositor = makeAddr("depositor");
        vm.deal(depositor, depositAmount);
        
        vm.expectEmit(true, true, false, true);
        emit Deposit(depositor, depositAmount);
        
        vm.prank(depositor);
        (bool success,) = address(vault).call{value: depositAmount}("");
        assertTrue(success);
        
        assertEq(vault.getBalance(), 11 ether);
    }
    
    function testInitiateTransfer() public {
        uint256 amount = 1 ether;
        
        vm.expectEmit(true, true, false, false);
        emit TransferInitiated(0, recipient, amount, bytes32(0));
        
        vm.prank(owner1);
        uint256 nonce = vault.initiateTransfer(recipient, amount);
        
        assertEq(nonce, 0);
        
        (address to, uint256 transferAmount, bytes32 dataHash, bool initiated, bool completed) = 
            vault.getTransferDetails(nonce);
        
        assertEq(to, recipient);
        assertEq(transferAmount, amount);
        assertTrue(initiated);
        assertFalse(completed);
        assertTrue(dataHash != bytes32(0));
    }
    
    function testInitiateTransferOnlyOwner1() public {
        vm.prank(owner2);
        vm.expectRevert(MultisigVault.OnlyOwner1.selector);
        vault.initiateTransfer(recipient, 1 ether);
        
        vm.prank(recipient);
        vm.expectRevert(MultisigVault.OnlyOwner1.selector);
        vault.initiateTransfer(recipient, 1 ether);
    }
    
    function testInitiateTransferInvalidInputs() public {
        vm.startPrank(owner1);
        
        vm.expectRevert(MultisigVault.InvalidAddress.selector);
        vault.initiateTransfer(address(0), 1 ether);
        
        vm.expectRevert(MultisigVault.InvalidAmount.selector);
        vault.initiateTransfer(recipient, 0);
        
        vm.expectRevert(MultisigVault.InsufficientBalance.selector);
        vault.initiateTransfer(recipient, 100 ether);
        
        vm.stopPrank();
    }
    
    function testCompleteTransferWithValidSignature() public {
        uint256 amount = 1 ether;
        
        // Owner1 initiates transfer
        vm.prank(owner1);
        uint256 nonce = vault.initiateTransfer(recipient, amount);
        
        // Get the message to sign
        bytes32 dataHash = vault.getMessageToSign(nonce);
        
        // Owner2 signs the message
        bytes32 ethSignedMessageHash = vault.getEthSignedMessageHash(dataHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(owner2PrivateKey, ethSignedMessageHash);
        
        uint256 recipientBalanceBefore = recipient.balance;
        
        vm.expectEmit(true, true, false, true);
        emit TransferCompleted(nonce, recipient, amount);
        
        // Owner1 completes the transfer with owner2's signature
        vm.prank(owner1);
        vault.completeTransfer(nonce, v, r, s);
        
        assertEq(recipient.balance, recipientBalanceBefore + amount);
        assertEq(vault.getBalance(), 9 ether);
        
        (, , , bool initiated, bool completed) = vault.getTransferDetails(nonce);
        assertTrue(initiated);
        assertTrue(completed);
    }
    
    function testCompleteTransferInvalidSignature() public {
        uint256 amount = 1 ether;
        
        vm.prank(owner1);
        uint256 nonce = vault.initiateTransfer(recipient, amount);
        
        bytes32 dataHash = vault.getMessageToSign(nonce);
        bytes32 ethSignedMessageHash = vault.getEthSignedMessageHash(dataHash);
        
        // Sign with wrong key (owner1 instead of owner2)
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(owner1PrivateKey, ethSignedMessageHash);
        
        vm.prank(owner1);
        vm.expectRevert(MultisigVault.InvalidSignature.selector);
        vault.completeTransfer(nonce, v, r, s);
    }
    
    function testCompleteTransferNotInitiated() public {
        // Create a fake signature
        uint8 v = 27;
        bytes32 r = bytes32(uint256(1));
        bytes32 s = bytes32(uint256(2));
        
        vm.prank(owner1);
        vm.expectRevert(MultisigVault.TransferNotInitiated.selector);
        vault.completeTransfer(999, v, r, s);
    }
    
    function testCompleteTransferAlreadyCompleted() public {
        uint256 amount = 1 ether;
        
        vm.prank(owner1);
        uint256 nonce = vault.initiateTransfer(recipient, amount);
        
        bytes32 dataHash = vault.getMessageToSign(nonce);
        bytes32 ethSignedMessageHash = vault.getEthSignedMessageHash(dataHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(owner2PrivateKey, ethSignedMessageHash);
        
        vm.prank(owner1);
        vault.completeTransfer(nonce, v, r, s);
        
        // Try to complete again
        vm.prank(owner1);
        vm.expectRevert(MultisigVault.TransferAlreadyCompleted.selector);
        vault.completeTransfer(nonce, v, r, s);
    }
    
    function testCompleteTransferOnlyOwner1() public {
        uint256 amount = 1 ether;
        
        vm.prank(owner1);
        uint256 nonce = vault.initiateTransfer(recipient, amount);
        
        bytes32 dataHash = vault.getMessageToSign(nonce);
        bytes32 ethSignedMessageHash = vault.getEthSignedMessageHash(dataHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(owner2PrivateKey, ethSignedMessageHash);
        
        vm.prank(owner2);
        vm.expectRevert(MultisigVault.OnlyOwner1.selector);
        vault.completeTransfer(nonce, v, r, s);
    }
    
    function testMultipleTransfers() public {
        uint256 amount1 = 1 ether;
        uint256 amount2 = 2 ether;
        address recipient2 = makeAddr("recipient2");
        
        // Initiate two transfers
        vm.startPrank(owner1);
        uint256 nonce1 = vault.initiateTransfer(recipient, amount1);
        uint256 nonce2 = vault.initiateTransfer(recipient2, amount2);
        vm.stopPrank();
        
        // Complete first transfer
        bytes32 dataHash1 = vault.getMessageToSign(nonce1);
        bytes32 ethSignedMessageHash1 = vault.getEthSignedMessageHash(dataHash1);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(owner2PrivateKey, ethSignedMessageHash1);
        
        vm.prank(owner1);
        vault.completeTransfer(nonce1, v1, r1, s1);
        
        // Complete second transfer
        bytes32 dataHash2 = vault.getMessageToSign(nonce2);
        bytes32 ethSignedMessageHash2 = vault.getEthSignedMessageHash(dataHash2);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(owner2PrivateKey, ethSignedMessageHash2);
        
        vm.prank(owner1);
        vault.completeTransfer(nonce2, v2, r2, s2);
        
        assertEq(recipient.balance, amount1);
        assertEq(recipient2.balance, amount2);
        assertEq(vault.getBalance(), 7 ether);
    }
    
    function testGetters() public {
        assertEq(vault.getBalance(), 10 ether);
        assertEq(vault.transferNonce(), 0);
        
        vm.prank(owner1);
        vault.initiateTransfer(recipient, 1 ether);
        
        assertEq(vault.transferNonce(), 1);
    }
}
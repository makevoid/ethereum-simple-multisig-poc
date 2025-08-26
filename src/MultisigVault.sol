// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

contract MultisigVault is IERC1271 {
    address public immutable owner1;
    address public immutable owner2;
    
    struct PendingTransfer {
        address to;
        uint256 amount;
        bytes32 dataHash;
        bool initiated;
        bool completed;
    }
    
    mapping(uint256 => PendingTransfer) public pendingTransfers;
    uint256 public transferNonce;
    
    event TransferInitiated(uint256 indexed nonce, address indexed to, uint256 amount, bytes32 dataHash);
    event TransferCompleted(uint256 indexed nonce, address indexed to, uint256 amount);
    event Deposit(address indexed from, uint256 amount);
    
    // ERC-1271 magic value
    bytes4 private constant MAGIC_VALUE = 0x1626ba7e;
    
    error OnlyOwner1();
    error OnlyOwners();
    error InvalidSignature();
    error TransferNotInitiated();
    error TransferAlreadyCompleted();
    error InsufficientBalance();
    error InvalidAmount();
    error InvalidAddress();
    
    modifier onlyOwner1() {
        if (msg.sender != owner1) revert OnlyOwner1();
        _;
    }
    
    modifier onlyOwners() {
        if (msg.sender != owner1 && msg.sender != owner2) revert OnlyOwners();
        _;
    }
    
    constructor(address _owner1, address _owner2) {
        require(_owner1 != address(0), "Invalid owner1");
        require(_owner2 != address(0), "Invalid owner2");
        require(_owner1 != _owner2, "Owners must be different");
        
        owner1 = _owner1;
        owner2 = _owner2;
    }
    
    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }
    
    function deposit() external payable {
        emit Deposit(msg.sender, msg.value);
    }
    
    function initiateTransfer(address to, uint256 amount) external onlyOwner1 returns (uint256) {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (address(this).balance < amount) revert InsufficientBalance();
        
        uint256 nonce = transferNonce++;
        
        // Create hash of transfer data for signing
        bytes32 dataHash = keccak256(abi.encodePacked(
            address(this),
            nonce,
            to,
            amount
        ));
        
        pendingTransfers[nonce] = PendingTransfer({
            to: to,
            amount: amount,
            dataHash: dataHash,
            initiated: true,
            completed: false
        });
        
        emit TransferInitiated(nonce, to, amount, dataHash);
        
        return nonce;
    }
    
    function getTransferDetails(uint256 nonce) external view returns (
        address to,
        uint256 amount,
        bytes32 dataHash,
        bool initiated,
        bool completed
    ) {
        PendingTransfer memory transfer = pendingTransfers[nonce];
        return (
            transfer.to,
            transfer.amount,
            transfer.dataHash,
            transfer.initiated,
            transfer.completed
        );
    }
    
    function completeTransfer(
        uint256 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external onlyOwner1 {
        PendingTransfer storage transfer = pendingTransfers[nonce];
        
        if (!transfer.initiated) revert TransferNotInitiated();
        if (transfer.completed) revert TransferAlreadyCompleted();
        if (address(this).balance < transfer.amount) revert InsufficientBalance();
        
        // Pack signature for validation
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Create the message hash that was actually signed (Ethereum signed message format)
        bytes32 ethSignedHash = getEthSignedMessageHash(transfer.dataHash);
        
        // Verify signature from owner2 (supports both EOA and smart contract signatures)
        if (!_isValidSignatureFrom(owner2, ethSignedHash, signature)) {
            revert InvalidSignature();
        }
        
        transfer.completed = true;
        
        // Execute transfer
        (bool success, ) = transfer.to.call{value: transfer.amount}("");
        require(success, "Transfer failed");
        
        emit TransferCompleted(nonce, transfer.to, transfer.amount);
    }
    
    function getEthSignedMessageHash(bytes32 messageHash) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            messageHash
        ));
    }
    
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    function getMessageToSign(uint256 nonce) external view returns (bytes32) {
        PendingTransfer memory transfer = pendingTransfers[nonce];
        require(transfer.initiated, "Transfer not initiated");
        return transfer.dataHash;
    }
    
    /**
     * @dev Internal function to validate signatures from a specific signer (supports ERC-1271)
     * @param signer Address that should have signed the message
     * @param hash Hash of the data that was signed
     * @param signature Signature bytes
     * @return True if signature is valid from the specified signer
     */
    function _isValidSignatureFrom(address signer, bytes32 hash, bytes memory signature) internal view returns (bool) {
        // Use OpenZeppelin's SignatureChecker which handles both EOA and ERC-1271 signatures
        return SignatureChecker.isValidSignatureNow(signer, hash, signature);
    }

    /**
     * @dev ERC-1271 implementation: Validates signatures for this contract
     * @param hash Hash of the data that was signed
     * @param signature Signature bytes (65 bytes for ECDSA: r+s+v)
     * @return magicValue 0x1626ba7e if signature is valid, 0xffffffff otherwise
     */
    function isValidSignature(bytes32 hash, bytes memory signature) external view override returns (bytes4) {
        // Create the Ethereum signed message hash for consistent validation
        bytes32 ethSignedHash = getEthSignedMessageHash(hash);
        
        // Only allow owner2 to provide valid signatures for this contract
        return _isValidSignatureFrom(owner2, ethSignedHash, signature) ? MAGIC_VALUE : bytes4(0xffffffff);
    }
}
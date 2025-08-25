// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MultisigVault {
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
        
        // Verify signature from owner2
        bytes32 messageHash = getEthSignedMessageHash(transfer.dataHash);
        address signer = ecrecover(messageHash, v, r, s);
        
        if (signer != owner2) revert InvalidSignature();
        
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
}
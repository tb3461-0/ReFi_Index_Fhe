pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ReFiIndexFhe is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    bool public batchOpen;
    mapping(uint256 => euint32) public encryptedTotalEsgScore;
    mapping(uint256 => uint256) public submissionsInBatch;
    mapping(uint256 => mapping(address => bool)) public hasSubmittedToBatch;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event CooldownSecondsSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event EsgDataSubmitted(address indexed provider, uint256 indexed batchId, euint32 encryptedScore);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 totalEsgScore);

    error NotOwner();
    error NotProvider();
    error PausedError();
    error CooldownActive();
    error BatchClosedError();
    error AlreadySubmitted();
    error ReplayError();
    error StateMismatchError();
    error DecryptionFailedError();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedError();
        _;
    }

    modifier respectCooldown(address _address, mapping(address => uint256) storage _lastTime) {
        if (block.timestamp < _lastTime[_address] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        cooldownSeconds = 60; // Default cooldown
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        isProvider[provider] = false;
        emit ProviderRemoved(provider);
    }

    function setPaused(bool _paused) external onlyOwner {
        if (_paused) {
            paused = true;
            emit Paused(msg.sender);
        } else {
            paused = false;
            emit Unpaused(msg.sender);
        }
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        uint256 oldCooldownSeconds = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsSet(oldCooldownSeconds, newCooldownSeconds);
    }

    function openBatch() external onlyOwner whenNotPaused {
        currentBatchId++;
        batchOpen = true;
        submissionsInBatch[currentBatchId] = 0;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyOwner whenNotPaused {
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitEncryptedEsgScore(euint32 encryptedScore) external onlyProvider whenNotPaused respectCooldown(msg.sender, lastSubmissionTime) {
        if (!batchOpen) revert BatchClosedError();
        if (hasSubmittedToBatch[currentBatchId][msg.sender]) revert AlreadySubmitted();

        _initIfNeeded(encryptedScore);

        if (submissionsInBatch[currentBatchId] == 0) {
            encryptedTotalEsgScore[currentBatchId] = encryptedScore;
        } else {
            encryptedTotalEsgScore[currentBatchId] = encryptedTotalEsgScore[currentBatchId].add(encryptedScore);
        }
        submissionsInBatch[currentBatchId]++;
        hasSubmittedToBatch[currentBatchId][msg.sender] = true;
        lastSubmissionTime[msg.sender] = block.timestamp;

        emit EsgDataSubmitted(msg.sender, currentBatchId, encryptedScore);
    }

    function requestBatchTotalDecryption() external onlyOwner whenNotPaused respectCooldown(address(this), lastDecryptionRequestTime) {
        if (submissionsInBatch[currentBatchId] == 0) revert("No submissions to decrypt");

        euint32 memory totalScore = encryptedTotalEsgScore[currentBatchId];
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(totalScore);

        bytes32 stateHash = _hashCiphertexts(cts);

        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext({ batchId: currentBatchId, stateHash: stateHash, processed: false });
        lastDecryptionRequestTime[address(this)] = block.timestamp;

        emit DecryptionRequested(requestId, currentBatchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayError();

        euint32 memory currentTotalScore = encryptedTotalEsgScore[decryptionContexts[requestId].batchId];
        bytes32[] memory currentCts = new bytes32[](1);
        currentCts[0] = FHE.toBytes32(currentTotalScore);

        bytes32 currentStateHash = _hashCiphertexts(currentCts);
        if (currentStateHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatchError();
        }

        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert DecryptionFailedError();
        }

        uint256 totalEsgScore = abi.decode(cleartexts, (uint32));

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, decryptionContexts[requestId].batchId, totalEsgScore);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 x) internal {
        if (!FHE.isInitialized(x)) {
            FHE.asEuint32(0); // Initialize the FHE library if not already done
        }
    }

    function _requireInitialized(euint32 x) internal view {
        if (!FHE.isInitialized(x)) {
            revert("FHE not initialized");
        }
    }
}
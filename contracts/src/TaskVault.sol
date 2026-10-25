// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TaskVault
/// @notice Owner-funded, single-token vault with immutable task permissions.
/// @dev Preflight authorization stays read-only. Payment funding and every resolution are atomic.
/// A task hash identifies committed terms; it does not prove semantic task compliance.
contract TaskVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Mandate {
        bytes32 taskHash;
        address agent;
        address token;
        uint128 cap;
        uint128 reserved;
        uint128 settled;
        uint64 expiry;
        bool active;
    }

    /// @dev Durations in seconds from payment funding and agent acceptance respectively.
    /// An all-zero trustedDeliverableHash means no exact-byte deliverable commitment is configured.
    struct DeliveryTerms {
        uint64 deliveryWindow;
        uint64 challengeWindow;
        bytes32 trustedDeliverableHash;
    }

    enum PaymentStatus {
        NONE,
        FUNDED,
        SUBMITTED,
        ACCEPTED,
        COMPLETED,
        REJECTED,
        EXPIRED
    }

    struct Payment {
        bytes32 taskHash;
        bytes32 requestId;
        address agent;
        address provider;
        address token;
        uint128 amount;
        uint64 fundedAt;
        uint64 deliveryDeadline;
        uint64 reviewDeadline;
        uint64 challengeWindow;
        uint64 acceptedAt;
        uint64 challengeDeadline;
        PaymentStatus status;
        bytes32 expectedDeliverableHash;
        bytes32 deliverableHash;
    }

    uint64 public constant MIN_DELIVERY_WINDOW = 1 hours;
    uint64 public constant MAX_DELIVERY_WINDOW = 30 days;
    uint64 public constant MIN_CHALLENGE_WINDOW = 1 hours;
    uint64 public constant MAX_CHALLENGE_WINDOW = 30 days;
    uint64 public constant REVIEW_WINDOW = 2 days;
    uint256 public constant MAX_REJECTION_REASON_BYTES = 256;

    IERC20 public immutable paymentToken;

    /// @notice Sum of live escrow liabilities, in payment-token base units.
    /// @dev One immutable token: every live payment contributes once to this global liability total.
    uint256 public totalReserved;

    // No arbitrary accounting setters. Only atomic funding/finalization change these ledgers.
    mapping(bytes32 taskHash => Mandate) internal _mandates;
    mapping(bytes32 taskHash => DeliveryTerms) private _deliveryTerms;
    mapping(bytes32 taskHash => mapping(address provider => bool)) private _approvedProviders;
    mapping(bytes32 taskHash => address[]) private _providerLists;

    mapping(bytes32 paymentId => Payment) private _payments;

    error InvalidRequestId();
    error PaymentAlreadyExists(bytes32 paymentId);
    error PaymentNotFound(bytes32 paymentId);
    error InvalidPaymentState(bytes32 paymentId, PaymentStatus actual);
    error UnauthorizedProvider(address caller);
    error PaymentDeadlinePassed(bytes32 paymentId, uint64 deadline);
    error PaymentNotExpired(bytes32 paymentId, uint64 deadline);
    error ChallengeWindowOpen(bytes32 paymentId, uint64 deadline);
    error InvalidDeliverableHash();
    error DeliverableHashMismatch(bytes32 expected, bytes32 actual);
    error InvalidRejectionReason();
    error UnexpectedRecipientBalanceChange(
        address recipient, uint256 beforeBalance, uint256 afterBalance
    );

    event PaymentFunded(
        bytes32 indexed paymentId,
        bytes32 indexed taskHash,
        address indexed provider,
        address agent,
        uint128 amount,
        uint64 deliveryDeadline,
        uint64 reviewDeadline
    );
    event DeliverySubmitted(bytes32 indexed paymentId, bytes32 indexed deliverableHash);
    event DeliveryAccepted(bytes32 indexed paymentId, uint64 challengeDeadline);
    event PaymentRejected(
        bytes32 indexed paymentId, bytes32 indexed taskHash, address indexed owner, string reason
    );
    event PaymentCompleted(
        bytes32 indexed paymentId,
        bytes32 indexed taskHash,
        address indexed provider,
        uint128 amount
    );
    event PaymentExpired(bytes32 indexed paymentId, bytes32 indexed taskHash, uint128 amount);

    error UnsupportedToken(address token);
    error InvalidTaskHash();
    error MandateAlreadyExists(bytes32 taskHash);
    error MandateNotFound(bytes32 taskHash);
    error InvalidAgent(address agent);
    error InvalidCap();
    error InvalidExpiry(uint64 expiry);
    error InvalidDeliveryWindow();
    error InvalidChallengeWindow();
    error NoProviders();
    error InvalidProvider(address provider);
    error DuplicateProvider(address provider);
    error MandateInactive(bytes32 taskHash);
    error MandateExpired(bytes32 taskHash, uint64 expiry);
    error UnauthorizedAgent(address caller);
    error ProviderNotApproved(address provider);
    error ZeroAmount();
    error TaskCapExceeded(uint256 committed, uint256 requested, uint256 cap);
    error InsufficientAvailableFunds(uint256 available, uint256 requested);
    error VaultInsolvent(uint256 balance, uint256 reserved);
    error InvalidRecipient(address recipient);
    error UnexpectedTokenBalanceChange(uint256 beforeBalance, uint256 afterBalance);
    error OwnershipRenunciationDisabled();

    event MandateCreated(
        bytes32 indexed taskHash,
        address indexed agent,
        address indexed token,
        uint128 cap,
        uint64 expiry
    );
    event DeliveryTermsCreated(
        bytes32 indexed taskHash,
        uint64 deliveryWindow,
        uint64 challengeWindow,
        bytes32 trustedDeliverableHash
    );
    event ProviderApproved(bytes32 indexed taskHash, address indexed provider);
    event MandateRevoked(bytes32 indexed taskHash);
    event Deposited(address indexed owner, address indexed token, uint256 amount);
    event Withdrawn(
        address indexed owner, address indexed recipient, address indexed token, uint256 amount
    );

    /// @dev Approves exactly one conventional ERC-20 for the lifetime of this vault.
    constructor(address initialOwner, address approvedToken) Ownable(initialOwner) {
        if (approvedToken == address(0) || approvedToken.code.length == 0) {
            revert UnsupportedToken(approvedToken);
        }
        paymentToken = IERC20(approvedToken);
        // The token-global escrow liability ledger starts empty.
        totalReserved = 0;
    }

    /// @notice Create immutable permissions. Creation does not allocate or reserve funds.
    /// @dev taskHash can never be reused, including after revocation or expiry.
    function createMandate(
        bytes32 taskHash,
        address agent,
        address token,
        uint128 cap,
        uint64 expiry,
        address[] calldata providers,
        DeliveryTerms calldata terms
    ) external onlyOwner {
        if (taskHash == bytes32(0)) revert InvalidTaskHash();
        if (_mandates[taskHash].agent != address(0)) revert MandateAlreadyExists(taskHash);
        if (agent == address(0) || agent == address(this) || agent == owner()) {
            revert InvalidAgent(agent);
        }
        _requireSupportedToken(token);
        if (cap == 0) revert InvalidCap();
        if (expiry <= block.timestamp) revert InvalidExpiry(expiry);
        if (
            terms.deliveryWindow < MIN_DELIVERY_WINDOW || terms.deliveryWindow > MAX_DELIVERY_WINDOW
        ) {
            revert InvalidDeliveryWindow();
        }
        if (
            terms.challengeWindow < MIN_CHALLENGE_WINDOW
                || terms.challengeWindow > MAX_CHALLENGE_WINDOW
        ) {
            revert InvalidChallengeWindow();
        }
        if (providers.length == 0) revert NoProviders();

        for (uint256 i; i < providers.length; ++i) {
            _approveProvider(taskHash, providers[i]);
        }

        _mandates[taskHash] = Mandate({
            taskHash: taskHash,
            agent: agent,
            token: token,
            cap: cap,
            reserved: 0,
            settled: 0,
            expiry: expiry,
            active: true
        });
        _deliveryTerms[taskHash] = terms;
        emit MandateCreated(taskHash, agent, token, cap, expiry);
        emit DeliveryTermsCreated(
            taskHash, terms.deliveryWindow, terms.challengeWindow, terms.trustedDeliverableHash
        );
    }

    /// @notice Deactivate future authorizations without deleting terms or accounting history.
    /// @dev Existing payments retain all delivery, acceptance, rejection, timeout, and settlement paths.
    function revokeMandate(bytes32 taskHash) external onlyOwner {
        Mandate storage mandate = _getMandate(taskHash);
        if (!mandate.active) revert MandateInactive(taskHash);
        mandate.active = false;
        emit MandateRevoked(taskHash);
    }

    /// @notice Fund the vault from its owner, rejecting detected inexact incoming transfers.
    function deposit(address token, uint256 amount) external nonReentrant onlyOwner {
        _requireSupportedToken(token);
        if (amount == 0) revert ZeroAmount();
        uint256 beforeBalance = paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 afterBalance = paymentToken.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) {
            revert UnexpectedTokenBalanceChange(beforeBalance, afterBalance);
        }
        emit Deposited(msg.sender, token, amount);
    }

    /// @notice Owner may withdraw only unreserved funds, with exact vault debit and recipient credit.
    function withdraw(address token, address recipient, uint256 amount)
        external
        nonReentrant
        onlyOwner
    {
        _requireSupportedToken(token);
        if (recipient == address(0) || recipient == address(this)) {
            revert InvalidRecipient(recipient);
        }
        if (amount == 0) revert ZeroAmount();
        uint256 beforeBalance = paymentToken.balanceOf(address(this));
        uint256 available = _availableBalance(beforeBalance);
        if (amount > available) revert InsufficientAvailableFunds(available, amount);

        uint256 recipientBefore = paymentToken.balanceOf(recipient);

        // No liabilities are changed by an owner withdrawal. All checks precede the interaction.
        paymentToken.safeTransfer(recipient, amount);
        uint256 afterBalance = paymentToken.balanceOf(address(this));
        if (afterBalance != beforeBalance - amount) {
            revert UnexpectedTokenBalanceChange(beforeBalance, afterBalance);
        }
        uint256 recipientAfter = paymentToken.balanceOf(recipient);
        if (recipientAfter < recipientBefore || recipientAfter - recipientBefore != amount) {
            revert UnexpectedRecipientBalanceChange(recipient, recipientBefore, recipientAfter);
        }
        emit Withdrawn(msg.sender, recipient, token, amount);
    }

    /// @notice Reverts on invalid requests; true is a non-binding point-in-time check only.
    /// @dev Does not consume budget, lock funds, issue an authorization ticket, or pay a provider.
    function checkAuthorization(bytes32 taskHash, address provider, address token, uint256 amount)
        external
        view
        nonReentrantView
        returns (bool)
    {
        _authorizePayment(taskHash, provider, token, amount);
        return true;
    }

    /// @notice Reserve and create a payment atomically. No token leaves the vault.
    /// @dev A nonzero client request ID is single-use for this task/agent/vault/chain domain.
    function requestPayment(
        bytes32 taskHash,
        bytes32 requestId,
        address provider,
        address token,
        uint256 amount
    ) external nonReentrant returns (bytes32 paymentId) {
        if (requestId == bytes32(0)) revert InvalidRequestId();
        paymentId = computePaymentId(taskHash, msg.sender, requestId);
        if (_payments[paymentId].status != PaymentStatus.NONE) {
            revert PaymentAlreadyExists(paymentId);
        }
        Mandate storage mandate = _authorizePayment(taskHash, provider, token, amount);
        DeliveryTerms storage terms = _deliveryTerms[taskHash];

        uint64 deliveryDeadline = SafeCast.toUint64(block.timestamp + terms.deliveryWindow);
        uint64 reviewDeadline = SafeCast.toUint64(uint256(deliveryDeadline) + REVIEW_WINDOW);
        // Ensure acceptance even at its latest permitted time cannot overflow the challenge deadline.
        SafeCast.toUint64(uint256(reviewDeadline) + terms.challengeWindow);

        Payment storage payment = _payments[paymentId];
        payment.taskHash = taskHash;
        payment.requestId = requestId;
        payment.agent = mandate.agent;
        payment.provider = provider;
        payment.token = mandate.token;
        payment.amount = SafeCast.toUint128(amount);
        payment.fundedAt = SafeCast.toUint64(block.timestamp);
        payment.deliveryDeadline = deliveryDeadline;
        payment.reviewDeadline = reviewDeadline;
        payment.challengeWindow = terms.challengeWindow;
        payment.expectedDeliverableHash = terms.trustedDeliverableHash;
        payment.status = PaymentStatus.FUNDED;
        mandate.reserved += payment.amount;
        totalReserved += amount;
        emit PaymentFunded(
            paymentId,
            taskHash,
            provider,
            mandate.agent,
            payment.amount,
            deliveryDeadline,
            reviewDeadline
        );
    }

    /// @notice Only the snapshotted provider may commit delivery, strictly before its cutoff.
    /// @dev Hash matching is byte-commitment matching, never semantic verification.
    function submitDelivery(bytes32 paymentId, bytes32 deliverableHash) external nonReentrant {
        Payment storage payment = _getPayment(paymentId);
        _requirePaymentState(paymentId, payment, PaymentStatus.FUNDED);
        if (msg.sender != payment.provider) revert UnauthorizedProvider(msg.sender);
        if (block.timestamp >= payment.deliveryDeadline) {
            revert PaymentDeadlinePassed(paymentId, payment.deliveryDeadline);
        }
        if (deliverableHash == bytes32(0)) revert InvalidDeliverableHash();
        if (
            payment.expectedDeliverableHash != bytes32(0)
                && deliverableHash != payment.expectedDeliverableHash
        ) {
            revert DeliverableHashMismatch(payment.expectedDeliverableHash, deliverableHash);
        }
        payment.deliverableHash = deliverableHash;
        payment.status = PaymentStatus.SUBMITTED;
        emit DeliverySubmitted(paymentId, deliverableHash);
    }

    /// @notice The original agent may accept before the review cutoff, even after mandate revocation/expiry.
    /// @dev Starts the full immutable challenge duration; acceptance cannot shorten or bypass it.
    function acceptDelivery(bytes32 paymentId) external nonReentrant {
        Payment storage payment = _getPayment(paymentId);
        _requirePaymentState(paymentId, payment, PaymentStatus.SUBMITTED);
        if (msg.sender != payment.agent) revert UnauthorizedAgent(msg.sender);
        if (block.timestamp >= payment.reviewDeadline) {
            revert PaymentDeadlinePassed(paymentId, payment.reviewDeadline);
        }
        payment.acceptedAt = SafeCast.toUint64(block.timestamp);
        payment.challengeDeadline = SafeCast.toUint64(block.timestamp + payment.challengeWindow);
        payment.status = PaymentStatus.ACCEPTED;
        emit DeliveryAccepted(paymentId, payment.challengeDeadline);
    }

    /// @notice The current owner is the trusted MVP dispute authority, with unilateral timely rejection.
    /// @dev FUNDED/SUBMITTED: before delivery/review cutoff. ACCEPTED: before challenge cutoff.
    /// Reason is public, nonempty, and at most 256 bytes. Rejection refunds into vault liquidity.
    function rejectPayment(bytes32 paymentId, string calldata reason)
        external
        nonReentrant
        onlyOwner
    {
        Payment storage payment = _getPayment(paymentId);
        uint64 deadline;
        if (payment.status == PaymentStatus.FUNDED) deadline = payment.deliveryDeadline;
        else if (payment.status == PaymentStatus.SUBMITTED) deadline = payment.reviewDeadline;
        else if (payment.status == PaymentStatus.ACCEPTED) deadline = payment.challengeDeadline;
        else revert InvalidPaymentState(paymentId, payment.status);
        if (block.timestamp >= deadline) revert PaymentDeadlinePassed(paymentId, deadline);
        if (bytes(reason).length == 0 || bytes(reason).length > MAX_REJECTION_REASON_BYTES) {
            revert InvalidRejectionReason();
        }
        payment.status = PaymentStatus.REJECTED;
        _releaseReservation(payment);
        emit PaymentRejected(paymentId, payment.taskHash, msg.sender, reason);
    }

    /// @notice Anyone may settle an accepted payment at/after its challenge cutoff to its fixed provider.
    /// @dev Effects precede transfer. Exact sender debit and recipient credit are mandatory; any failure rolls back.
    function settlePayment(bytes32 paymentId) external nonReentrant {
        Payment storage payment = _getPayment(paymentId);
        _requirePaymentState(paymentId, payment, PaymentStatus.ACCEPTED);
        if (block.timestamp < payment.challengeDeadline) {
            revert ChallengeWindowOpen(paymentId, payment.challengeDeadline);
        }
        uint256 vaultBefore = paymentToken.balanceOf(address(this));
        _availableBalance(vaultBefore); // Fail closed if the token has invalidated aggregate backing.
        uint256 recipientBefore = paymentToken.balanceOf(payment.provider);

        payment.status = PaymentStatus.COMPLETED;
        _releaseReservation(payment);
        _mandates[payment.taskHash].settled += payment.amount;
        paymentToken.safeTransfer(payment.provider, payment.amount);
        uint256 vaultAfter = paymentToken.balanceOf(address(this));
        uint256 recipientAfter = paymentToken.balanceOf(payment.provider);
        if (vaultAfter != vaultBefore - payment.amount) {
            revert UnexpectedTokenBalanceChange(vaultBefore, vaultAfter);
        }
        if (recipientAfter < recipientBefore || recipientAfter - recipientBefore != payment.amount)
        {
            revert UnexpectedRecipientBalanceChange(
                payment.provider, recipientBefore, recipientAfter
            );
        }
        emit PaymentCompleted(paymentId, payment.taskHash, payment.provider, payment.amount);
    }

    /// @notice Permissionless refund at delivery/review timeout. ACCEPTED has no timeout-refund path.
    function refundExpired(bytes32 paymentId) external nonReentrant {
        Payment storage payment = _getPayment(paymentId);
        uint64 deadline;
        if (payment.status == PaymentStatus.FUNDED) deadline = payment.deliveryDeadline;
        else if (payment.status == PaymentStatus.SUBMITTED) deadline = payment.reviewDeadline;
        else revert InvalidPaymentState(paymentId, payment.status);
        if (block.timestamp < deadline) revert PaymentNotExpired(paymentId, deadline);
        payment.status = PaymentStatus.EXPIRED;
        _releaseReservation(payment);
        emit PaymentExpired(paymentId, payment.taskHash, payment.amount);
    }

    function getPayment(bytes32 paymentId) external view nonReentrantView returns (Payment memory) {
        return _getPayment(paymentId);
    }

    /// @notice Deterministic domain-separated ID. Terminal records remain permanently single-use.
    function computePaymentId(bytes32 taskHash, address agent, bytes32 requestId)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, address(this), taskHash, agent, requestId));
    }

    /// @notice Token-address view of the existing single-token global liability counter.
    function globalReserved(address token) external view nonReentrantView returns (uint256) {
        _requireSupportedToken(token);
        return totalReserved;
    }

    function getMandate(bytes32 taskHash) external view returns (Mandate memory) {
        return _getMandate(taskHash);
    }

    function getDeliveryTerms(bytes32 taskHash) external view returns (DeliveryTerms memory) {
        _getMandate(taskHash);
        return _deliveryTerms[taskHash];
    }

    function getApprovedProviders(bytes32 taskHash) external view returns (address[] memory) {
        _getMandate(taskHash);
        return _providerLists[taskHash];
    }

    /// @notice False for a missing task. Historical membership remains true after revocation.
    function isProviderApproved(bytes32 taskHash, address provider) external view returns (bool) {
        return _approvedProviders[taskHash][provider];
    }

    function availableBalance() external view nonReentrantView returns (uint256) {
        return _availableBalance(paymentToken.balanceOf(address(this)));
    }

    /// @dev Two-step transfer remains available; renunciation would orphan owner-controlled funds.
    function renounceOwnership() public view override onlyOwner {
        revert OwnershipRenunciationDisabled();
    }

    /// @dev Atomic escrow funding calls this and updates both ledgers in one
    /// nonReentrant transaction before any external interaction. No state changes occur here.
    function _authorizePayment(bytes32 taskHash, address provider, address token, uint256 amount)
        internal
        view
        returns (Mandate storage mandate)
    {
        mandate = _getMandate(taskHash);
        if (!mandate.active) revert MandateInactive(taskHash);
        if (block.timestamp >= mandate.expiry) revert MandateExpired(taskHash, mandate.expiry);
        if (msg.sender != mandate.agent) revert UnauthorizedAgent(msg.sender);
        if (!_approvedProviders[taskHash][provider]) revert ProviderNotApproved(provider);
        if (token != mandate.token) revert UnsupportedToken(token);
        if (amount == 0) revert ZeroAmount();

        // Widen counters and subtract headroom to avoid overflow on arbitrary uint256 requests.
        uint256 committed = uint256(mandate.reserved) + uint256(mandate.settled);
        if (committed > mandate.cap || amount > uint256(mandate.cap) - committed) {
            revert TaskCapExceeded(committed, amount, mandate.cap);
        }
        uint256 available = _availableBalance(paymentToken.balanceOf(address(this)));
        if (amount > available) revert InsufficientAvailableFunds(available, amount);
    }

    function _getPayment(bytes32 paymentId) private view returns (Payment storage payment) {
        payment = _payments[paymentId];
        if (payment.status == PaymentStatus.NONE) revert PaymentNotFound(paymentId);
    }

    function _requirePaymentState(
        bytes32 paymentId,
        Payment storage payment,
        PaymentStatus expected
    ) private view {
        if (payment.status != expected) {
            revert InvalidPaymentState(paymentId, payment.status);
        }
    }

    /// @dev Release once, into free vault liquidity. Historical settled is not changed here.
    function _releaseReservation(Payment storage payment) private {
        _mandates[payment.taskHash].reserved -= payment.amount;
        totalReserved -= payment.amount;
    }

    function _getMandate(bytes32 taskHash) internal view returns (Mandate storage mandate) {
        mandate = _mandates[taskHash];
        if (mandate.agent == address(0)) revert MandateNotFound(taskHash);
    }

    /// @dev Creation-only snapshot validation; no external provider mutation entry point exists.
    function _approveProvider(bytes32 taskHash, address provider) private {
        if (provider == address(0) || provider == address(this)) revert InvalidProvider(provider);
        if (_approvedProviders[taskHash][provider]) revert DuplicateProvider(provider);
        _approvedProviders[taskHash][provider] = true;
        _providerLists[taskHash].push(provider);
        emit ProviderApproved(taskHash, provider);
    }

    function _requireSupportedToken(address token) private view {
        if (token != address(paymentToken)) revert UnsupportedToken(token);
    }

    function _availableBalance(uint256 balance) private view returns (uint256) {
        if (totalReserved > balance) revert VaultInsolvent(balance, totalReserved);
        return balance - totalReserved;
    }
}

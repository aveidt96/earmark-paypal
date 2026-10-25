// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;
import { TaskVault } from "../../src/TaskVault.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import { Vm } from "./VaultTestBase.sol";

/// @dev Stateful actor owns a production vault. No accounting setters/storage writes are used.
contract EscrowHandler {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address public constant AGENT = address(0xA11);
    address public constant PROVIDER = address(0xB11);
    bytes32 public constant HASH = keccak256("invariant deliverable");
    TaskVault public immutable vault;
    MockUSDC public immutable token;
    bytes32[] public tasks;
    bytes32[] public payments;
    mapping(bytes32 => bytes32) public immutablePaymentHash;
    mapping(bytes32 => bytes32) public terminalHash;
    mapping(bytes32 => bytes32) public immutableMandateHash;
    uint256 public deposited;
    uint256 public donated;
    uint256 public withdrawn;
    uint256 public paid;
    uint256 public successfulRequests;
    uint256 public successfulResolutions;
    uint256 private _nonce;

    constructor() {
        token = new MockUSDC();
        vault = new TaskVault(address(this), address(token));
        token.mint(address(this), 1000e6);
        token.approve(address(vault), type(uint256).max);
        vault.deposit(address(token), 400e6);
        deposited = 400e6;
        for (uint256 i; i < 3; ++i) {
            _create();
        }
        for (uint256 i; i < 3; ++i) {
            bytes32 id = _request(tasks[i], 10e6);
            if (i > 0) {
                vm.prank(PROVIDER);
                vault.submitDelivery(id, HASH);
            }
            if (i == 2) {
                vm.prank(AGENT);
                vault.acceptDelivery(id);
            }
        }
    }

    function taskCount() external view returns (uint256) {
        return tasks.length;
    }

    function paymentCount() external view returns (uint256) {
        return payments.length;
    }

    function paymentTermsHash(TaskVault.Payment memory p) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                p.taskHash,
                p.requestId,
                p.agent,
                p.provider,
                p.token,
                p.amount,
                p.fundedAt,
                p.deliveryDeadline,
                p.reviewDeadline,
                p.challengeWindow,
                p.expectedDeliverableHash
            )
        );
    }

    function mandateTermsHash(bytes32 task) public view returns (bytes32) {
        TaskVault.Mandate memory m = vault.getMandate(task);
        return keccak256(
            abi.encode(
                m.taskHash,
                m.agent,
                m.token,
                m.cap,
                m.expiry,
                vault.getDeliveryTerms(task),
                vault.getApprovedProviders(task)
            )
        );
    }

    function request(uint256 seed, uint128 raw) external {
        if (payments.length >= 256) return;
        bytes32 task = tasks[seed % tasks.length];
        TaskVault.Mandate memory m = vault.getMandate(task);
        if (!m.active || block.timestamp >= m.expiry) return;
        uint256 limit = uint256(m.cap) - m.reserved - m.settled;
        uint256 available = vault.availableBalance();
        if (available < limit) limit = available;
        if (limit == 0) return;
        _request(task, uint256(raw) % limit + 1);
    }

    function submit(uint256 seed) external {
        bytes32 id = payments[seed % payments.length];
        TaskVault.Payment memory p = vault.getPayment(id);
        if (p.status != TaskVault.PaymentStatus.FUNDED || block.timestamp >= p.deliveryDeadline) {
            return;
        }
        vm.prank(PROVIDER);
        vault.submitDelivery(id, HASH);
    }

    function accept(uint256 seed) external {
        bytes32 id = payments[seed % payments.length];
        TaskVault.Payment memory p = vault.getPayment(id);
        if (p.status != TaskVault.PaymentStatus.SUBMITTED || block.timestamp >= p.reviewDeadline) {
            return;
        }
        vm.prank(AGENT);
        vault.acceptDelivery(id);
    }

    function reject(uint256 seed) external {
        bytes32 id = payments[seed % payments.length];
        TaskVault.Payment memory p = vault.getPayment(id);
        uint256 deadline;
        if (p.status == TaskVault.PaymentStatus.FUNDED) deadline = p.deliveryDeadline;
        else if (p.status == TaskVault.PaymentStatus.SUBMITTED) deadline = p.reviewDeadline;
        else if (p.status == TaskVault.PaymentStatus.ACCEPTED) deadline = p.challengeDeadline;
        else return;
        if (block.timestamp >= deadline) return;
        vault.rejectPayment(id, "stateful owner dispute");
        _terminal(id);
    }

    function settle(uint256 seed) external {
        bytes32 id = payments[seed % payments.length];
        TaskVault.Payment memory p = vault.getPayment(id);
        if (p.status != TaskVault.PaymentStatus.ACCEPTED || block.timestamp < p.challengeDeadline) {
            return;
        }
        vault.settlePayment(id);
        paid += p.amount;
        _terminal(id);
    }

    function refund(uint256 seed) external {
        bytes32 id = payments[seed % payments.length];
        TaskVault.Payment memory p = vault.getPayment(id);
        uint256 deadline;
        if (p.status == TaskVault.PaymentStatus.FUNDED) deadline = p.deliveryDeadline;
        else if (p.status == TaskVault.PaymentStatus.SUBMITTED) deadline = p.reviewDeadline;
        else return;
        if (block.timestamp < deadline) return;
        vault.refundExpired(id);
        _terminal(id);
    }

    function advanceTime(uint32 raw) external {
        vm.warp(block.timestamp + uint256(raw) % (3 days) + 1);
    }

    function deposit(uint128 raw) external {
        uint256 balance = token.balanceOf(address(this));
        if (balance == 0) return;
        uint256 amount = uint256(raw) % balance + 1;
        vault.deposit(address(token), amount);
        deposited += amount;
    }

    function withdraw(uint128 raw) external {
        uint256 available = vault.availableBalance();
        if (available == 0) return;
        uint256 amount = uint256(raw) % available + 1;
        vault.withdraw(address(token), address(this), amount);
        withdrawn += amount;
    }

    function donate(uint128 raw) external {
        uint256 amount = uint256(raw) % 20e6 + 1;
        token.mint(address(vault), amount);
        donated += amount;
    }

    function revoke(uint256 seed) external {
        bytes32 task = tasks[seed % tasks.length];
        if (vault.getMandate(task).active) vault.revokeMandate(task);
    }

    function create() external {
        if (tasks.length < 8) _create();
    }

    function _create() private {
        bytes32 task = keccak256(abi.encode("stateful task", tasks.length));
        address[] memory providers = new address[](1);
        providers[0] = PROVIDER;
        vault.createMandate(
            task,
            AGENT,
            address(token),
            100e6,
            uint64(block.timestamp + 90 days),
            providers,
            TaskVault.DeliveryTerms(1 days, 1 hours, HASH)
        );
        tasks.push(task);
        immutableMandateHash[task] = mandateTermsHash(task);
    }

    function _request(bytes32 task, uint256 amount) private returns (bytes32 id) {
        vm.prank(AGENT);
        id = vault.requestPayment(task, bytes32(++_nonce), PROVIDER, address(token), amount);
        payments.push(id);
        immutablePaymentHash[id] = paymentTermsHash(vault.getPayment(id));
        ++successfulRequests;
    }

    function _terminal(bytes32 id) private {
        require(terminalHash[id] == bytes32(0), "resolved twice");
        terminalHash[id] = keccak256(abi.encode(vault.getPayment(id)));
        ++successfulResolutions;
    }

    /// @dev Not a fuzz target. Demonstrates every remaining escrow has a terminal exit under token assumptions.
    function resolveAll() external {
        uint256 latest = block.timestamp;
        for (uint256 i; i < payments.length; ++i) {
            TaskVault.Payment memory p = vault.getPayment(payments[i]);
            uint256 deadline = p.status == TaskVault.PaymentStatus.ACCEPTED
                ? p.challengeDeadline
                : p.reviewDeadline;
            if (deadline > latest) latest = deadline;
        }
        vm.warp(latest);
        for (uint256 i; i < payments.length; ++i) {
            bytes32 id = payments[i];
            TaskVault.Payment memory p = vault.getPayment(id);
            if (p.status == TaskVault.PaymentStatus.ACCEPTED) {
                vault.settlePayment(id);
                paid += p.amount;
                _terminal(id);
            } else if (
                p.status == TaskVault.PaymentStatus.FUNDED
                    || p.status == TaskVault.PaymentStatus.SUBMITTED
            ) {
                vault.refundExpired(id);
                _terminal(id);
            }
        }
    }
}

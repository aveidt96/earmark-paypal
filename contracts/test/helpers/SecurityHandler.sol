// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;
import { TaskVault } from "../../src/TaskVault.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import { Vm } from "./VaultTestBase.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Production-API adversarial actor. Financial state is never seeded or overwritten.
contract SecurityHandler {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address public constant OUTSIDER = address(0xBAD);
    address public constant TREASURY = address(0xD00D);
    bytes32 public constant HASH = keccak256("security expected bytes");
    TaskVault public immutable vault;
    MockUSDC public immutable token;
    address[3] public owners;
    address[3] public agents;
    address[3] public providers;
    address public expectedOwner;
    address public expectedPending;
    bytes32[] public tasks;
    bytes32[] public payments;
    mapping(bytes32 => uint256) public taskIndex;
    mapping(bytes32 => bytes32) public taskTerms;
    mapping(bytes32 => bytes32) public paymentTerms;
    mapping(bytes32 => bytes32) public terminalHash;
    mapping(address => uint256) public paidTo;
    uint256 public deposited;
    uint256 public donated;
    uint256 public withdrawn;
    uint256 public paid;
    uint256 public resolved;
    uint256 public calls;
    uint256 public skipped;
    uint256 public requests;
    uint256 public submissions;
    uint256 public acceptances;
    uint256 public settlements;
    uint256 public rejections;
    uint256 public refunds;
    uint256 public expectedFailures;
    uint256 public nominations;
    uint256 public ownerAcceptances;
    uint256 public cancellations;
    uint256 public revocations;
    uint256 public cycles;
    uint256 public deposits;
    uint256 public withdrawals;
    uint256 public donations;
    uint256 public creations;
    uint256 public advances;
    uint256 private nonce;

    constructor() {
        token = new MockUSDC();
        vault = new TaskVault(address(this), address(token));
        owners = [address(this), address(0xC002), address(0xC003)];
        agents = [address(0xA001), address(0xA002), address(0xA003)];
        providers = [address(0xB001), address(0xB002), address(0xB003)];
        expectedOwner = address(this);
        for (uint256 i; i < 3; ++i) {
            token.mint(owners[i], 1000e6);
            vm.prank(owners[i]);
            token.approve(address(vault), type(uint256).max);
        }
        vault.deposit(address(token), 250e6);
        deposited = 250e6;
        for (uint256 i; i < 4; ++i) {
            _create(i);
            bytes32 id = _fund(i, 1e6, i);
            if (i == 1 || i == 2) _submit(id);
            if (i == 2) _accept(id);
        }
        // Separate deterministic fixture setup from genuinely generated-action coverage.
        requests = 0;
        submissions = 0;
        acceptances = 0;
        creations = 0;
    }

    function taskCount() external view returns (uint256) {
        return tasks.length;
    }

    function paymentCount() external view returns (uint256) {
        return payments.length;
    }

    function termsHash(TaskVault.Payment memory p) public pure returns (bytes32) {
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

    function taskHash(bytes32 task) public view returns (bytes32) {
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

    function fund(uint256 seed, uint128 raw, uint8 providerSeed) external {
        ++calls;
        uint256 index = _eligible(seed);
        if (index == type(uint256).max || _fund(index, raw, providerSeed) == bytes32(0)) ++skipped;
    }

    function progress(uint256 seed) external {
        ++calls;
        for (uint256 i; i < payments.length; ++i) {
            bytes32 id = payments[addmod(seed, i, payments.length)];
            TaskVault.Payment memory p = vault.getPayment(id);
            if (p.status == TaskVault.PaymentStatus.FUNDED) {
                if (block.timestamp >= p.deliveryDeadline) _refund(id);
                else _submit(id);
                return;
            }
            if (p.status == TaskVault.PaymentStatus.SUBMITTED) {
                if (block.timestamp >= p.reviewDeadline) _refund(id);
                else _accept(id);
                return;
            }
            if (p.status == TaskVault.PaymentStatus.ACCEPTED) {
                if (block.timestamp < p.challengeDeadline) vm.warp(p.challengeDeadline);
                _settle(id);
                return;
            }
        }
        uint256 index = _eligible(seed);
        if (index == type(uint256).max || _fund(index, uint128(seed), seed) == bytes32(0)) {
            ++skipped;
        }
    }

    /// @dev Success-focused cycles are mixed with independent interleaving and adversarial operations.
    function cycle(uint256 seed, uint128 raw, uint8 outcome) external {
        ++calls;
        uint256 index = _eligible(seed);
        if (index == type(uint256).max) {
            if (tasks.length >= 12) {
                ++skipped;
                return;
            }
            _create(seed);
            index = tasks.length - 1;
        }
        bytes32 id = _fund(index, raw, seed);
        if (id == bytes32(0)) {
            ++skipped;
            return;
        }
        ++cycles;
        outcome %= 4;
        if (outcome == 0) {
            _submit(id);
            _accept(id);
            vm.warp(vault.getPayment(id).challengeDeadline);
            _settle(id);
        }
        if (outcome == 1) {
            _submit(id);
            _accept(id);
            _reject(id);
        }
        if (outcome == 2) {
            vm.warp(vault.getPayment(id).deliveryDeadline);
            _refund(id);
        }
        if (outcome == 3) {
            _submit(id);
            vm.warp(vault.getPayment(id).reviewDeadline);
            _refund(id);
        }
    }

    function reject(uint256 seed) external {
        ++calls;
        for (uint256 i; i < payments.length; ++i) {
            bytes32 id = payments[addmod(seed, i, payments.length)];
            TaskVault.Payment memory p = vault.getPayment(id);
            uint64 deadline = p.status == TaskVault.PaymentStatus.FUNDED
                ? p.deliveryDeadline
                : p.status == TaskVault.PaymentStatus.SUBMITTED
                    ? p.reviewDeadline
                    : p.status == TaskVault.PaymentStatus.ACCEPTED ? p.challengeDeadline : 0;
            if (block.timestamp < deadline) {
                _reject(id);
                return;
            }
        }
        ++skipped;
    }

    function elapse(uint256 seed, uint8 phase) external {
        ++calls;
        TaskVault.Payment memory p = vault.getPayment(payments[seed % payments.length]);
        uint256 deadline;
        uint256 choice = (seed / payments.length) % 4;
        if (choice == 0) deadline = p.deliveryDeadline;
        if (choice == 1) deadline = p.reviewDeadline;
        if (choice == 2) {
            deadline = p.challengeDeadline == 0 ? p.reviewDeadline : p.challengeDeadline;
        }
        if (choice == 3) deadline = vault.getMandate(p.taskHash).expiry;
        uint256 target = deadline - 1 + phase % 3;
        if (target > block.timestamp) {
            vm.warp(target);
            ++advances;
        } else {
            ++skipped;
        }
    }

    function deposit(uint128 raw) external {
        ++calls;
        uint256 balance = token.balanceOf(vault.owner());
        if (balance == 0) {
            ++skipped;
            return;
        }
        uint256 amount = uint256(raw) % balance + 1;
        vm.prank(vault.owner());
        vault.deposit(address(token), amount);
        deposited += amount;
        ++deposits;
    }

    function withdraw(uint128 raw) external {
        ++calls;
        uint256 available = vault.availableBalance();
        if (available == 0) {
            ++skipped;
            return;
        }
        uint256 amount = uint256(raw) % available + 1;
        vm.prank(vault.owner());
        vault.withdraw(address(token), TREASURY, amount);
        withdrawn += amount;
        ++withdrawals;
    }

    function donate(uint128 raw) external {
        ++calls;
        uint256 amount = uint256(raw) % 20e6 + 1;
        token.mint(OUTSIDER, amount);
        vm.prank(OUTSIDER);
        token.transfer(address(vault), amount);
        donated += amount;
        ++donations;
    }

    function revoke(uint256 seed) external {
        ++calls;
        bytes32 task = tasks[seed % tasks.length];
        if (!vault.getMandate(task).active) {
            ++skipped;
            return;
        }
        vm.prank(vault.owner());
        vault.revokeMandate(task);
        ++revocations;
    }

    function create(uint256 seed) external {
        ++calls;
        if (tasks.length >= 12) {
            ++skipped;
            return;
        }
        _create(seed);
    }

    function ownership(uint256 seed, uint8 operation) external {
        ++calls;
        operation %= 3;
        if (operation == 0) {
            expectedPending = owners[seed % 3];
            vm.prank(vault.owner());
            vault.transferOwnership(expectedPending);
            ++nominations;
        }
        if (operation == 1) {
            if (expectedPending == address(0)) {
                ++skipped;
                return;
            }
            address next = expectedPending;
            vm.prank(next);
            vault.acceptOwnership();
            expectedOwner = next;
            expectedPending = address(0);
            ++ownerAcceptances;
        }
        if (operation == 2) {
            vm.prank(vault.owner());
            vault.transferOwnership(address(0));
            expectedPending = address(0);
            ++cancellations;
        }
    }

    function attack(uint256 seed) external {
        ++calls;
        bytes32 id = payments[seed % payments.length];
        TaskVault.Payment memory p = vault.getPayment(id);
        bytes memory payload;
        bytes4 expected;
        address caller = OUTSIDER;
        uint256 mode = (seed / payments.length) % 8;
        if (mode == 0) {
            payload = abi.encodeCall(vault.withdraw, (address(token), OUTSIDER, 1));
            expected = Ownable.OwnableUnauthorizedAccount.selector;
        }
        if (mode == 1) {
            payload = abi.encodeCall(vault.transferOwnership, (OUTSIDER));
            expected = Ownable.OwnableUnauthorizedAccount.selector;
        }
        if (mode == 2) {
            payload = abi.encodeCall(vault.submitDelivery, (id, HASH));
            expected = p.status == TaskVault.PaymentStatus.FUNDED
                ? TaskVault.UnauthorizedProvider.selector
                : TaskVault.InvalidPaymentState.selector;
        }
        if (mode == 3) {
            payload = abi.encodeCall(vault.acceptDelivery, (id));
            expected = p.status == TaskVault.PaymentStatus.SUBMITTED
                ? TaskVault.UnauthorizedAgent.selector
                : TaskVault.InvalidPaymentState.selector;
        }
        if (mode == 4) {
            payload = abi.encodeCall(vault.rejectPayment, (id, "untrusted dispute"));
            expected = Ownable.OwnableUnauthorizedAccount.selector;
        }
        if (mode == 5) {
            payload = abi.encodeCall(
                vault.requestPayment, (p.taskHash, p.requestId, p.provider, p.token, p.amount)
            );
            caller = p.agent;
            expected = TaskVault.PaymentAlreadyExists.selector;
        }
        if (mode == 6) {
            payload = abi.encodeCall(vault.revokeMandate, (p.taskHash));
            expected = Ownable.OwnableUnauthorizedAccount.selector;
        }
        if (mode == 7) {
            payload = abi.encodeWithSignature("execute(address,bytes)", address(token), bytes(""));
            expected = bytes4(0);
        }
        bytes32 beforeHash = digest();
        vm.prank(caller);
        (bool ok, bytes memory reason) = address(vault).call(payload);
        require(!ok && bytes4(reason) == expected, "unexpected adversarial success/revert");
        require(digest() == beforeHash, "adversarial call mutated state");
        ++expectedFailures;
    }

    function digest() public view returns (bytes32 result) {
        result = keccak256(
            abi.encode(
                vault.totalReserved(),
                token.balanceOf(address(vault)),
                vault.owner(),
                vault.pendingOwner(),
                token.balanceOf(TREASURY)
            )
        );
        for (uint256 i; i < 3; ++i) {
            result = keccak256(abi.encode(result, token.balanceOf(providers[i])));
        }
        for (uint256 i; i < tasks.length; ++i) {
            result = keccak256(abi.encode(result, vault.getMandate(tasks[i])));
        }
        for (uint256 i; i < payments.length; ++i) {
            result = keccak256(abi.encode(result, vault.getPayment(payments[i])));
        }
    }

    function _eligible(uint256 seed) private view returns (uint256) {
        for (uint256 i; i < tasks.length; ++i) {
            uint256 index = addmod(seed, i, tasks.length);
            TaskVault.Mandate memory m = vault.getMandate(tasks[index]);
            if (m.active && block.timestamp < m.expiry && uint256(m.reserved) + m.settled < m.cap) {
                return index;
            }
        }
        return type(uint256).max;
    }

    function _create(uint256 seed) private {
        bytes32 task = keccak256(abi.encode("security mandate", tasks.length));
        address[] memory allowed = new address[](2);
        allowed[0] = providers[seed % 3];
        allowed[1] = providers[addmod(seed, 1, 3)];
        uint64 delivery = uint64(1 hours + seed % (3 days));
        uint64 challenge = uint64(1 hours + (seed / 3) % (2 days));
        vm.prank(vault.owner());
        vault.createMandate(
            task,
            agents[seed % 3],
            address(token),
            uint128((100 + seed % 100) * 1e6),
            uint64(block.timestamp + (3 + seed % 28) * 1 days),
            allowed,
            TaskVault.DeliveryTerms(delivery, challenge, seed % 2 == 0 ? HASH : bytes32(0))
        );
        taskIndex[task] = tasks.length;
        tasks.push(task);
        taskTerms[task] = taskHash(task);
        ++creations;
    }

    function _fund(uint256 index, uint128 raw, uint256 providerSeed) private returns (bytes32 id) {
        if (payments.length >= 256) return bytes32(0);
        bytes32 task = tasks[index];
        TaskVault.Mandate memory m = vault.getMandate(task);
        uint256 limit = uint256(m.cap) - m.reserved - m.settled;
        uint256 available = vault.availableBalance();
        if (available < limit) limit = available;
        if (limit > 15e6) limit = 15e6;
        if (limit == 0) return bytes32(0);
        address[] memory allowed = vault.getApprovedProviders(task);
        vm.prank(m.agent);
        id = vault.requestPayment(
            task,
            bytes32(++nonce),
            allowed[providerSeed % allowed.length],
            address(token),
            uint256(raw) % limit + 1
        );
        payments.push(id);
        paymentTerms[id] = termsHash(vault.getPayment(id));
        ++requests;
    }

    function _submit(bytes32 id) private {
        TaskVault.Payment memory p = vault.getPayment(id);
        bytes32 commitment = p.expectedDeliverableHash == 0
            ? keccak256(abi.encode("provider untrusted claim", id))
            : p.expectedDeliverableHash;
        vm.prank(p.provider);
        vault.submitDelivery(id, commitment);
        ++submissions;
    }

    function _accept(bytes32 id) private {
        vm.prank(vault.getPayment(id).agent);
        vault.acceptDelivery(id);
        ++acceptances;
    }

    function _reject(bytes32 id) private {
        vm.prank(vault.owner());
        vault.rejectPayment(id, "trusted owner rejects");
        ++rejections;
        _terminal(id);
    }

    function _refund(bytes32 id) private {
        vm.prank(OUTSIDER);
        vault.refundExpired(id);
        ++refunds;
        _terminal(id);
    }

    function _settle(bytes32 id) private {
        TaskVault.Payment memory p = vault.getPayment(id);
        vm.prank(OUTSIDER);
        vault.settlePayment(id);
        paid += p.amount;
        paidTo[p.provider] += p.amount;
        ++settlements;
        _terminal(id);
    }

    function _terminal(bytes32 id) private {
        require(terminalHash[id] == 0, "second terminal resolution");
        terminalHash[id] = keccak256(abi.encode(vault.getPayment(id)));
        ++resolved;
    }

    /// @dev Cleanup is excluded from targets and its transition counts are logged separately.
    function resolveAll() external {
        uint256 latest = block.timestamp;
        for (uint256 i; i < payments.length; ++i) {
            TaskVault.Payment memory p = vault.getPayment(payments[i]);
            uint256 end = p.status == TaskVault.PaymentStatus.ACCEPTED
                ? p.challengeDeadline
                : p.reviewDeadline;
            if (end > latest) latest = end;
        }
        vm.warp(latest);
        for (uint256 i; i < payments.length; ++i) {
            TaskVault.Payment memory p = vault.getPayment(payments[i]);
            if (p.status == TaskVault.PaymentStatus.ACCEPTED) _settle(payments[i]);
            if (
                p.status == TaskVault.PaymentStatus.FUNDED
                    || p.status == TaskVault.PaymentStatus.SUBMITTED
            ) _refund(payments[i]);
        }
    }
}

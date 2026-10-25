// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;
import { TaskVault } from "../src/TaskVault.sol";
import { EscrowTestBase, EscrowVm } from "./helpers/EscrowTestBase.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

interface ReviewVm is EscrowVm {
    function snapshotState() external returns (uint256);
    function revertToState(uint256 snapshotId) external returns (bool);
    function getBlockTimestamp() external view returns (uint256);
}

/// @dev Independent adversarial properties over the existing production API.
contract SecurityReviewTest is EscrowTestBase {
    ReviewVm private constant reviewVm =
        ReviewVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function testWithdrawalGasObservation() public {
        _funded();
        vm.prank(OWNER);
        vault.withdraw(address(token), OTHER, 60e6);
        _account(40e6, 0, 40e6);
        require(token.balanceOf(OTHER) == 60e6, "exact conventional withdrawal");
    }

    function testAllStateActionPairsBeforeAtAndAfterCutoff() public {
        uint256 snapshot = reviewVm.snapshotState();
        for (uint8 state; state < 7; ++state) {
            for (uint8 action; action < 5; ++action) {
                for (uint8 phase; phase < 3; ++phase) {
                    _matrix(state, action, phase);
                    require(reviewVm.revertToState(snapshot), "restore independent scenario");
                }
            }
        }
    }

    function testFuzzTransitionMatrix(uint8 state, uint8 action, uint8 phase) public {
        _matrix(state % 7, action % 5, phase % 3);
    }

    function _matrix(uint8 state, uint8 action, uint8 phase) private {
        bytes32 id = vault.computePaymentId(TASK, AGENT, bytes32(uint256(1)));
        if (state > 0) id = _funded();
        if (state == 2 || state == 3 || state == 4) _submit(id);
        if (state == 3 || state == 4) _accept(id);
        if (state == 4) _settle(id);
        if (state == 5) _reject(id);
        if (state == 6) {
            vm.warp(vault.getPayment(id).deliveryDeadline);
            vault.refundExpired(id);
        }
        TaskVault.Payment memory p;
        if (state > 0) p = vault.getPayment(id);
        uint256 cutoff =
            state == 2 ? p.reviewDeadline : state == 3 ? p.challengeDeadline : p.deliveryDeadline;
        if (state > 0) {
            uint256 when = cutoff - 1 + phase;
            if (when > reviewVm.getBlockTimestamp()) vm.warp(when);
        }
        bool expected;
        if (state == 1) {
            expected = (action == 0 || action == 2)
                ? reviewVm.getBlockTimestamp() < p.deliveryDeadline
                : action == 4 && reviewVm.getBlockTimestamp() >= p.deliveryDeadline;
        }
        if (state == 2) {
            expected = (action == 1 || action == 2)
                ? reviewVm.getBlockTimestamp() < p.reviewDeadline
                : action == 4 && reviewVm.getBlockTimestamp() >= p.reviewDeadline;
        }
        if (state == 3) {
            expected = action == 2
                ? reviewVm.getBlockTimestamp() < p.challengeDeadline
                : action == 3 && reviewVm.getBlockTimestamp() >= p.challengeDeadline;
        }
        bytes memory payload;
        address caller;
        if (action == 0) {
            payload = abi.encodeCall(vault.submitDelivery, (id, HASH));
            caller = PROVIDER;
        }
        if (action == 1) {
            payload = abi.encodeCall(vault.acceptDelivery, (id));
            caller = AGENT;
        }
        if (action == 2) {
            payload = abi.encodeCall(vault.rejectPayment, (id, "matrix dispute"));
            caller = OWNER;
        }
        if (action == 3) {
            payload = abi.encodeCall(vault.settlePayment, (id));
            caller = OTHER;
        }
        if (action == 4) {
            payload = abi.encodeCall(vault.refundExpired, (id));
            caller = OTHER;
        }
        bytes32 beforeHash = _financialDigest(id, state > 0);
        vm.prank(caller);
        (bool ok,) = address(vault).call(payload);
        require(ok == expected, "state/action/cutoff transition mismatch");
        if (!ok) {
            require(
                _financialDigest(id, state > 0) == beforeHash, "failed transition changed state"
            );
        } else {
            TaskVault.PaymentStatus result = action == 0
                ? TaskVault.PaymentStatus.SUBMITTED
                : action == 1
                    ? TaskVault.PaymentStatus.ACCEPTED
                    : action == 2
                        ? TaskVault.PaymentStatus.REJECTED
                        : action == 3
                            ? TaskVault.PaymentStatus.COMPLETED
                            : TaskVault.PaymentStatus.EXPIRED;
            _status(id, result);
            uint256 settled = action == 3 ? 40e6 : 0;
            uint256 reserved = action < 2 ? 40e6 : 0;
            _account(reserved, settled, CAP - settled);
        }
    }

    function _financialDigest(bytes32 id, bool exists) private view returns (bytes32) {
        bytes32 paymentHash = exists ? keccak256(abi.encode(vault.getPayment(id))) : bytes32(0);
        return keccak256(
            abi.encode(
                paymentHash,
                vault.getMandate(TASK),
                vault.totalReserved(),
                token.balanceOf(address(vault)),
                token.balanceOf(PROVIDER)
            )
        );
    }

    function testSameRequestIdCannotBeReusedWithChangedRecipientOrAmount() public {
        bytes32 id = _funded();
        vm.expectRevert(abi.encodeWithSelector(TaskVault.PaymentAlreadyExists.selector, id));
        vm.prank(AGENT);
        vault.requestPayment(TASK, bytes32(uint256(1)), OTHER, address(token), 60e6);
        require(
            vault.getPayment(id).provider == PROVIDER && vault.getPayment(id).amount == 40e6,
            "immutable quote fields"
        );
    }

    function testRequestIdStaysConsumedAfterEveryTerminalOutcome() public {
        uint256 snapshot = reviewVm.snapshotState();
        for (uint256 outcome; outcome < 3; ++outcome) {
            bytes32 id = _funded();
            if (outcome == 0) {
                _submit(id);
                _accept(id);
                _settle(id);
            }
            if (outcome == 1) _reject(id);
            if (outcome == 2) {
                vm.warp(vault.getPayment(id).deliveryDeadline);
                vault.refundExpired(id);
            }
            vm.expectRevert(abi.encodeWithSelector(TaskVault.PaymentAlreadyExists.selector, id));
            _funded();
            require(reviewVm.revertToState(snapshot), "restore request identity case");
        }
    }

    function testFreshIdsPermitIdenticalPurchasesOnlyWithinCumulativeCap() public {
        _request(40e6, keccak256("purchase attempt A"));
        _request(40e6, keccak256("purchase attempt B"));
        _request(20e6, keccak256("purchase attempt C"));
        vm.expectRevert(abi.encodeWithSelector(TaskVault.TaskCapExceeded.selector, CAP, 1, CAP));
        _request(1, keccak256("purchase attempt D"));
        _account(CAP, 0, CAP);
    }

    function testDifferentMandateDoesNotLaunderAgentOrProviderAuthority() public {
        bytes32 otherTask = keccak256("other agent restricted providers");
        address[] memory providers = new address[](1);
        providers[0] = OTHER;
        vm.prank(OWNER);
        vault.createMandate(
            otherTask,
            OTHER,
            address(token),
            CAP,
            uint64(block.timestamp + 10 days),
            providers,
            TaskVault.DeliveryTerms(1 hours, 1 hours, HASH)
        );
        vm.expectRevert(abi.encodeWithSelector(TaskVault.UnauthorizedAgent.selector, AGENT));
        vm.prank(AGENT);
        vault.requestPayment(otherTask, bytes32(uint256(1)), OTHER, address(token), 1);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.ProviderNotApproved.selector, PROVIDER));
        vm.prank(OTHER);
        vault.requestPayment(otherTask, bytes32(uint256(1)), PROVIDER, address(token), 1);
        vm.prank(OTHER);
        bytes32 id = vault.requestPayment(otherTask, bytes32(uint256(1)), OTHER, address(token), 1);
        require(
            vault.getPayment(id).taskHash == otherTask && vault.getMandate(TASK).reserved == 0,
            "task isolation"
        );
    }

    function testMandateExpiryBoundaryBeforeAtAndAfter() public {
        uint64 expiry = vault.getMandate(TASK).expiry;
        vm.warp(expiry - 1);
        _request(1, bytes32(uint256(1)));
        for (uint256 delta; delta < 2; ++delta) {
            vm.warp(uint256(expiry) + delta);
            vm.expectRevert(abi.encodeWithSelector(TaskVault.MandateExpired.selector, TASK, expiry));
            _request(1, bytes32(uint256(2)));
        }
        require(vault.totalReserved() == 1, "expiry failure atomic");
    }

    function testPendingOwnerCannotDisputeAndTransferDoesNotResetWindow() public {
        bytes32 id = _accepted();
        uint64 cutoff = vault.getPayment(id).challengeDeadline;
        vm.prank(OWNER);
        vault.transferOwnership(OTHER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OTHER));
        vm.prank(OTHER);
        vault.rejectPayment(id, "only nominated");
        vm.warp(cutoff - 1);
        vm.prank(OTHER);
        vault.acceptOwnership();
        require(
            vault.getPayment(id).challengeDeadline == cutoff, "ownership cannot extend challenge"
        );
        vm.prank(OTHER);
        vault.rejectPayment(id, "new owner timely");
        _account(0, 0, CAP);
    }

    function testAgentCannotNominateOwnerOrAcceptUnnominated() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, AGENT));
        vm.prank(AGENT);
        vault.transferOwnership(AGENT);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, AGENT));
        vm.prank(AGENT);
        vault.acceptOwnership();
        require(vault.owner() == OWNER, "no privilege escalation");
    }

    function testCancelledOwnershipNominationDoesNotGrantAuthority() public {
        vm.prank(OWNER);
        vault.transferOwnership(OTHER);
        vm.prank(OWNER);
        vault.transferOwnership(address(0));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OTHER));
        vm.prank(OTHER);
        vault.acceptOwnership();
        require(vault.owner() == OWNER, "cancel preserved owner");
    }

    function testOwnerMayExplicitlyPromoteAgentButDoesNotChangePaymentTerms() public {
        bytes32 id = _funded();
        bytes32 terms = keccak256(abi.encode(vault.getPayment(id)));
        vm.prank(OWNER);
        vault.transferOwnership(AGENT);
        vm.prank(AGENT);
        vault.acceptOwnership();
        require(
            vault.owner() == AGENT && terms == keccak256(abi.encode(vault.getPayment(id))),
            "explicit owner promotion only"
        );
        vm.prank(AGENT);
        vault.rejectPayment(id, "now trusted owner");
    }

    function testBadUntrustedDeliveryCanSettleIfAgentAcceptsAndOwnerMissesWindow() public {
        bytes32 task = keccak256("no objective verifier");
        _create(task, 0);
        vm.prank(AGENT);
        bytes32 id = vault.requestPayment(task, bytes32(uint256(1)), PROVIDER, address(token), 40e6);
        vm.prank(PROVIDER);
        vault.submitDelivery(id, keccak256("incorrect or unavailable output"));
        vm.prank(AGENT);
        vault.acceptDelivery(id);
        _settle(id);
        _status(id, TaskVault.PaymentStatus.COMPLETED);
        require(token.balanceOf(PROVIDER) == 40e6, "optimistic trust risk demonstrated");
    }

    function testUInt128MaximumReservationAndSettlementWithoutTruncation() public {
        bytes32 task = keccak256("maximum authority");
        address[] memory providers = new address[](1);
        providers[0] = PROVIDER;
        vm.prank(OWNER);
        vault.createMandate(
            task,
            AGENT,
            address(token),
            type(uint128).max,
            uint64(block.timestamp + 10 days),
            providers,
            TaskVault.DeliveryTerms(1 hours, 1 hours, HASH)
        );
        token.mint(OWNER, type(uint128).max);
        vm.prank(OWNER);
        vault.deposit(address(token), type(uint128).max);
        vm.prank(AGENT);
        bytes32 id = vault.requestPayment(
            task, bytes32(uint256(1)), PROVIDER, address(token), type(uint128).max
        );
        _submit(id);
        _accept(id);
        _settle(id);
        require(
            vault.getMandate(task).settled == type(uint128).max && vault.totalReserved() == 0,
            "exact maximum accounting"
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskVault.TaskCapExceeded.selector, type(uint128).max, 1, type(uint128).max
            )
        );
        vm.prank(AGENT);
        vault.requestPayment(task, bytes32(uint256(2)), PROVIDER, address(token), 1);
    }

    function testLastSafeUInt64DeadlineCanResolve() public {
        vm.warp(uint256(type(uint64).max) - 5 days);
        bytes32 task = keccak256("last safe deadlines");
        address[] memory providers = new address[](1);
        providers[0] = PROVIDER;
        vm.prank(OWNER);
        vault.createMandate(
            task,
            AGENT,
            address(token),
            CAP,
            type(uint64).max,
            providers,
            TaskVault.DeliveryTerms(1 days, 2 days, HASH)
        );
        vm.prank(AGENT);
        bytes32 id = vault.requestPayment(task, bytes32(uint256(1)), PROVIDER, address(token), 1);
        vm.warp(vault.getPayment(id).deliveryDeadline - 1);
        _submit(id);
        vm.warp(vault.getPayment(id).reviewDeadline - 1);
        _accept(id);
        _settle(id);
        _status(id, TaskVault.PaymentStatus.COMPLETED);
        require(
            vault.getPayment(id).challengeDeadline == type(uint64).max - 1,
            "no timestamp truncation"
        );
    }

    function testThreeMandatesInterleaveSettlementWithdrawalRejectionAndExpiry() public {
        bytes32 second = keccak256("task B");
        bytes32 third = keccak256("task C");
        _create(second, HASH);
        _create(third, HASH);
        vm.prank(OWNER);
        vault.deposit(address(token), CAP);
        bytes32 a = _request(60e6, bytes32(uint256(1)));
        vm.prank(AGENT);
        bytes32 b = vault.requestPayment(second, bytes32(uint256(1)), OTHER, address(token), 80e6);
        vm.prank(AGENT);
        bytes32 c = vault.requestPayment(third, bytes32(uint256(1)), PROVIDER, address(token), 40e6);
        _three(180e6, 200e6, second, third);
        vm.prank(OWNER);
        vault.withdraw(address(token), OWNER, 20e6);
        _three(180e6, 180e6, second, third);
        _reject(a);
        _three(120e6, 180e6, second, third);
        a = _request(60e6, bytes32(uint256(2)));
        _three(180e6, 180e6, second, third);
        vm.prank(OTHER);
        vault.submitDelivery(b, HASH);
        _accept(b);
        _submit(c);
        _settle(b);
        _three(100e6, 100e6, second, third);
        vault.refundExpired(a);
        _three(40e6, 100e6, second, third);
        vm.prank(OWNER);
        vault.withdraw(address(token), OWNER, 60e6);
        _three(40e6, 40e6, second, third);
        vm.warp(vault.getPayment(c).reviewDeadline);
        vault.refundExpired(c);
        _three(0, 40e6, second, third);
        require(
            vault.getMandate(TASK).settled == 0 && vault.getMandate(second).settled == 80e6
                && vault.getMandate(third).settled == 0,
            "historical task spend"
        );
        require(
            token.balanceOf(OTHER) == 80e6 && token.balanceOf(PROVIDER) == 0,
            "designated provider paid once"
        );
    }

    function _three(uint256 reserved, uint256 balance, bytes32 second, bytes32 third) private view {
        require(
            vault.totalReserved() == reserved && token.balanceOf(address(vault)) == balance,
            "shared escrow backing"
        );
        require(vault.availableBalance() == balance - reserved, "available excludes all tasks");
        require(
            uint256(vault.getMandate(TASK).reserved) + vault.getMandate(second).reserved
                    + vault.getMandate(third).reserved == reserved,
            "global equals task sums"
        );
    }
}

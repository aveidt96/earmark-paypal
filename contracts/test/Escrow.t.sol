// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import { TaskVault } from "../src/TaskVault.sol";
import { EscrowTestBase, EscrowVm } from "./helpers/EscrowTestBase.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

contract EscrowTest is EscrowTestBase {
    function testReservationSnapshotsTermsWithoutTransferring() public {
        bytes32 id = _funded();
        TaskVault.Payment memory p = vault.getPayment(id);
        require(id == vault.computePaymentId(TASK, AGENT, bytes32(uint256(1))), "payment ID");
        require(p.taskHash == TASK && p.requestId == bytes32(uint256(1)), "task/request");
        require(
            p.agent == AGENT && p.provider == PROVIDER && p.token == address(token), "recipients"
        );
        require(p.amount == 40e6 && p.fundedAt == block.timestamp, "amount/time");
        require(p.deliveryDeadline == block.timestamp + 1 days, "delivery deadline");
        require(p.reviewDeadline == p.deliveryDeadline + 2 days, "review deadline");
        require(
            p.challengeWindow == 2 days && p.challengeDeadline == 0 && p.acceptedAt == 0,
            "challenge"
        );
        require(p.expectedDeliverableHash == HASH && p.deliverableHash == 0, "hashes");
        require(
            token.balanceOf(PROVIDER) == 0 && token.allowance(address(vault), AGENT) == 0,
            "no transfer/approval"
        );
        _status(id, TaskVault.PaymentStatus.FUNDED);
        _account(40e6, 0, CAP);
    }

    function testRequestHasNoAvailableFunds() public {
        vm.prank(OWNER);
        vault.withdraw(address(token), OWNER, CAP);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.InsufficientAvailableFunds.selector, 0, 1));
        _request(1, bytes32(uint256(1)));
        _account(0, 0, 0);
    }

    function testRequestCapViolation() public {
        _funded();
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.TaskCapExceeded.selector, 40e6, 60e6 + 1, CAP)
        );
        _request(60e6 + 1, bytes32(uint256(2)));
        _account(40e6, 0, CAP);
    }

    function testConcurrentReservationsAndReservedWithdrawal() public {
        _funded();
        _request(60e6, bytes32(uint256(2)));
        _account(CAP, 0, CAP);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.InsufficientAvailableFunds.selector, 0, 1));
        vm.prank(OWNER);
        vault.withdraw(address(token), OWNER, 1);
    }

    function testMultipleMandatesShareActualLiquidity() public {
        bytes32 second = keccak256("second");
        _create(second, HASH);
        _funded();
        vm.prank(AGENT);
        vault.requestPayment(second, bytes32(uint256(1)), PROVIDER, address(token), 60e6);
        require(vault.totalReserved() == CAP && vault.availableBalance() == 0, "shared backing");
        require(vault.getMandate(second).reserved == 60e6, "second reservation");
        vm.expectRevert(abi.encodeWithSelector(TaskVault.InsufficientAvailableFunds.selector, 0, 1));
        _request(1, bytes32(uint256(2)));
    }

    function testRequestWrongProvider() public {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.ProviderNotApproved.selector, OWNER));
        vm.prank(AGENT);
        vault.requestPayment(TASK, bytes32(uint256(1)), OWNER, address(token), 1);
    }

    function testRequestWrongAgent() public {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.UnauthorizedAgent.selector, OTHER));
        vm.prank(OTHER);
        vault.requestPayment(TASK, bytes32(uint256(1)), PROVIDER, address(token), 1);
    }

    function testRequestWrongToken() public {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.UnsupportedToken.selector, OTHER));
        vm.prank(AGENT);
        vault.requestPayment(TASK, bytes32(uint256(1)), PROVIDER, OTHER, 1);
    }

    function testRequestZeroAmount() public {
        vm.expectRevert(TaskVault.ZeroAmount.selector);
        _request(0, bytes32(uint256(1)));
    }

    function testRequestZeroIdentifier() public {
        vm.expectRevert(TaskVault.InvalidRequestId.selector);
        _request(1, bytes32(0));
    }

    function testUnknownMandateAndPaymentFailClosed() public {
        bytes32 unknown = keccak256("unknown");
        vm.expectRevert(abi.encodeWithSelector(TaskVault.MandateNotFound.selector, unknown));
        vm.prank(AGENT);
        vault.requestPayment(unknown, bytes32(uint256(1)), PROVIDER, address(token), 1);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.PaymentNotFound.selector, unknown));
        vault.getPayment(unknown);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.PaymentNotFound.selector, unknown));
        vault.refundExpired(unknown);
    }

    function testUnsuccessfulReservationDoesNotConsumeIdentifier() public {
        vm.expectRevert(TaskVault.ZeroAmount.selector);
        _request(0, bytes32(uint256(1)));
        _funded();
        _account(40e6, 0, CAP);
    }

    function testIdentifierCannotReplayAfterRefund() public {
        bytes32 id = _funded();
        vm.warp(vault.getPayment(id).deliveryDeadline);
        vault.refundExpired(id);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.PaymentAlreadyExists.selector, id));
        _funded();
        _account(0, 0, CAP);
    }

    function testIdentifierDomainsSeparateTaskAgentAndVault() public {
        bytes32 nonce = bytes32(uint256(1));
        bytes32 first = _funded();
        bytes32 secondTask = keccak256("second");
        _create(secondTask, HASH);
        vm.prank(AGENT);
        bytes32 second = vault.requestPayment(secondTask, nonce, PROVIDER, address(token), 1);
        TaskVault another = new TaskVault(OWNER, address(token));
        require(
            first != second && first != vault.computePaymentId(TASK, OTHER, nonce),
            "task/agent domain"
        );
        require(first != another.computePaymentId(TASK, AGENT, nonce), "vault domain");
    }

    function testDeliveryWrongProviderEvenIfMandateApprovesIt() public {
        bytes32 id = _funded();
        vm.expectRevert(abi.encodeWithSelector(TaskVault.UnauthorizedProvider.selector, OTHER));
        vm.prank(OTHER);
        vault.submitDelivery(id, HASH);
    }

    function testDeliveryZeroCommitment() public {
        bytes32 id = _funded();
        vm.expectRevert(TaskVault.InvalidDeliverableHash.selector);
        vm.prank(PROVIDER);
        vault.submitDelivery(id, bytes32(0));
    }

    function testDeliveryIncorrectTrustedHash() public {
        bytes32 id = _funded();
        bytes32 wrong = keccak256("wrong");
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.DeliverableHashMismatch.selector, HASH, wrong)
        );
        vm.prank(PROVIDER);
        vault.submitDelivery(id, wrong);
        _status(id, TaskVault.PaymentStatus.FUNDED);
        _account(40e6, 0, CAP);
    }

    function testOptionalTrustedHashAllowsNonzeroProviderCommitment() public {
        bytes32 task = keccak256("optional");
        _create(task, 0);
        vm.prank(AGENT);
        bytes32 id = vault.requestPayment(task, bytes32(uint256(1)), PROVIDER, address(token), 1);
        vm.prank(PROVIDER);
        vault.submitDelivery(id, keccak256("untrusted commitment"));
        _status(id, TaskVault.PaymentStatus.SUBMITTED);
    }

    function testValidDeliveryStoresCommitmentWithoutPayment() public {
        bytes32 id = _funded();
        _submit(id);
        require(vault.getPayment(id).deliverableHash == HASH, "stored commitment");
        _status(id, TaskVault.PaymentStatus.SUBMITTED);
        _account(40e6, 0, CAP);
        require(token.balanceOf(PROVIDER) == 0, "delivery is not settlement");
    }

    function testDeliveryAtDeadlineFailsAndRefundSucceeds() public {
        bytes32 id = _funded();
        uint64 deadline = vault.getPayment(id).deliveryDeadline;
        vm.warp(deadline);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.PaymentDeadlinePassed.selector, id, deadline)
        );
        _submit(id);
        vault.refundExpired(id);
        _status(id, TaskVault.PaymentStatus.EXPIRED);
    }

    function testDeliveryAfterDeadlineFails() public {
        bytes32 id = _funded();
        uint64 deadline = vault.getPayment(id).deliveryDeadline;
        vm.warp(uint256(deadline) + 1);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.PaymentDeadlinePassed.selector, id, deadline)
        );
        _submit(id);
    }

    function testDeliveryOneSecondBeforeDeadlineSucceeds() public {
        bytes32 id = _funded();
        vm.warp(vault.getPayment(id).deliveryDeadline - 1);
        _submit(id);
    }

    function testCannotSubmitTwice() public {
        bytes32 id = _funded();
        _submit(id);
        _stateError(id, TaskVault.PaymentStatus.SUBMITTED);
        _submit(id);
    }

    function testAcceptanceBeforeDeliveryFails() public {
        bytes32 id = _funded();
        _stateError(id, TaskVault.PaymentStatus.FUNDED);
        _accept(id);
    }

    function testWrongAgentAcceptanceFails() public {
        bytes32 id = _funded();
        _submit(id);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.UnauthorizedAgent.selector, OTHER));
        vm.prank(OTHER);
        vault.acceptDelivery(id);
    }

    function testAcceptanceAtReviewDeadlineFailsAndRefundSucceeds() public {
        bytes32 id = _funded();
        _submit(id);
        uint64 deadline = vault.getPayment(id).reviewDeadline;
        vm.warp(deadline);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.PaymentDeadlinePassed.selector, id, deadline)
        );
        _accept(id);
        vault.refundExpired(id);
        _account(0, 0, CAP);
    }

    function testAcceptanceOneSecondBeforeReviewDeadlineStartsFullChallenge() public {
        bytes32 id = _funded();
        _submit(id);
        vm.warp(vault.getPayment(id).reviewDeadline - 1);
        _accept(id);
        TaskVault.Payment memory p = vault.getPayment(id);
        require(
            p.acceptedAt == block.timestamp && p.challengeDeadline == block.timestamp + 2 days,
            "full challenge"
        );
        _settle(id);
        _account(0, 40e6, 60e6);
    }

    function testEarlyAcceptanceCanFinishBeforeUnusedReviewLimit() public {
        bytes32 id = _accepted();
        TaskVault.Payment memory p = vault.getPayment(id);
        require(p.challengeDeadline < p.reviewDeadline, "early acceptance bounds");
        _settle(id);
        _status(id, TaskVault.PaymentStatus.COMPLETED);
    }

    function testAcceptanceCannotBeRepeatedOrResetChallenge() public {
        bytes32 id = _accepted();
        bytes32 beforeHash = keccak256(abi.encode(vault.getPayment(id)));
        _stateError(id, TaskVault.PaymentStatus.ACCEPTED);
        _accept(id);
        require(beforeHash == keccak256(abi.encode(vault.getPayment(id))), "challenge unchanged");
    }

    function testSettlementBeforeAcceptanceFails() public {
        bytes32 id = _funded();
        _stateError(id, TaskVault.PaymentStatus.FUNDED);
        vault.settlePayment(id);
    }

    function testEarlySettlementFailsEvenOneSecondBeforeCutoff() public {
        bytes32 id = _accepted();
        uint64 deadline = vault.getPayment(id).challengeDeadline;
        vm.warp(deadline - 1);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.ChallengeWindowOpen.selector, id, deadline)
        );
        vault.settlePayment(id);
        _account(40e6, 0, CAP);
    }

    function testPermissionlessOptimisticSettlementAtChallengeDeadline() public {
        bytes32 id = _accepted();
        vm.warp(vault.getPayment(id).challengeDeadline);
        vm.prank(OTHER);
        vault.settlePayment(id);
        _status(id, TaskVault.PaymentStatus.COMPLETED);
        _account(0, 40e6, 60e6);
        require(token.balanceOf(PROVIDER) == 40e6 && token.balanceOf(OTHER) == 0, "fixed recipient");
    }

    function testOwnerRejectionDuringChallengeRestoresLiquidity() public {
        bytes32 id = _accepted();
        vm.warp(vault.getPayment(id).challengeDeadline - 1);
        _reject(id);
        _status(id, TaskVault.PaymentStatus.REJECTED);
        _account(0, 0, CAP);
        require(token.balanceOf(PROVIDER) == 0, "no payout");
    }

    function testOwnerCanRejectFundedOrSubmittedBeforeCutoff() public {
        bytes32 first = _funded();
        _reject(first);
        bytes32 second = _request(40e6, bytes32(uint256(2)));
        _submit(second);
        _reject(second);
        _account(0, 0, CAP);
    }

    function testNonOwnerCannotReject() public {
        bytes32 id = _accepted();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, AGENT));
        vm.prank(AGENT);
        vault.rejectPayment(id, "agent cannot dispute");
    }

    function testRejectionReasonMustBeNonemptyAndBounded() public {
        bytes32 id = _funded();
        vm.expectRevert(TaskVault.InvalidRejectionReason.selector);
        vm.prank(OWNER);
        vault.rejectPayment(id, "");
        vm.expectRevert(TaskVault.InvalidRejectionReason.selector);
        vm.prank(OWNER);
        vault.rejectPayment(id, string(new bytes(257)));
        vm.prank(OWNER);
        vault.rejectPayment(id, string(new bytes(256)));
    }

    function testRejectionEventContainsPublicReasonAndIdentity() public {
        bytes32 id = _funded();
        vm.recordLogs();
        _reject(id);
        EscrowVm.Log[] memory logs = vm.getRecordedLogs();
        require(logs.length == 1 && logs[0].emitter == address(vault), "rejection event");
        require(
            logs[0].topics[0] == keccak256("PaymentRejected(bytes32,bytes32,address,string)"),
            "signature"
        );
        require(logs[0].topics[1] == id && logs[0].topics[2] == TASK, "event domains");
        require(address(uint160(uint256(logs[0].topics[3]))) == OWNER, "dispute authority");
        require(
            keccak256(bytes(abi.decode(logs[0].data, (string)))) == keccak256("incorrect delivery"),
            "reason"
        );
    }

    function testOwnerRejectionAtChallengeDeadlineFailsAndSettlementSucceeds() public {
        bytes32 id = _accepted();
        uint64 deadline = vault.getPayment(id).challengeDeadline;
        vm.warp(deadline);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.PaymentDeadlinePassed.selector, id, deadline)
        );
        _reject(id);
        vault.settlePayment(id);
    }

    function testOwnerRejectionAtDeliveryDeadlineMustUseRefund() public {
        bytes32 id = _funded();
        uint64 deadline = vault.getPayment(id).deliveryDeadline;
        vm.warp(deadline);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.PaymentDeadlinePassed.selector, id, deadline)
        );
        _reject(id);
        vault.refundExpired(id);
    }

    function testCurrentOwnerControlsDisputeAfterOwnershipTransfer() public {
        bytes32 id = _accepted();
        vm.prank(OWNER);
        vault.transferOwnership(OTHER);
        vm.prank(OTHER);
        vault.acceptOwnership();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OWNER));
        _reject(id);
        vm.prank(OTHER);
        vault.rejectPayment(id, "new owner dispute");
        _account(0, 0, CAP);
    }

    function testDeliveryTimeoutRefundPermissionless() public {
        bytes32 id = _funded();
        vm.warp(vault.getPayment(id).deliveryDeadline);
        vm.prank(OTHER);
        vault.refundExpired(id);
        _status(id, TaskVault.PaymentStatus.EXPIRED);
        _account(0, 0, CAP);
    }

    function testSubmittedTimeoutUsesReviewRatherThanDeliveryDeadline() public {
        bytes32 id = _funded();
        _submit(id);
        TaskVault.Payment memory p = vault.getPayment(id);
        vm.warp(p.deliveryDeadline);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.PaymentNotExpired.selector, id, p.reviewDeadline)
        );
        vault.refundExpired(id);
        vm.warp(p.reviewDeadline);
        vault.refundExpired(id);
        _account(0, 0, CAP);
    }

    function testEarlyRefundFails() public {
        bytes32 id = _funded();
        uint64 deadline = vault.getPayment(id).deliveryDeadline;
        vm.warp(deadline - 1);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.PaymentNotExpired.selector, id, deadline));
        vault.refundExpired(id);
    }

    function testAcceptedCannotTimeoutRefundEvenLongAfterChallenge() public {
        bytes32 id = _accepted();
        vm.warp(uint256(vault.getPayment(id).challengeDeadline) + 365 days);
        _stateError(id, TaskVault.PaymentStatus.ACCEPTED);
        vault.refundExpired(id);
        vault.settlePayment(id);
        _account(0, 40e6, 60e6);
    }

    function testRefundRestoresTaskHeadroomAndPreservesHistoricalSettled() public {
        bytes32 first = _accepted();
        _settle(first);
        bytes32 second = _request(60e6, bytes32(uint256(2)));
        vm.warp(vault.getPayment(second).deliveryDeadline);
        vault.refundExpired(second);
        _account(0, 40e6, 60e6);
        _request(60e6, bytes32(uint256(3)));
        _account(60e6, 40e6, 60e6);
    }

    function testSettlementPermanentlyConsumesCapEvenAfterRefill() public {
        bytes32 id = _request(CAP, bytes32(uint256(1)));
        _submit(id);
        _accept(id);
        _settle(id);
        vm.prank(OWNER);
        vault.deposit(address(token), CAP);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.TaskCapExceeded.selector, CAP, 1, CAP));
        _request(1, bytes32(uint256(2)));
    }

    function testRevocationStopsRequestsButExistingPaymentCanSettle() public {
        bytes32 id = _funded();
        vm.prank(OWNER);
        vault.revokeMandate(TASK);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.MandateInactive.selector, TASK));
        _request(1, bytes32(uint256(2)));
        _submit(id);
        _accept(id);
        _settle(id);
        _account(0, 40e6, 60e6);
    }

    function testRevokedPaymentCanStillExpireOrBeRejected() public {
        bytes32 first = _funded();
        bytes32 second = _request(40e6, bytes32(uint256(2)));
        vm.prank(OWNER);
        vault.revokeMandate(TASK);
        _reject(first);
        vm.warp(vault.getPayment(second).deliveryDeadline);
        vault.refundExpired(second);
        _account(0, 0, CAP);
    }

    function testMandateExpiryStopsNewRequestsWithoutInvalidatingEscrow() public {
        uint64 expiry = vault.getMandate(TASK).expiry;
        vm.warp(expiry - 1);
        bytes32 id = _funded();
        vm.warp(expiry);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.MandateExpired.selector, TASK, expiry));
        _request(1, bytes32(uint256(2)));
        _submit(id);
        _accept(id);
        _settle(id);
        _account(0, 40e6, 60e6);
    }

    function testReadOnlyPreflightStillDoesNotReserveAfterEscrowAdded() public {
        vm.prank(AGENT);
        require(vault.checkAuthorization(TASK, PROVIDER, address(token), CAP), "preflight");
        _account(0, 0, CAP);
        _funded();
        _account(40e6, 0, CAP);
    }

    function testGlobalLedgerRejectsUnsupportedToken() public {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.UnsupportedToken.selector, OTHER));
        vault.globalReserved(OTHER);
    }

    function testAllTerminalStatesAreImmutableAndCannotResolveTwice() public {
        bytes32 completed = _accepted();
        _settle(completed);
        bytes32 rejected = _request(20e6, bytes32(uint256(2)));
        _reject(rejected);
        bytes32 expired = _request(20e6, bytes32(uint256(3)));
        vm.warp(vault.getPayment(expired).deliveryDeadline);
        vault.refundExpired(expired);
        _assertTerminal(completed, TaskVault.PaymentStatus.COMPLETED);
        _assertTerminal(rejected, TaskVault.PaymentStatus.REJECTED);
        _assertTerminal(expired, TaskVault.PaymentStatus.EXPIRED);
        _account(0, 40e6, 60e6);
        require(token.balanceOf(PROVIDER) == 40e6, "paid once");
    }

    function _assertTerminal(bytes32 id, TaskVault.PaymentStatus state) internal {
        bytes32 snapshot = keccak256(abi.encode(vault.getPayment(id)));
        _stateError(id, state);
        vault.settlePayment(id);
        _stateError(id, state);
        vault.refundExpired(id);
        _stateError(id, state);
        _reject(id);
        _stateError(id, state);
        _submit(id);
        _stateError(id, state);
        _accept(id);
        require(keccak256(abi.encode(vault.getPayment(id))) == snapshot, "terminal mutation");
    }

    function testDurationBoundsAndMaximumReachableResolution() public {
        _createWithWindows(keccak256("min"), 1 hours, 1 hours);
        _createWithWindows(keccak256("max"), 30 days, 30 days);
        vm.prank(AGENT);
        bytes32 id = vault.requestPayment(
            keccak256("max"), bytes32(uint256(1)), PROVIDER, address(token), 1
        );
        vm.warp(vault.getPayment(id).deliveryDeadline - 1);
        _submit(id);
        vm.warp(vault.getPayment(id).reviewDeadline - 1);
        _accept(id);
        _settle(id);
        _status(id, TaskVault.PaymentStatus.COMPLETED);
    }

    function testOutOfRangeDurationsRejected() public {
        vm.expectRevert(TaskVault.InvalidDeliveryWindow.selector);
        _createWithWindows(keccak256("a"), 1 hours - 1, 1 hours);
        vm.expectRevert(TaskVault.InvalidDeliveryWindow.selector);
        _createWithWindows(keccak256("b"), 30 days + 1, 1 hours);
        vm.expectRevert(TaskVault.InvalidChallengeWindow.selector);
        _createWithWindows(keccak256("c"), 1 hours, 1 hours - 1);
        vm.expectRevert(TaskVault.InvalidChallengeWindow.selector);
        _createWithWindows(keccak256("d"), 1 hours, 30 days + 1);
    }

    function _createWithWindows(bytes32 task, uint64 delivery, uint64 challenge) internal {
        address[] memory providers = new address[](1);
        providers[0] = PROVIDER;
        vm.prank(OWNER);
        vault.createMandate(
            task,
            AGENT,
            address(token),
            CAP,
            uint64(block.timestamp + 60 days),
            providers,
            TaskVault.DeliveryTerms(delivery, challenge, HASH)
        );
    }

    function testLatestChallengeOverflowRejectedAtomicallyAtFunding() public {
        vm.warp(uint256(type(uint64).max) - 4 days);
        bytes32 task = keccak256("near uint64 boundary");
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
        vm.expectRevert(
            abi.encodeWithSelector(
                SafeCast.SafeCastOverflowedUintDowncast.selector,
                uint8(64),
                block.timestamp + 5 days
            )
        );
        vm.prank(AGENT);
        vault.requestPayment(task, bytes32(uint256(1)), PROVIDER, address(token), 1);
        require(
            vault.getMandate(task).reserved == 0 && vault.totalReserved() == 0,
            "atomic overflow rejection"
        );
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { TaskVault } from "../src/TaskVault.sol";
import { MockUSDC } from "./mocks/MockUSDC.sol";
import { VaultTestBase } from "./helpers/VaultTestBase.sol";

contract TaskVaultTest is VaultTestBase {
    function testOwnerCreatesValidMandateAndStoresAllTerms() public {
        _create();
        TaskVault.Mandate memory mandate = vault.getMandate(TASK);
        _eq(mandate.taskHash, TASK);
        _eq(mandate.agent, AGENT);
        _eq(mandate.token, address(token));
        _eq(mandate.cap, CAP);
        _eq(mandate.reserved, 0);
        _eq(mandate.settled, 0);
        _eq(mandate.expiry, EXPIRY);
        require(mandate.active, "not active");
        TaskVault.DeliveryTerms memory terms = vault.getDeliveryTerms(TASK);
        _eq(terms.deliveryWindow, 1 days);
        _eq(terms.challengeWindow, 2 days);
        _eq(terms.trustedDeliverableHash, _terms().trustedDeliverableHash);
        _eq(vault.owner(), OWNER);
        _eq(address(vault.paymentToken()), address(token));
    }

    function testCreationDoesNotRequireOrLockFunding() public {
        _create();
        _eq(vault.availableBalance(), 0);
        _eq(vault.totalReserved(), 0);
        _fund(CAP);
        _eq(vault.availableBalance(), CAP);
        vm.prank(OWNER);
        vault.withdraw(address(token), OWNER, CAP);
        _eq(vault.availableBalance(), 0);
        require(vault.getMandate(TASK).active, "withdrawal changed terms");
    }

    function testNonOwnerCannotCreateMandate() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OTHER));
        vm.prank(OTHER);
        vault.createMandate(TASK, AGENT, address(token), CAP, EXPIRY, _providers(), _terms());
    }

    function testAgentCannotCreateMandate() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, AGENT));
        vm.prank(AGENT);
        vault.createMandate(TASK, AGENT, address(token), CAP, EXPIRY, _providers(), _terms());
    }

    function testProviderMembershipAndEnumeration() public {
        _create();
        require(vault.isProviderApproved(TASK, PROVIDER), "missing provider");
        require(vault.isProviderApproved(TASK, OTHER), "missing second provider");
        require(!vault.isProviderApproved(TASK, AGENT), "unexpected provider");
        require(!vault.isProviderApproved(bytes32(uint256(123)), PROVIDER), "unknown task approved");
        address[] memory providers = vault.getApprovedProviders(TASK);
        _eq(providers.length, 2);
        _eq(providers[0], PROVIDER);
        _eq(providers[1], OTHER);
    }

    function testDuplicateProviderRejectedAtomically() public {
        address[] memory providers = _providers();
        providers[1] = PROVIDER;
        vm.expectRevert(abi.encodeWithSelector(TaskVault.DuplicateProvider.selector, PROVIDER));
        vm.prank(OWNER);
        vault.createMandate(TASK, AGENT, address(token), CAP, EXPIRY, providers, _terms());
        require(!vault.isProviderApproved(TASK, PROVIDER), "partial creation survived revert");
        _create();
    }

    function testZeroProviderRejected() public {
        address[] memory providers = _providers();
        providers[1] = address(0);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.InvalidProvider.selector, address(0)));
        vm.prank(OWNER);
        vault.createMandate(TASK, AGENT, address(token), CAP, EXPIRY, providers, _terms());
    }

    function testVaultCannotBeItsOwnProvider() public {
        address[] memory providers = _providers();
        providers[0] = address(vault);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.InvalidProvider.selector, address(vault)));
        vm.prank(OWNER);
        vault.createMandate(TASK, AGENT, address(token), CAP, EXPIRY, providers, _terms());
    }

    function testEmptyProvidersRejected() public {
        vm.expectRevert(TaskVault.NoProviders.selector);
        vm.prank(OWNER);
        vault.createMandate(TASK, AGENT, address(token), CAP, EXPIRY, new address[](0), _terms());
    }

    function testZeroTaskHashRejected() public {
        vm.expectRevert(TaskVault.InvalidTaskHash.selector);
        vm.prank(OWNER);
        vault.createMandate(bytes32(0), AGENT, address(token), CAP, EXPIRY, _providers(), _terms());
    }

    function testDuplicateTaskCannotRewriteTerms() public {
        _create();
        vm.expectRevert(abi.encodeWithSelector(TaskVault.MandateAlreadyExists.selector, TASK));
        vm.prank(OWNER);
        vault.createMandate(TASK, OTHER, address(token), 1, EXPIRY + 1, _providers(), _terms());
        _eq(vault.getMandate(TASK).agent, AGENT);
        _eq(vault.getMandate(TASK).cap, CAP);
    }

    function testZeroAgentRejected() public {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.InvalidAgent.selector, address(0)));
        vm.prank(OWNER);
        vault.createMandate(TASK, address(0), address(token), CAP, EXPIRY, _providers(), _terms());
    }

    function testOwnerCannotBeDesignatedAgentAtCreation() public {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.InvalidAgent.selector, OWNER));
        vm.prank(OWNER);
        vault.createMandate(TASK, OWNER, address(token), CAP, EXPIRY, _providers(), _terms());
    }

    function testVaultCannotBeItsOwnAgent() public {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.InvalidAgent.selector, address(vault)));
        vm.prank(OWNER);
        vault.createMandate(
            TASK, address(vault), address(token), CAP, EXPIRY, _providers(), _terms()
        );
    }

    function testZeroCapRejected() public {
        vm.expectRevert(TaskVault.InvalidCap.selector);
        vm.prank(OWNER);
        vault.createMandate(TASK, AGENT, address(token), 0, EXPIRY, _providers(), _terms());
    }

    function testExpiryAtCreationTimeRejected() public {
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.InvalidExpiry.selector, uint64(block.timestamp))
        );
        vm.prank(OWNER);
        vault.createMandate(
            TASK, AGENT, address(token), CAP, uint64(block.timestamp), _providers(), _terms()
        );
    }

    function testPastExpiryRejected() public {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.InvalidExpiry.selector, uint64(1)));
        vm.prank(OWNER);
        vault.createMandate(TASK, AGENT, address(token), CAP, 1, _providers(), _terms());
    }

    function testZeroDeliveryWindowRejected() public {
        TaskVault.DeliveryTerms memory terms = _terms();
        terms.deliveryWindow = 0;
        vm.expectRevert(TaskVault.InvalidDeliveryWindow.selector);
        vm.prank(OWNER);
        vault.createMandate(TASK, AGENT, address(token), CAP, EXPIRY, _providers(), terms);
    }

    function testZeroChallengeWindowRejected() public {
        TaskVault.DeliveryTerms memory terms = _terms();
        terms.challengeWindow = 0;
        vm.expectRevert(TaskVault.InvalidChallengeWindow.selector);
        vm.prank(OWNER);
        vault.createMandate(TASK, AGENT, address(token), CAP, EXPIRY, _providers(), terms);
    }

    function testTrustedDeliverableHashIsOptional() public {
        TaskVault.DeliveryTerms memory terms = _terms();
        terms.trustedDeliverableHash = bytes32(0);
        vm.prank(OWNER);
        vault.createMandate(TASK, AGENT, address(token), CAP, EXPIRY, _providers(), terms);
        _eq(vault.getDeliveryTerms(TASK).trustedDeliverableHash, bytes32(0));
    }

    function testUnsupportedMandateTokenRejected() public {
        MockUSDC otherToken = new MockUSDC();
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.UnsupportedToken.selector, address(otherToken))
        );
        vm.prank(OWNER);
        vault.createMandate(TASK, AGENT, address(otherToken), CAP, EXPIRY, _providers(), _terms());
    }

    function testConstructorRejectsZeroToken() public {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.UnsupportedToken.selector, address(0)));
        new TaskVault(OWNER, address(0));
    }

    function testConstructorRejectsTokenWithoutCode() public {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.UnsupportedToken.selector, OTHER));
        new TaskVault(OWNER, OTHER);
    }

    function testConstructorRejectsZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new TaskVault(address(0), address(token));
    }

    function testUnknownMandateFailsAuthorizationAndGetters() public {
        bytes memory reason = abi.encodeWithSelector(TaskVault.MandateNotFound.selector, TASK);
        vm.expectRevert(reason);
        _check(1);
        vm.expectRevert(reason);
        vault.getMandate(TASK);
        vm.expectRevert(reason);
        vault.getDeliveryTerms(TASK);
        vm.expectRevert(reason);
        vault.getApprovedProviders(TASK);
    }

    function testWrongAgentFailsAuthorization() public {
        _create();
        _fund(CAP);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.UnauthorizedAgent.selector, OTHER));
        vm.prank(OTHER);
        vault.checkAuthorization(TASK, PROVIDER, address(token), 1);
    }

    function testOwnerDoesNotBypassAgentCheck() public {
        _create();
        _fund(CAP);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.UnauthorizedAgent.selector, OWNER));
        vm.prank(OWNER);
        vault.checkAuthorization(TASK, PROVIDER, address(token), 1);
    }

    function testWrongProviderFailsAuthorization() public {
        _create();
        _fund(CAP);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.ProviderNotApproved.selector, OWNER));
        vm.prank(AGENT);
        vault.checkAuthorization(TASK, OWNER, address(token), 1);
    }

    function testWrongTokenFailsAuthorization() public {
        _create();
        vm.expectRevert(abi.encodeWithSelector(TaskVault.UnsupportedToken.selector, OTHER));
        vm.prank(AGENT);
        vault.checkAuthorization(TASK, PROVIDER, OTHER, 1);
    }

    function testExpiredMandateFailsAtExactExpiry() public {
        _create();
        _fund(CAP);
        vm.warp(EXPIRY - 1);
        require(_check(1), "before expiry rejected");
        vm.warp(EXPIRY);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.MandateExpired.selector, TASK, EXPIRY));
        _check(1);
    }

    function testExpiredTaskCannotBeRecreated() public {
        _create();
        vm.warp(EXPIRY + 1);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.MandateAlreadyExists.selector, TASK));
        vm.prank(OWNER);
        vault.createMandate(TASK, AGENT, address(token), CAP, EXPIRY + 100, _providers(), _terms());
    }

    function testRevocationPreservesHistoricalTermsAndAccounting() public {
        _create();
        _fund(CAP);
        vault.seedAccounting(TASK, 20 * 1e6, 30 * 1e6, 20 * 1e6);
        TaskVault.Mandate memory beforeMandate = vault.getMandate(TASK);
        bytes32 beforeTerms =
            keccak256(abi.encode(vault.getDeliveryTerms(TASK), vault.getApprovedProviders(TASK)));
        vm.prank(OWNER);
        vault.revokeMandate(TASK);
        TaskVault.Mandate memory afterMandate = vault.getMandate(TASK);
        require(!afterMandate.active, "revocation failed");
        beforeMandate.active = false;
        _eq(keccak256(abi.encode(afterMandate)), keccak256(abi.encode(beforeMandate)));
        _eq(
            keccak256(abi.encode(vault.getDeliveryTerms(TASK), vault.getApprovedProviders(TASK))),
            beforeTerms
        );
        _eq(vault.totalReserved(), 20 * 1e6);
        require(vault.isProviderApproved(TASK, PROVIDER), "history deleted");
        vm.expectRevert(abi.encodeWithSelector(TaskVault.MandateInactive.selector, TASK));
        _check(1);
    }

    function testAgentCannotRevoke() public {
        _create();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, AGENT));
        vm.prank(AGENT);
        vault.revokeMandate(TASK);
    }

    function testUnknownAndRepeatedRevocationRejected() public {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.MandateNotFound.selector, TASK));
        vm.prank(OWNER);
        vault.revokeMandate(TASK);
        _create();
        vm.prank(OWNER);
        vault.revokeMandate(TASK);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.MandateInactive.selector, TASK));
        vm.prank(OWNER);
        vault.revokeMandate(TASK);
    }

    function testRevokedTaskCannotBeRecreated() public {
        _create();
        vm.prank(OWNER);
        vault.revokeMandate(TASK);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.MandateAlreadyExists.selector, TASK));
        vm.prank(OWNER);
        vault.createMandate(TASK, AGENT, address(token), CAP, EXPIRY, _providers(), _terms());
    }

    function testZeroRequestRejected() public {
        _create();
        vm.expectRevert(TaskVault.ZeroAmount.selector);
        _check(0);
    }

    function testTaskCapExceededRejected() public {
        _create();
        _fund(2 * CAP);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.TaskCapExceeded.selector, 0, CAP + 1, CAP));
        _check(CAP + 1);
    }

    function testMaxUintRequestFailsWithCapErrorInsteadOfOverflow() public {
        _create();
        vault.seedAccounting(TASK, 1, 1, 1);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.TaskCapExceeded.selector, 2, type(uint256).max, CAP)
        );
        _check(type(uint256).max);
    }

    function testReservedAndSettledBothConsumeHeadroom() public {
        _create();
        _fund(CAP);
        vault.seedAccounting(TASK, 40 * 1e6, 30 * 1e6, 40 * 1e6);
        require(_check(30 * 1e6), "exact headroom rejected");
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.TaskCapExceeded.selector, 70 * 1e6, 30 * 1e6 + 1, CAP)
        );
        _check(30 * 1e6 + 1);
    }

    /// @dev Hypothetical before/after snapshots only. No production refund operation exists in Stage 2.
    function testRefundAccountingSnapshotRestoresHeadroomWithoutChangingSettled() public {
        _create();
        _fund(CAP);
        vault.seedAccounting(TASK, 40 * 1e6, 30 * 1e6, 40 * 1e6);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.TaskCapExceeded.selector, 70 * 1e6, 40 * 1e6, CAP)
        );
        _check(40 * 1e6);
        vault.seedAccounting(TASK, 0, 30 * 1e6, 0);
        _eq(vault.getMandate(TASK).settled, 30 * 1e6);
        require(_check(70 * 1e6), "refunded headroom unavailable");
        _eq(vault.getMandate(TASK).reserved, 0);
        _eq(vault.totalReserved(), 0);
    }

    function testValidRequestUsesInternalRoutineAndLeavesAccountingUnchanged() public {
        _create();
        _fund(CAP);
        vault.seedAccounting(TASK, 10 * 1e6, 20 * 1e6, 10 * 1e6);
        bytes32 beforeState = keccak256(
            abi.encode(
                vault.getMandate(TASK), vault.totalReserved(), token.balanceOf(address(vault))
            )
        );
        require(_check(70 * 1e6), "valid check failed");
        require(_check(70 * 1e6), "repeat check consumed funds");
        vm.prank(AGENT);
        require(
            vault.exposedInternalAuthorization(TASK, PROVIDER, address(token), 70 * 1e6),
            "internal routine failed"
        );
        _eq(
            keccak256(
                abi.encode(
                    vault.getMandate(TASK), vault.totalReserved(), token.balanceOf(address(vault))
                )
            ),
            beforeState
        );
        _eq(token.balanceOf(PROVIDER), 0);
        _eq(token.allowance(address(vault), AGENT), 0);
        _eq(token.allowance(address(vault), PROVIDER), 0);
    }

    function testInsufficientUnreservedLiquidityRejected() public {
        _create();
        _fund(10 * 1e6);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskVault.InsufficientAvailableFunds.selector, 10 * 1e6, 11 * 1e6
            )
        );
        _check(11 * 1e6);
    }

    function testSharedTokenReservationsReduceEveryMandatesAvailableFunds() public {
        _create();
        bytes32 secondTask = keccak256("second-task");
        vm.prank(OWNER);
        vault.createMandate(secondTask, AGENT, address(token), CAP, EXPIRY, _providers(), _terms());
        _fund(CAP);
        vault.seedAccounting(TASK, 60 * 1e6, 0, 60 * 1e6);
        vault.seedAccounting(secondTask, 30 * 1e6, 0, 90 * 1e6);
        _eq(
            vault.totalReserved(),
            uint256(vault.getMandate(TASK).reserved) + vault.getMandate(secondTask).reserved
        );
        _eq(vault.availableBalance(), 10 * 1e6);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskVault.InsufficientAvailableFunds.selector, 10 * 1e6, 11 * 1e6
            )
        );
        _check(11 * 1e6);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskVault.InsufficientAvailableFunds.selector, 10 * 1e6, 11 * 1e6
            )
        );
        vm.prank(AGENT);
        vault.checkAuthorization(secondTask, PROVIDER, address(token), 11 * 1e6);
        vm.prank(OWNER);
        vault.withdraw(address(token), OWNER, 10 * 1e6);
        _eq(token.balanceOf(address(vault)), 90 * 1e6);
        _eq(vault.availableBalance(), 0);
    }

    function testInsolventSnapshotFailsClosed() public {
        _create();
        _fund(10);
        vault.seedAccounting(TASK, 11, 0, 11);
        bytes memory reason = abi.encodeWithSelector(TaskVault.VaultInsolvent.selector, 10, 11);
        vm.expectRevert(reason);
        vault.availableBalance();
        vm.expectRevert(reason);
        _check(1);
        vm.expectRevert(reason);
        vm.prank(OWNER);
        vault.withdraw(address(token), OWNER, 1);
    }

    function testDepositsUseSixDecimalBaseUnitsAndActualBalance() public {
        _eq(token.decimals(), 6);
        _fund(7 * 1e6);
        _fund(1);
        _eq(vault.availableBalance(), 7 * 1e6 + 1);
        _eq(token.balanceOf(address(vault)), 7 * 1e6 + 1);
        _eq(token.balanceOf(OWNER), 1_000 * 1e6 - 7 * 1e6 - 1);
        _eq(vault.totalReserved(), 0);
    }

    function testNonOwnerCannotDeposit() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, AGENT));
        vm.prank(AGENT);
        vault.deposit(address(token), 1);
    }

    function testZeroDepositRejected() public {
        vm.expectRevert(TaskVault.ZeroAmount.selector);
        vm.prank(OWNER);
        vault.deposit(address(token), 0);
    }

    function testUnsupportedDepositTokenRejected() public {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.UnsupportedToken.selector, OTHER));
        vm.prank(OWNER);
        vault.deposit(OTHER, 1);
    }

    function testDepositWithoutAllowanceRejected() public {
        vm.prank(OWNER);
        token.approve(address(vault), 0);
        vm.expectRevert(
            abi.encodeWithSignature(
                "ERC20InsufficientAllowance(address,uint256,uint256)", address(vault), 0, 1
            )
        );
        vm.prank(OWNER);
        vault.deposit(address(token), 1);
        _eq(vault.availableBalance(), 0);
    }

    function testDepositBeyondOwnerBalanceRejected() public {
        vm.expectRevert(
            abi.encodeWithSignature(
                "ERC20InsufficientBalance(address,uint256,uint256)", OWNER, 1_000 * 1e6, 1_001 * 1e6
            )
        );
        vm.prank(OWNER);
        vault.deposit(address(token), 1_001 * 1e6);
        _eq(vault.availableBalance(), 0);
    }

    function testOwnerWithdrawsUnreservedFunds() public {
        _create();
        _fund(CAP);
        vault.seedAccounting(TASK, 40 * 1e6, 0, 40 * 1e6);
        vm.prank(OWNER);
        vault.withdraw(address(token), OTHER, 60 * 1e6);
        _eq(token.balanceOf(OTHER), 60 * 1e6);
        _eq(token.balanceOf(address(vault)), 40 * 1e6);
        _eq(vault.availableBalance(), 0);
        _eq(vault.getMandate(TASK).reserved, 40 * 1e6);
    }

    function testAgentCannotWithdraw() public {
        _fund(CAP);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, AGENT));
        vm.prank(AGENT);
        vault.withdraw(address(token), AGENT, 1);
    }

    function testNonOwnerCannotWithdraw() public {
        _fund(CAP);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OTHER));
        vm.prank(OTHER);
        vault.withdraw(address(token), OTHER, 1);
    }

    function testWithdrawalCannotConsumeReservedFundsEvenAfterRevocation() public {
        _create();
        _fund(CAP);
        vault.seedAccounting(TASK, 40 * 1e6, 0, 40 * 1e6);
        vm.prank(OWNER);
        vault.revokeMandate(TASK);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskVault.InsufficientAvailableFunds.selector, 60 * 1e6, 60 * 1e6 + 1
            )
        );
        vm.prank(OWNER);
        vault.withdraw(address(token), OWNER, 60 * 1e6 + 1);
        _eq(token.balanceOf(address(vault)), CAP);
    }

    function testZeroWithdrawalRejected() public {
        vm.expectRevert(TaskVault.ZeroAmount.selector);
        vm.prank(OWNER);
        vault.withdraw(address(token), OWNER, 0);
    }

    function testInvalidWithdrawalRecipientsRejected() public {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.InvalidRecipient.selector, address(0)));
        vm.prank(OWNER);
        vault.withdraw(address(token), address(0), 1);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.InvalidRecipient.selector, address(vault)));
        vm.prank(OWNER);
        vault.withdraw(address(token), address(vault), 1);
    }

    function testUnsupportedWithdrawalTokenRejected() public {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.UnsupportedToken.selector, OTHER));
        vm.prank(OWNER);
        vault.withdraw(OTHER, OWNER, 1);
    }

    function testUnfundedWithdrawalRejected() public {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.InsufficientAvailableFunds.selector, 0, 1));
        vm.prank(OWNER);
        vault.withdraw(address(token), OWNER, 1);
    }

    function testDirectSupportedTokenDonationIsAvailable() public {
        vm.prank(OWNER);
        token.transfer(address(vault), 7);
        _eq(vault.availableBalance(), 7);
        vm.prank(OWNER);
        vault.withdraw(address(token), OWNER, 7);
        _eq(token.balanceOf(address(vault)), 0);
    }

    function testOwnershipTransferRequiresAcceptanceAndPreservesTerms() public {
        _create();
        bytes32 terms = keccak256(abi.encode(vault.getMandate(TASK), vault.getDeliveryTerms(TASK)));
        vm.prank(OWNER);
        vault.transferOwnership(OTHER);
        _eq(vault.owner(), OWNER);
        _eq(vault.pendingOwner(), OTHER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OTHER));
        vm.prank(OTHER);
        vault.revokeMandate(TASK);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, AGENT));
        vm.prank(AGENT);
        vault.acceptOwnership();
        vm.prank(OTHER);
        vault.acceptOwnership();
        _eq(vault.owner(), OTHER);
        _eq(vault.pendingOwner(), address(0));
        _eq(keccak256(abi.encode(vault.getMandate(TASK), vault.getDeliveryTerms(TASK))), terms);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OWNER));
        vm.prank(OWNER);
        vault.revokeMandate(TASK);
        vm.prank(OTHER);
        vault.revokeMandate(TASK);
    }

    function testOwnershipCannotBeRenounced() public {
        vm.expectRevert(TaskVault.OwnershipRenunciationDisabled.selector);
        vm.prank(OWNER);
        vault.renounceOwnership();
        _eq(vault.owner(), OWNER);
    }

    function testProductionContractHasNoReservationWriterOrPaymentExecutor() public {
        TaskVault productionVault = new TaskVault(OWNER, address(token));
        vm.startPrank(OWNER);
        token.approve(address(productionVault), CAP);
        productionVault.deposit(address(token), CAP);
        productionVault.createMandate(
            TASK, AGENT, address(token), CAP, EXPIRY, _providers(), _terms()
        );
        vm.stopPrank();
        vm.prank(AGENT);
        require(
            productionVault.checkAuthorization(TASK, PROVIDER, address(token), CAP),
            "check rejected"
        );
        _eq(productionVault.getMandate(TASK).reserved, 0);
        _eq(productionVault.getMandate(TASK).settled, 0);
        _eq(productionVault.totalReserved(), 0);
        _eq(token.balanceOf(PROVIDER), 0);
        vm.prank(AGENT);
        (bool success,) = address(productionVault)
            .call(
                abi.encodeWithSignature(
                    "reserve(bytes32,address,address,uint256)", TASK, PROVIDER, address(token), 1
                )
            );
        require(!success, "unexpected reservation endpoint");
        (success,) = address(productionVault)
            .call(
                abi.encodeWithSignature(
                    "seedAccounting(bytes32,uint128,uint128,uint256)", TASK, 1, 0, 1
                )
            );
        require(!success, "test-only writer leaked");
        (success,) = address(productionVault)
            .call(abi.encodeWithSignature("execute(address,bytes)", address(token), bytes("")));
        require(!success, "arbitrary executor exposed");
    }

    function testMaxUint128CapAndCountersDoNotOverflow() public {
        vm.prank(OWNER);
        vault.createMandate(
            TASK, AGENT, address(token), type(uint128).max, EXPIRY, _providers(), _terms()
        );
        token.mint(address(vault), type(uint128).max);
        uint128 reserved = type(uint128).max - 10;
        vault.seedAccounting(TASK, reserved, 5, reserved);
        require(_check(5), "max cap headroom failed");
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskVault.TaskCapExceeded.selector, uint256(reserved) + 5, 6, type(uint128).max
            )
        );
        _check(6);
    }

    function testProviderApprovalsAreIsolatedPerTask() public {
        _create();
        _fund(CAP);
        bytes32 secondTask = keccak256("isolated-provider-task");
        address[] memory providers = new address[](1);
        providers[0] = OTHER;
        vm.prank(OWNER);
        vault.createMandate(secondTask, AGENT, address(token), CAP, EXPIRY, providers, _terms());
        require(vault.isProviderApproved(TASK, PROVIDER), "first task lost provider");
        require(!vault.isProviderApproved(secondTask, PROVIDER), "provider approval leaked");
        vm.expectRevert(abi.encodeWithSelector(TaskVault.ProviderNotApproved.selector, PROVIDER));
        vm.prank(AGENT);
        vault.checkAuthorization(secondTask, PROVIDER, address(token), 1);
        vm.prank(OWNER);
        vault.revokeMandate(TASK);
        vm.prank(AGENT);
        require(
            vault.checkAuthorization(secondTask, OTHER, address(token), 1), "unrelated task revoked"
        );
    }

    function testTwoReadOnlyChecksDoNotGuaranteeCombinedLiquidity() public {
        _create();
        _fund(CAP);
        bytes32 secondTask = keccak256("shared-preflight-liquidity");
        vm.prank(OWNER);
        vault.createMandate(secondTask, AGENT, address(token), CAP, EXPIRY, _providers(), _terms());
        require(_check(CAP), "first preflight rejected");
        vm.prank(AGENT);
        require(
            vault.checkAuthorization(secondTask, PROVIDER, address(token), CAP),
            "second preflight rejected"
        );
        _eq(vault.availableBalance(), CAP);
        _eq(vault.totalReserved(), 0);
        _eq(vault.getMandate(TASK).reserved, 0);
        _eq(vault.getMandate(secondTask).reserved, 0);
    }

    function testAgentCannotPullVaultTokensWithTransferFrom() public {
        _fund(CAP);
        vm.expectRevert(
            abi.encodeWithSignature(
                "ERC20InsufficientAllowance(address,uint256,uint256)", AGENT, 0, 1
            )
        );
        vm.prank(AGENT);
        token.transferFrom(address(vault), AGENT, 1);
        _eq(token.balanceOf(address(vault)), CAP);
        _eq(token.balanceOf(AGENT), 0);
    }

    function testFuzzAuthorizationCapMath(
        uint128 reservedSeed,
        uint128 settledSeed,
        uint256 request
    ) public {
        _create();
        token.mint(address(vault), type(uint128).max);
        uint128 reserved = reservedSeed % (CAP + 1);
        uint128 settled = settledSeed % (CAP - reserved + 1);
        vault.seedAccounting(TASK, reserved, settled, reserved);
        uint256 committed = uint256(reserved) + settled;
        if (request == 0) {
            vm.expectRevert(TaskVault.ZeroAmount.selector);
        } else if (request > CAP - committed) {
            vm.expectRevert(
                abi.encodeWithSelector(TaskVault.TaskCapExceeded.selector, committed, request, CAP)
            );
        }
        _check(request);
        _eq(vault.getMandate(TASK).reserved, reserved);
        _eq(vault.getMandate(TASK).settled, settled);
    }

    function testFuzzWithdrawalPreservesGlobalReservation(uint96 balanceSeed, uint96 reservedSeed)
        public
    {
        vm.prank(OWNER);
        vault.createMandate(
            TASK, AGENT, address(token), type(uint128).max, EXPIRY, _providers(), _terms()
        );
        uint256 balance = uint256(balanceSeed) + 1;
        token.mint(address(vault), balance);
        uint128 reserved = uint128(uint256(reservedSeed) % (balance + 1));
        vault.seedAccounting(TASK, reserved, 0, reserved);
        uint256 available = balance - reserved;
        if (available > 0) {
            vm.prank(OWNER);
            vault.withdraw(address(token), OWNER, available);
        }
        _eq(token.balanceOf(address(vault)), reserved);
        _eq(vault.totalReserved(), reserved);
        _eq(vault.availableBalance(), 0);
    }

    function testFuzzProductionDepositWithdrawalRoundTrip(uint96 rawAmount) public {
        uint256 amount = uint256(rawAmount) + 1;
        TaskVault productionVault = new TaskVault(OWNER, address(token));
        token.mint(OWNER, amount);
        uint256 startingBalance = token.balanceOf(OWNER);
        vm.startPrank(OWNER);
        token.approve(address(productionVault), amount);
        productionVault.deposit(address(token), amount);
        _eq(productionVault.availableBalance(), amount);
        productionVault.withdraw(address(token), OWNER, amount);
        vm.stopPrank();
        _eq(token.balanceOf(OWNER), startingBalance);
        _eq(productionVault.availableBalance(), 0);
        _eq(productionVault.totalReserved(), 0);
    }
}

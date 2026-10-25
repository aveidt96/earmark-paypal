// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;
import { TaskVault } from "../src/TaskVault.sol";
import { SecurityHandler } from "./helpers/SecurityHandler.sol";
import { Vm } from "./helpers/VaultTestBase.sol";

contract SecurityInvariantTest {
    struct FuzzSelector {
        address addr;
        bytes4[] selectors;
    }

    struct FuzzArtifactSelector {
        string artifact;
        bytes4[] selectors;
    }

    struct FuzzInterface {
        address addr;
        string[] artifacts;
    }

    function targetArtifactSelectors() public pure returns (FuzzArtifactSelector[] memory) {
        return new FuzzArtifactSelector[](0);
    }

    function targetArtifacts() public pure returns (string[] memory) {
        return new string[](0);
    }

    function excludeArtifacts() public pure returns (string[] memory) {
        return new string[](0);
    }

    function targetSenders() public pure returns (address[] memory) {
        return new address[](0);
    }

    function excludeSenders() public pure returns (address[] memory) {
        return new address[](0);
    }

    function excludeContracts() public pure returns (address[] memory) {
        return new address[](0);
    }

    function targetInterfaces() public pure returns (FuzzInterface[] memory) {
        return new FuzzInterface[](0);
    }

    function excludeSelectors() public pure returns (FuzzSelector[] memory) {
        return new FuzzSelector[](0);
    }
    event log_named_uint(string key, uint256 value);
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    SecurityHandler private handler;
    TaskVault private vault;

    function setUp() public {
        vm.warp(1_000_000);
        handler = new SecurityHandler();
        vault = handler.vault();
    }

    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function targetSelectors() public view returns (FuzzSelector[] memory targets) {
        bytes4[] memory selectors = new bytes4[](12);
        selectors[0] = handler.fund.selector;
        selectors[1] = handler.progress.selector;
        selectors[2] = handler.cycle.selector;
        selectors[3] = handler.reject.selector;
        selectors[4] = handler.attack.selector;
        selectors[5] = handler.elapse.selector;
        selectors[6] = handler.deposit.selector;
        selectors[7] = handler.withdraw.selector;
        selectors[8] = handler.donate.selector;
        selectors[9] = handler.revoke.selector;
        selectors[10] = handler.create.selector;
        selectors[11] = handler.ownership.selector;
        targets = new FuzzSelector[](1);
        targets[0] = FuzzSelector(address(handler), selectors);
    }

    function invariantEveryLiabilityMatchesRecordsAndCaps() public view {
        uint256 count = handler.taskCount();
        uint256[] memory live = new uint256[](count);
        uint256[] memory spent = new uint256[](count);
        uint256 sum;
        for (uint256 i; i < handler.paymentCount(); ++i) {
            TaskVault.Payment memory p = vault.getPayment(handler.payments(i));
            uint256 index = handler.taskIndex(p.taskHash);
            require(
                index < count && handler.tasks(index) == p.taskHash,
                "payment bound to existing mandate"
            );
            if (_live(p.status)) {
                live[index] += p.amount;
                sum += p.amount;
            }
            if (p.status == TaskVault.PaymentStatus.COMPLETED) spent[index] += p.amount;
        }
        for (uint256 i; i < count; ++i) {
            TaskVault.Mandate memory m = vault.getMandate(handler.tasks(i));
            require(
                m.reserved == live[i] && m.settled == spent[i],
                "financial ledgers reconcile records"
            );
            require(live[i] + spent[i] <= m.cap, "cumulative authority");
        }
        uint256 balance = handler.token().balanceOf(address(vault));
        require(
            vault.totalReserved() == sum && vault.globalReserved(address(handler.token())) == sum,
            "all live obligations globally represented"
        );
        require(
            sum <= balance && vault.availableBalance() == balance - sum,
            "solvent unreserved liquidity"
        );
        require(
            balance
                == handler.deposited() + handler.donated() - handler.withdrawn() - handler.paid(),
            "token conservation"
        );
        require(
            handler.token().balanceOf(handler.TREASURY()) == handler.withdrawn(),
            "exact withdrawal recipient credit"
        );
        uint256 receipts;
        for (uint256 i; i < 3; ++i) {
            address provider = handler.providers(i);
            uint256 actual = handler.token().balanceOf(provider);
            require(actual == handler.paidTo(provider), "fixed provider paid exactly once");
            receipts += actual;
        }
        require(receipts == handler.paid(), "no hidden external payout");
    }

    function invariantImmutableTermsTerminalStatesAndDeadlines() public view {
        for (uint256 i; i < handler.taskCount(); ++i) {
            bytes32 task = handler.tasks(i);
            require(
                handler.taskTerms(task) == handler.taskHash(task), "immutable mandate permissions"
            );
        }
        for (uint256 i; i < handler.paymentCount(); ++i) {
            bytes32 id = handler.payments(i);
            TaskVault.Payment memory p = vault.getPayment(id);
            require(
                handler.paymentTerms(id) == handler.termsHash(p),
                "immutable payment recipient/amount/terms"
            );
            require(
                p.deliveryDeadline > p.fundedAt
                    && p.reviewDeadline == uint256(p.deliveryDeadline) + vault.REVIEW_WINDOW(),
                "coherent review/delivery bounds"
            );
            if (!_live(p.status)) {
                require(
                    handler.terminalHash(id) == keccak256(abi.encode(p)), "terminal record frozen"
                );
            }
            if (
                p.status == TaskVault.PaymentStatus.ACCEPTED
                    || p.status == TaskVault.PaymentStatus.COMPLETED
            ) {
                require(
                    p.acceptedAt < p.reviewDeadline
                        && p.challengeDeadline == uint256(p.acceptedAt) + p.challengeWindow,
                    "full configured dispute period"
                );
            }
            if (p.deliverableHash != 0 && p.expectedDeliverableHash != 0) {
                require(p.deliverableHash == p.expectedDeliverableHash, "trusted hash enforcement");
            }
        }
    }

    function invariantOwnershipAndTokenAuthorityStayExplicit() public view {
        require(
            vault.owner() == handler.expectedOwner()
                && vault.pendingOwner() == handler.expectedPending(),
            "ownership has two explicit steps"
        );
        for (uint256 i; i < 3; ++i) {
            require(
                handler.token().allowance(address(vault), handler.agents(i)) == 0,
                "no agent allowance"
            );
            require(
                handler.token().allowance(address(vault), handler.providers(i)) == 0,
                "no provider allowance"
            );
        }
        require(handler.token().balanceOf(handler.OUTSIDER()) == 0, "adversary cannot drain");
    }

    function testHandlerCoverageExercisesSuccessfulTransitionsAndAttacks() public {
        for (uint8 outcome; outcome < 4; ++outcome) {
            handler.cycle(outcome, 1e6, outcome);
        }
        handler.ownership(1, 0);
        handler.ownership(1, 1);
        handler.ownership(2, 0);
        handler.ownership(2, 2);
        for (uint256 mode; mode < 8; ++mode) {
            handler.attack(mode * handler.paymentCount());
        }
        handler.deposit(10e6);
        handler.withdraw(1e6);
        handler.donate(2e6);
        handler.create(100);
        handler.revoke(0);
        handler.progress(2);
        require(
            handler.requests() >= 4 && handler.submissions() >= 3 && handler.acceptances() >= 2,
            "successful escrow progression"
        );
        require(
            handler.settlements() >= 1 && handler.rejections() >= 1 && handler.refunds() >= 2,
            "every terminal path reached"
        );
        require(
            handler.expectedFailures() == 8 && handler.ownerAcceptances() == 1
                && handler.cancellations() == 1,
            "adversarial and ownership coverage"
        );
        _check();
        handler.resolveAll();
        _check();
        require(vault.totalReserved() == 0, "all legitimate payments resolve");
    }

    function testFuzzInterleavedActorsOwnershipAndResolution(
        uint128 amount,
        uint8 identity,
        uint16 timing
    ) public {
        handler.cycle(identity, amount, identity);
        handler.fund(identity, amount, identity);
        handler.fund(uint256(identity) + 1, amount / 2, uint8(identity % 3));
        handler.ownership(identity, 0);
        handler.ownership(identity, 1);
        handler.deposit(amount);
        handler.withdraw(amount / 4);
        handler.donate(amount / 8);
        handler.attack(timing);
        handler.progress(identity);
        handler.revoke(identity);
        handler.elapse(timing, identity);
        _check();
        handler.resolveAll();
        _check();
        require(vault.totalReserved() == 0, "permissionless resolution after random interleaving");
    }

    function afterInvariant() public {
        // These are the last generated sequence, excluding constructor setup and cleanup, not campaign-wide totals.
        emit log_named_uint("generated.calls", handler.calls());
        emit log_named_uint("generated.skipped", handler.skipped());
        emit log_named_uint("generated.requests", handler.requests());
        emit log_named_uint("generated.submissions", handler.submissions());
        emit log_named_uint("generated.acceptances", handler.acceptances());
        emit log_named_uint("generated.settlements", handler.settlements());
        emit log_named_uint("generated.rejections", handler.rejections());
        emit log_named_uint("generated.refunds", handler.refunds());
        emit log_named_uint("generated.expectedReverts", handler.expectedFailures());
        emit log_named_uint("generated.ownershipNominations", handler.nominations());
        emit log_named_uint("generated.ownershipAcceptances", handler.ownerAcceptances());
        emit log_named_uint("generated.ownershipCancellations", handler.cancellations());
        emit log_named_uint("generated.deposits", handler.deposits());
        emit log_named_uint("generated.withdrawals", handler.withdrawals());
        emit log_named_uint("generated.donations", handler.donations());
        emit log_named_uint("generated.revocations", handler.revocations());
        emit log_named_uint("generated.creations", handler.creations());
        emit log_named_uint("generated.timeAdvances", handler.advances());
        uint256 before = handler.resolved();
        handler.resolveAll();
        _check();
        emit log_named_uint("cleanup.resolutions", handler.resolved() - before);
        require(
            vault.totalReserved() == 0 && handler.resolved() == handler.paymentCount(),
            "one reachable terminal resolution for every payment"
        );
    }

    function _check() private view {
        invariantEveryLiabilityMatchesRecordsAndCaps();
        invariantImmutableTermsTerminalStatesAndDeadlines();
        invariantOwnershipAndTokenAuthorityStayExplicit();
    }

    function _live(TaskVault.PaymentStatus state) private pure returns (bool) {
        return state == TaskVault.PaymentStatus.FUNDED || state == TaskVault.PaymentStatus.SUBMITTED
            || state == TaskVault.PaymentStatus.ACCEPTED;
    }
}

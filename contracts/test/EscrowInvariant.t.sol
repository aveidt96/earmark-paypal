// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;
import { TaskVault } from "../src/TaskVault.sol";
import { EscrowHandler } from "./helpers/EscrowHandler.sol";
import { Vm } from "./helpers/VaultTestBase.sol";

contract EscrowInvariantTest {
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
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    EscrowHandler internal handler;
    TaskVault internal vault;

    function setUp() public {
        vm.warp(1_000_000);
        handler = new EscrowHandler();
        vault = handler.vault();
    }

    // Foundry's StdInvariant-compatible target ABI, without adding a test-library dependency.
    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function targetSelectors() public view returns (FuzzSelector[] memory targets) {
        bytes4[] memory selectors = new bytes4[](12);
        selectors[0] = handler.request.selector;
        selectors[1] = handler.submit.selector;
        selectors[2] = handler.accept.selector;
        selectors[3] = handler.reject.selector;
        selectors[4] = handler.settle.selector;
        selectors[5] = handler.refund.selector;
        selectors[6] = handler.advanceTime.selector;
        selectors[7] = handler.deposit.selector;
        selectors[8] = handler.withdraw.selector;
        selectors[9] = handler.donate.selector;
        selectors[10] = handler.revoke.selector;
        selectors[11] = handler.create.selector;
        targets = new FuzzSelector[](1);
        targets[0] = FuzzSelector(address(handler), selectors);
    }

    function invariantReservesMatchLivePaymentsAndMandateCaps() public view {
        uint256 allLive;
        uint256 allMandate;
        for (uint256 t; t < handler.taskCount(); ++t) {
            bytes32 task = handler.tasks(t);
            TaskVault.Mandate memory m = vault.getMandate(task);
            uint256 live;
            uint256 settled;
            for (uint256 i; i < handler.paymentCount(); ++i) {
                TaskVault.Payment memory p = vault.getPayment(handler.payments(i));
                if (p.taskHash != task) continue;
                if (_live(p.status)) live += p.amount;
                if (p.status == TaskVault.PaymentStatus.COMPLETED) settled += p.amount;
            }
            require(m.reserved == live && m.settled == settled, "mandate reconciles payments");
            require(uint256(m.reserved) + m.settled <= m.cap, "task cap");
            allLive += live;
            allMandate += m.reserved;
        }
        require(vault.totalReserved() == allLive && allMandate == allLive, "global liability sum");
        require(vault.globalReserved(address(handler.token())) == allLive, "token-global ledger");
    }

    function invariantEscrowBackingAndTokenConservation() public view {
        uint256 balance = handler.token().balanceOf(address(vault));
        require(vault.totalReserved() <= balance, "escrow backed");
        require(vault.availableBalance() == balance - vault.totalReserved(), "free liquidity");
        require(
            balance
                == handler.deposited() + handler.donated() - handler.withdrawn() - handler.paid(),
            "token conservation"
        );
        require(
            handler.token().balanceOf(handler.PROVIDER()) == handler.paid(),
            "exact provider receipts"
        );
        require(
            handler.token().allowance(address(vault), handler.AGENT()) == 0, "no agent approval"
        );
    }

    function invariantTermsAndTerminalRecordsCannotChange() public view {
        for (uint256 t; t < handler.taskCount(); ++t) {
            bytes32 task = handler.tasks(t);
            require(
                handler.immutableMandateHash(task) == handler.mandateTermsHash(task),
                "immutable mandate terms"
            );
        }
        for (uint256 i; i < handler.paymentCount(); ++i) {
            bytes32 id = handler.payments(i);
            TaskVault.Payment memory p = vault.getPayment(id);
            require(
                handler.immutablePaymentHash(id) == handler.paymentTermsHash(p),
                "immutable payment terms"
            );
            if (!_live(p.status)) {
                require(
                    handler.terminalHash(id) == keccak256(abi.encode(p)), "terminal immutability"
                );
            }
            if (
                p.status == TaskVault.PaymentStatus.ACCEPTED
                    || p.status == TaskVault.PaymentStatus.COMPLETED
            ) {
                require(
                    p.challengeDeadline == uint256(p.acceptedAt) + p.challengeWindow,
                    "mandatory challenge window"
                );
            }
        }
    }

    function afterInvariant() public {
        handler.resolveAll();
        invariantReservesMatchLivePaymentsAndMandateCaps();
        invariantEscrowBackingAndTokenConservation();
        invariantTermsAndTerminalRecordsCannotChange();
        require(vault.totalReserved() == 0, "all payments can resolve");
        require(
            handler.successfulRequests() == handler.successfulResolutions(),
            "one terminal resolution per payment"
        );
    }

    function _live(TaskVault.PaymentStatus status) private pure returns (bool) {
        return status == TaskVault.PaymentStatus.FUNDED
            || status == TaskVault.PaymentStatus.SUBMITTED
            || status == TaskVault.PaymentStatus.ACCEPTED;
    }
}

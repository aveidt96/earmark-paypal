// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import { TaskVault } from "../src/TaskVault.sol";
import { EscrowTestBase } from "./helpers/EscrowTestBase.sol";
import { EscrowToken } from "./mocks/EscrowToken.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract EscrowTokenSafetyTest is EscrowTestBase {
    EscrowToken internal adversarial;

    function setUp() public override {
        vm.warp(1_000_000);
        _fixture(OWNER, AGENT);
    }

    function _fixture(address owner, address agent) internal {
        adversarial = new EscrowToken();
        token = adversarial;
        vault = new TaskVault(owner, address(token));
        token.mint(owner, 1000e6);
        vm.prank(owner);
        token.approve(address(vault), type(uint256).max);
        address[] memory providers = new address[](1);
        providers[0] = PROVIDER;
        vm.prank(owner);
        vault.createMandate(
            TASK,
            agent,
            address(token),
            CAP,
            uint64(block.timestamp + 60 days),
            providers,
            TaskVault.DeliveryTerms(1 days, 2 days, HASH)
        );
        vm.prank(owner);
        vault.deposit(address(token), CAP);
    }

    function _ready() internal returns (bytes32 id) {
        id = _accepted();
        vm.warp(vault.getPayment(id).challengeDeadline);
    }

    function _unchanged(bytes32 id) internal view {
        _status(id, TaskVault.PaymentStatus.ACCEPTED);
        _account(40e6, 0, CAP);
        require(token.balanceOf(PROVIDER) == 0, "failed payout rolled back");
    }

    function testFalseReturnSettlementRollsBackAllEffects() public {
        bytes32 id = _ready();
        adversarial.configure(EscrowToken.Mode.FALSE_RETURN, address(0), "");
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        vault.settlePayment(id);
        _unchanged(id);
        adversarial.configure(EscrowToken.Mode.NORMAL, address(0), "");
        vault.settlePayment(id);
        _account(0, 40e6, 60e6);
    }

    function testRevertingTokenSettlementRemainsRetryable() public {
        bytes32 id = _ready();
        adversarial.configure(EscrowToken.Mode.REVERT_TRANSFER, address(0), "");
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "blocked token transfer"));
        vault.settlePayment(id);
        _unchanged(id);
        adversarial.configure(EscrowToken.Mode.NORMAL, address(0), "");
        vault.settlePayment(id);
    }

    function testRecipientFeeSettlementRejectedAndRolledBack() public {
        bytes32 id = _ready();
        adversarial.configure(EscrowToken.Mode.RECIPIENT_FEE, address(0), "");
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskVault.UnexpectedRecipientBalanceChange.selector, PROVIDER, 0, 40e6 - 1
            )
        );
        vault.settlePayment(id);
        _unchanged(id);
    }

    function testExtraSenderDebitSettlementRejectedAndRolledBack() public {
        bytes32 id = _ready();
        adversarial.configure(EscrowToken.Mode.SENDER_FEE, address(0), "");
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.UnexpectedTokenBalanceChange.selector, CAP, 60e6 - 1)
        );
        vault.settlePayment(id);
        _unchanged(id);
    }

    function testLossOfAggregateBackingFailsClosed() public {
        bytes32 id = _ready();
        adversarial.burn(address(vault), 60e6 + 1);
        vm.expectRevert(abi.encodeWithSelector(TaskVault.VaultInsolvent.selector, 40e6 - 1, 40e6));
        vault.settlePayment(id);
        _status(id, TaskVault.PaymentStatus.ACCEPTED);
        require(
            vault.totalReserved() == 40e6 && vault.getMandate(TASK).settled == 0,
            "insolvency preserves liabilities"
        );
    }

    function testSettlementBlocksSamePaymentReentrancy() public {
        bytes32 id = _ready();
        _callback(id, abi.encodeCall(vault.settlePayment, (id)));
        _account(0, 40e6, 60e6);
    }

    function testSettlementBlocksCrossPaymentReentrancy() public {
        bytes32 first = _accepted();
        bytes32 second = _request(20e6, bytes32(uint256(2)));
        _submit(second);
        _accept(second);
        vm.warp(vault.getPayment(first).challengeDeadline);
        _callback(first, abi.encodeCall(vault.settlePayment, (second)));
        _status(second, TaskVault.PaymentStatus.ACCEPTED);
        _account(20e6, 40e6, 60e6);
        adversarial.configure(EscrowToken.Mode.NORMAL, address(0), "");
        vault.settlePayment(second);
        _account(0, 60e6, 40e6);
    }

    function testSettlementBlocksRefundReentrancy() public {
        bytes32 first = _accepted();
        bytes32 second = _request(20e6, bytes32(uint256(2)));
        vm.warp(vault.getPayment(first).challengeDeadline);
        _callback(first, abi.encodeCall(vault.refundExpired, (second)));
        _status(second, TaskVault.PaymentStatus.FUNDED);
        vault.refundExpired(second);
        _account(0, 40e6, 60e6);
    }

    function testSettlementBlocksFinancialViewReentrancy() public {
        bytes32 id = _ready();
        _callback(id, abi.encodeCall(vault.availableBalance, ()));
    }

    function testSettlementBlocksOwnerWithdrawalCallback() public {
        // Recreate with the token itself as owner, so the callback has genuine owner authority.
        EscrowToken owned = new EscrowToken();
        adversarial = owned;
        token = owned;
        vault = new TaskVault(address(owned), address(owned));
        token.mint(address(owned), CAP);
        vm.prank(address(owned));
        token.approve(address(vault), CAP);
        address[] memory providers = new address[](1);
        providers[0] = PROVIDER;
        vm.prank(address(owned));
        vault.createMandate(
            TASK,
            AGENT,
            address(token),
            CAP,
            uint64(block.timestamp + 60 days),
            providers,
            TaskVault.DeliveryTerms(1 days, 2 days, HASH)
        );
        vm.prank(address(owned));
        vault.deposit(address(token), CAP);
        bytes32 id = _ready();
        _callback(id, abi.encodeCall(vault.withdraw, (address(token), OTHER, 1)));
        require(token.balanceOf(OTHER) == 0, "no callback withdrawal");
    }

    function testSettlementBlocksAuthorizedAgentRequestCallback() public {
        EscrowToken agentToken = new EscrowToken();
        adversarial = agentToken;
        token = agentToken;
        vault = new TaskVault(OWNER, address(token));
        token.mint(OWNER, CAP);
        vm.prank(OWNER);
        token.approve(address(vault), CAP);
        address[] memory providers = new address[](1);
        providers[0] = PROVIDER;
        vm.prank(OWNER);
        vault.createMandate(
            TASK,
            address(token),
            address(token),
            CAP,
            uint64(block.timestamp + 60 days),
            providers,
            TaskVault.DeliveryTerms(1 days, 2 days, HASH)
        );
        vm.prank(OWNER);
        vault.deposit(address(token), CAP);
        vm.prank(address(token));
        bytes32 id = vault.requestPayment(TASK, bytes32(uint256(1)), PROVIDER, address(token), 40e6);
        _submit(id);
        vm.prank(address(token));
        vault.acceptDelivery(id);
        vm.warp(vault.getPayment(id).challengeDeadline);
        _callback(
            id,
            abi.encodeCall(
                vault.requestPayment, (TASK, bytes32(uint256(2)), PROVIDER, address(token), 1)
            )
        );
        _account(0, 40e6, 60e6);
    }

    function _callback(bytes32 id, bytes memory payload) internal {
        adversarial.configure(EscrowToken.Mode.NORMAL, address(vault), payload);
        vault.settlePayment(id);
        require(!adversarial.callbackSucceeded(), "callback succeeded");
        require(
            keccak256(adversarial.callbackResult())
                == keccak256(
                    abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
                ),
            "reentrancy error"
        );
        require(token.balanceOf(PROVIDER) == vault.getMandate(TASK).settled, "exact payout once");
    }
}

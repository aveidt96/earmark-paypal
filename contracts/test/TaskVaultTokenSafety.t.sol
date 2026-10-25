// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { TaskVault } from "../src/TaskVault.sol";
import { VaultTestBase } from "./helpers/VaultTestBase.sol";
import {
    FeeOnTransferUSDC,
    ExtraDebitUSDC,
    FalseReturnUSDC,
    NoReturnUSDC,
    ReentrantUSDC
} from "./mocks/AdversarialTokens.sol";

contract TaskVaultTokenSafetyTest is VaultTestBase {
    function testFeeOnTransferDepositRejectedAndRolledBack() public {
        FeeOnTransferUSDC feeToken = new FeeOnTransferUSDC();
        TaskVault target = new TaskVault(OWNER, address(feeToken));
        feeToken.mint(OWNER, 100 * 1e6);
        vm.prank(OWNER);
        feeToken.approve(address(target), 100 * 1e6);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.UnexpectedTokenBalanceChange.selector, 0, 99 * 1e6)
        );
        vm.prank(OWNER);
        target.deposit(address(feeToken), 100 * 1e6);
        _eq(feeToken.balanceOf(OWNER), 100 * 1e6);
        _eq(feeToken.balanceOf(address(target)), 0);
        _eq(feeToken.totalSupply(), 100 * 1e6);
        _eq(target.totalReserved(), 0);
    }

    function testUnexpectedWithdrawalDebitRejectedAndRolledBack() public {
        ExtraDebitUSDC debitToken = new ExtraDebitUSDC();
        TaskVault target = new TaskVault(OWNER, address(debitToken));
        debitToken.mint(address(target), 100);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.UnexpectedTokenBalanceChange.selector, 100, 49)
        );
        vm.prank(OWNER);
        target.withdraw(address(debitToken), OTHER, 50);
        _eq(debitToken.balanceOf(address(target)), 100);
        _eq(debitToken.balanceOf(OTHER), 0);
    }

    function testSafeERC20RejectsFalseReturnDeposit() public {
        FalseReturnUSDC falseToken = new FalseReturnUSDC();
        TaskVault target = new TaskVault(OWNER, address(falseToken));
        falseToken.mint(OWNER, 100);
        vm.prank(OWNER);
        falseToken.approve(address(target), 100);
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(falseToken))
        );
        vm.prank(OWNER);
        target.deposit(address(falseToken), 100);
        _eq(target.availableBalance(), 0);
    }

    function testSafeERC20RejectsFalseReturnWithdrawal() public {
        FalseReturnUSDC falseToken = new FalseReturnUSDC();
        TaskVault target = new TaskVault(OWNER, address(falseToken));
        falseToken.mint(address(target), 100);
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(falseToken))
        );
        vm.prank(OWNER);
        target.withdraw(address(falseToken), OTHER, 100);
        _eq(target.availableBalance(), 100);
        _eq(falseToken.balanceOf(OTHER), 0);
    }

    function testSafeERC20SupportsConventionalNoReturnToken() public {
        NoReturnUSDC noReturnToken = new NoReturnUSDC();
        TaskVault target = new TaskVault(OWNER, address(noReturnToken));
        noReturnToken.mint(OWNER, 100);
        vm.startPrank(OWNER);
        noReturnToken.approve(address(target), 100);
        target.deposit(address(noReturnToken), 100);
        target.withdraw(address(noReturnToken), OWNER, 100);
        vm.stopPrank();
        _eq(target.availableBalance(), 0);
        _eq(noReturnToken.balanceOf(OWNER), 100);
    }

    function testDepositAndWithdrawalBlockAuthorizedTokenCallbacks() public {
        ReentrantUSDC callbackToken = new ReentrantUSDC();
        TaskVault target = new TaskVault(address(callbackToken), address(callbackToken));
        callbackToken.setVault(target);
        callbackToken.mint(address(callbackToken), 100);
        callbackToken.fundVault(100);
        _assertCallbackBlocked(callbackToken);
        _eq(callbackToken.attempts(), 1);
        _eq(target.availableBalance(), 100);
        callbackToken.withdrawFromVault(OTHER, 100);
        _assertCallbackBlocked(callbackToken);
        _eq(callbackToken.attempts(), 2);
        _eq(callbackToken.balanceOf(OTHER), 100);
        _eq(callbackToken.balanceOf(address(0x9999)), 0);
        _eq(target.availableBalance(), 0);
        _eq(target.totalReserved(), 0);
    }

    function _assertCallbackBlocked(ReentrantUSDC callbackToken) private view {
        require(!callbackToken.withdrawReentered(), "withdraw reentered");
        require(!callbackToken.depositReentered(), "deposit reentered");
        require(!callbackToken.viewReentered(), "inconsistent view exposed");
        require(
            callbackToken.withdrawError() == ReentrancyGuard.ReentrancyGuardReentrantCall.selector,
            "wrong withdraw error"
        );
        require(
            callbackToken.depositError() == ReentrancyGuard.ReentrancyGuardReentrantCall.selector,
            "wrong deposit error"
        );
        require(
            callbackToken.viewError() == ReentrancyGuard.ReentrancyGuardReentrantCall.selector,
            "wrong view error"
        );
    }
}

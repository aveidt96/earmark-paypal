// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;
import { TaskVault } from "../src/TaskVault.sol";
import { EscrowTestBase } from "./helpers/EscrowTestBase.sol";
import { EscrowToken } from "./mocks/EscrowToken.sol";

contract WithdrawalSecurityTest is EscrowTestBase {
    function testWithdrawalRecipientFeeRevertsAndPreservesEscrow() public {
        EscrowToken hostile = new EscrowToken();
        token = hostile;
        vault = new TaskVault(OWNER, address(token));
        token.mint(OWNER, CAP);
        vm.prank(OWNER);
        token.approve(address(vault), CAP);
        _create(TASK, HASH);
        vm.prank(OWNER);
        vault.deposit(address(token), CAP);
        bytes32 id = _funded();
        hostile.configure(EscrowToken.Mode.RECIPIENT_FEE, address(0), "");
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskVault.UnexpectedRecipientBalanceChange.selector, OTHER, 0, 60e6 - 1
            )
        );
        vm.prank(OWNER);
        vault.withdraw(address(token), OTHER, 60e6);
        _account(40e6, 0, CAP);
        _status(id, TaskVault.PaymentStatus.FUNDED);
        require(token.balanceOf(OTHER) == 0, "recipient fee rollback");
    }
}

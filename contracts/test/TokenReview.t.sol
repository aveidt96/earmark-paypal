// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;
import { TaskVault } from "../src/TaskVault.sol";
import { EscrowTestBase } from "./helpers/EscrowTestBase.sol";
import { MockUSDC } from "./mocks/MockUSDC.sol";
import { ReviewToken } from "./mocks/ReviewToken.sol";

contract TokenReviewTest is EscrowTestBase {
    ReviewToken private hostile;

    function setUp() public override {
        vm.warp(1_000_000);
        hostile = new ReviewToken();
        token = hostile;
        vault = new TaskVault(OWNER, address(token));
        token.mint(OWNER, 1000e6);
        vm.prank(OWNER);
        token.approve(address(vault), type(uint256).max);
        _create(TASK, HASH);
    }

    function _deposit() private {
        vm.prank(OWNER);
        vault.deposit(address(token), CAP);
    }

    function _ready() private returns (bytes32 id) {
        _deposit();
        id = _accepted();
        vm.warp(vault.getPayment(id).challengeDeadline);
    }

    function _unchanged(bytes32 id) private view {
        _account(40e6, 0, CAP);
        _status(id, TaskVault.PaymentStatus.ACCEPTED);
        require(token.balanceOf(PROVIDER) == 0, "no payout on failed transfer");
    }

    function testTrueReturnNoOpDepositRejected() public {
        hostile.configure(ReviewToken.Mode.NO_OP);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.UnexpectedTokenBalanceChange.selector, 0, 0)
        );
        _deposit();
        require(
            token.balanceOf(OWNER) == 1000e6 && token.balanceOf(address(vault)) == 0,
            "deposit rollback"
        );
    }

    function testTrueReturnNoOpWithdrawalRejected() public {
        _deposit();
        hostile.configure(ReviewToken.Mode.NO_OP);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.UnexpectedTokenBalanceChange.selector, CAP, CAP)
        );
        vm.prank(OWNER);
        vault.withdraw(address(token), OTHER, 40e6);
        require(token.balanceOf(OTHER) == 0 && vault.availableBalance() == CAP, "withdraw rollback");
    }

    function testTrueReturnNoOpSettlementRejectedAndRetryable() public {
        bytes32 id = _ready();
        bytes32 record = keccak256(abi.encode(vault.getPayment(id)));
        hostile.configure(ReviewToken.Mode.NO_OP);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.UnexpectedTokenBalanceChange.selector, CAP, CAP)
        );
        vault.settlePayment(id);
        _unchanged(id);
        require(keccak256(abi.encode(vault.getPayment(id))) == record, "full record rollback");
        hostile.configure(ReviewToken.Mode.NORMAL);
        vault.settlePayment(id);
        _account(0, 40e6, 60e6);
    }

    function testUnexpectedIncomingBonusRejected() public {
        hostile.configure(ReviewToken.Mode.RECIPIENT_BONUS);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.UnexpectedTokenBalanceChange.selector, 0, CAP + 1)
        );
        _deposit();
        require(
            token.totalSupply() == 1000e6 && token.balanceOf(address(vault)) == 0, "bonus rollback"
        );
    }

    function testUnexpectedWithdrawalRecipientBonusRejected() public {
        _deposit();
        bytes32 id = _funded();
        hostile.configure(ReviewToken.Mode.RECIPIENT_BONUS);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskVault.UnexpectedRecipientBalanceChange.selector, OTHER, 0, 60e6 + 1
            )
        );
        vm.prank(OWNER);
        vault.withdraw(address(token), OTHER, 60e6);
        _account(40e6, 0, CAP);
        _status(id, TaskVault.PaymentStatus.FUNDED);
        require(token.balanceOf(OTHER) == 0 && token.totalSupply() == 1000e6, "credit rollback");
    }

    function testUnexpectedSettlementRecipientBonusRejected() public {
        bytes32 id = _ready();
        hostile.configure(ReviewToken.Mode.RECIPIENT_BONUS);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskVault.UnexpectedRecipientBalanceChange.selector, PROVIDER, 0, 40e6 + 1
            )
        );
        vault.settlePayment(id);
        _unchanged(id);
        require(token.totalSupply() == 1000e6, "settlement bonus rolled back");
    }

    function testUnsupportedDonationCannotBackOrPayApprovedEscrow() public {
        _deposit();
        _funded();
        MockUSDC unsupported = new MockUSDC();
        unsupported.mint(address(vault), 500e6);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.UnsupportedToken.selector, address(unsupported))
        );
        vm.prank(AGENT);
        vault.requestPayment(TASK, bytes32(uint256(2)), PROVIDER, address(unsupported), 1);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.UnsupportedToken.selector, address(unsupported))
        );
        vm.prank(OWNER);
        vault.withdraw(address(unsupported), OWNER, 1);
        _account(40e6, 0, CAP);
        require(unsupported.balanceOf(address(vault)) == 500e6, "unsupported asset untouched");
    }

    function testDirectApprovedDonationAddsLiquidityWithoutTaskAuthority() public {
        _deposit();
        _funded();
        vm.prank(OWNER);
        token.transfer(address(vault), 25e6);
        _account(40e6, 0, 125e6);
        _request(60e6, bytes32(uint256(2)));
        vm.expectRevert(abi.encodeWithSelector(TaskVault.TaskCapExceeded.selector, CAP, 1, CAP));
        _request(1, bytes32(uint256(3)));
        vm.prank(OWNER);
        vault.withdraw(address(token), OTHER, 25e6);
        _account(CAP, 0, CAP);
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;
import { TaskVault } from "../src/TaskVault.sol";
import { EscrowTestBase } from "./helpers/EscrowTestBase.sol";

contract EscrowFuzzTest is EscrowTestBase {
    function testFuzzResolutionConservesFundsAndHeadroom(uint128 raw, uint8 outcome, uint32 delay)
        public
    {
        uint256 amount = uint256(raw) % CAP + 1;
        bytes32 id = _request(amount, bytes32(uint256(1)));
        _account(amount, 0, CAP);
        outcome %= 4;
        if (outcome == 0) {
            _submit(id);
            _accept(id);
            vm.warp(uint256(vault.getPayment(id).challengeDeadline) + delay);
            vault.settlePayment(id);
            _account(0, amount, CAP - amount);
            require(token.balanceOf(PROVIDER) == amount, "exact payout");
        } else if (outcome == 1) {
            _submit(id);
            _accept(id);
            _reject(id);
            _account(0, 0, CAP);
        } else {
            if (outcome == 3) _submit(id);
            TaskVault.Payment memory p = vault.getPayment(id);
            uint256 deadline = outcome == 2 ? p.deliveryDeadline : p.reviewDeadline;
            vm.warp(deadline + delay);
            vault.refundExpired(id);
            _account(0, 0, CAP);
        }
        bytes32 snapshot = keccak256(abi.encode(vault.getPayment(id)));
        (bool ok,) = address(vault).call(abi.encodeCall(vault.refundExpired, (id)));
        require(!ok && snapshot == keccak256(abi.encode(vault.getPayment(id))), "no second refund");
    }

    function testFuzzSharedLiquidityCannotBeReservedTwice(uint128 a, uint128 b) public {
        uint256 first = uint256(a) % CAP + 1;
        uint256 second = uint256(b) % CAP + 1;
        bytes32 task2 = keccak256("second");
        _create(task2, HASH);
        _request(first, bytes32(uint256(1)));
        if (second > CAP - first) {
            vm.expectRevert(
                abi.encodeWithSelector(
                    TaskVault.InsufficientAvailableFunds.selector, CAP - first, second
                )
            );
            vm.prank(AGENT);
            vault.requestPayment(task2, bytes32(uint256(1)), PROVIDER, address(token), second);
            require(vault.totalReserved() == first, "failure atomic");
        } else {
            vm.prank(AGENT);
            vault.requestPayment(task2, bytes32(uint256(1)), PROVIDER, address(token), second);
            require(vault.totalReserved() == first + second, "sum reservations");
        }
        require(vault.totalReserved() <= token.balanceOf(address(vault)), "backed escrow");
    }

    function testFuzzRefundAllowsFullCapReuse(uint128 raw) public {
        uint256 amount = uint256(raw) % CAP + 1;
        bytes32 id = _request(amount, bytes32(uint256(1)));
        _reject(id);
        _request(CAP, bytes32(uint256(2)));
        _account(CAP, 0, CAP);
    }

    function testFuzzChallengeWindowCannotBeShortened(uint32 raw) public {
        bytes32 id = _funded();
        _submit(id);
        uint256 elapsed = uint256(raw) % (3 days);
        vm.warp(block.timestamp + elapsed);
        _accept(id);
        TaskVault.Payment memory p = vault.getPayment(id);
        require(
            p.challengeDeadline == p.acceptedAt + p.challengeWindow && p.challengeWindow == 2 days,
            "immutable challenge duration"
        );
        vm.warp(p.challengeDeadline - 1);
        vm.expectRevert(
            abi.encodeWithSelector(TaskVault.ChallengeWindowOpen.selector, id, p.challengeDeadline)
        );
        vault.settlePayment(id);
        vm.warp(p.challengeDeadline);
        vault.settlePayment(id);
        _account(0, 40e6, 60e6);
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import { TaskVault } from "../../src/TaskVault.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import { Vm } from "./VaultTestBase.sol";

interface EscrowVm is Vm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }
    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
}

/// @dev Exercises the production contract, with no accounting seeding or storage cheatcodes.
abstract contract EscrowTestBase {
    EscrowVm internal constant vm =
        EscrowVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant OWNER = address(0x1001);
    address internal constant AGENT = address(0x1002);
    address internal constant PROVIDER = address(0x1003);
    address internal constant OTHER = address(0x1004);
    bytes32 internal constant TASK = keccak256("escrow-task");
    bytes32 internal constant HASH = keccak256("trusted-bytes");
    uint128 internal constant CAP = 100e6;
    MockUSDC internal token;
    TaskVault internal vault;

    function setUp() public virtual {
        vm.warp(1_000_000);
        token = new MockUSDC();
        vault = new TaskVault(OWNER, address(token));
        token.mint(OWNER, 1000e6);
        vm.prank(OWNER);
        token.approve(address(vault), type(uint256).max);
        _create(TASK, HASH);
        vm.prank(OWNER);
        vault.deposit(address(token), CAP);
    }

    function _create(bytes32 task, bytes32 expected) internal {
        address[] memory providers = new address[](2);
        providers[0] = PROVIDER;
        providers[1] = OTHER;
        vm.prank(OWNER);
        vault.createMandate(
            task,
            AGENT,
            address(token),
            CAP,
            uint64(block.timestamp + 60 days),
            providers,
            TaskVault.DeliveryTerms(1 days, 2 days, expected)
        );
    }

    function _request(uint256 amount, bytes32 nonce) internal returns (bytes32) {
        vm.prank(AGENT);
        return vault.requestPayment(TASK, nonce, PROVIDER, address(token), amount);
    }

    function _funded() internal returns (bytes32) {
        return _request(40e6, bytes32(uint256(1)));
    }

    function _submit(bytes32 id) internal {
        vm.prank(PROVIDER);
        vault.submitDelivery(id, HASH);
    }

    function _accept(bytes32 id) internal {
        vm.prank(AGENT);
        vault.acceptDelivery(id);
    }

    function _accepted() internal returns (bytes32 id) {
        id = _funded();
        _submit(id);
        _accept(id);
    }

    function _reject(bytes32 id) internal {
        vm.prank(OWNER);
        vault.rejectPayment(id, "incorrect delivery");
    }

    function _settle(bytes32 id) internal {
        vm.warp(vault.getPayment(id).challengeDeadline);
        vault.settlePayment(id);
    }

    function _status(bytes32 id, TaskVault.PaymentStatus status) internal view {
        require(vault.getPayment(id).status == status, "payment status");
    }

    function _account(uint256 reserved, uint256 settled, uint256 balance) internal view {
        TaskVault.Mandate memory mandate = vault.getMandate(TASK);
        require(mandate.reserved == reserved && mandate.settled == settled, "mandate accounting");
        require(vault.totalReserved() == reserved, "global accounting");
        require(vault.globalReserved(address(token)) == reserved, "token ledger");
        require(token.balanceOf(address(vault)) == balance, "vault balance");
        require(vault.availableBalance() == balance - reserved, "available balance");
    }

    function _stateError(bytes32 id, TaskVault.PaymentStatus actual) internal {
        vm.expectRevert(abi.encodeWithSelector(TaskVault.InvalidPaymentState.selector, id, actual));
    }
}

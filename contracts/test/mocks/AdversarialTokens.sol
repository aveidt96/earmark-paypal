// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import { MockUSDC } from "./MockUSDC.sol";
import { TaskVault } from "../../src/TaskVault.sol";

/// @dev Test-only hostile fixtures. None are approved production payment tokens.
contract FeeOnTransferUSDC is MockUSDC {
    function _update(address from, address to, uint256 amount) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, amount);
        } else {
            uint256 fee = amount / 100;
            super._update(from, to, amount - fee);
            super._update(from, address(0), fee);
        }
    }
}

contract ExtraDebitUSDC is MockUSDC {
    function _update(address from, address to, uint256 amount) internal override {
        super._update(from, to, amount);
        if (from != address(0) && to != address(0)) super._update(from, address(0), 1);
    }
}

contract FalseReturnUSDC is MockUSDC {
    function transfer(address, uint256) public pure override returns (bool) {
        return false;
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

contract NoReturnUSDC is MockUSDC {
    function transfer(address to, uint256 amount) public override returns (bool) {
        super.transfer(to, amount);
        assembly ("memory-safe") { return(0, 0) }
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        super.transferFrom(from, to, amount);
        assembly ("memory-safe") { return(0, 0) }
    }
}

/// @dev Token itself owns the test vault, so callbacks pass onlyOwner and actually exercise guards.
contract ReentrantUSDC is MockUSDC {
    TaskVault public vault;
    uint256 public attempts;
    bool public withdrawReentered;
    bool public depositReentered;
    bool public viewReentered;
    bytes4 public withdrawError;
    bytes4 public depositError;
    bytes4 public viewError;

    function setVault(TaskVault target) external {
        vault = target;
    }

    function fundVault(uint256 amount) external {
        _approve(address(this), address(vault), amount);
        vault.deposit(address(this), amount);
    }

    function withdrawFromVault(address recipient, uint256 amount) external {
        vault.withdraw(address(this), recipient, amount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        super.transfer(to, amount);
        _attack();
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        super.transferFrom(from, to, amount);
        _attack();
        return true;
    }

    function _attack() private {
        ++attempts;
        bytes memory reason;
        (withdrawReentered, reason) = address(vault)
            .call(abi.encodeCall(TaskVault.withdraw, (address(this), address(0x9999), 1)));
        withdrawError = bytes4(reason);
        (depositReentered, reason) =
            address(vault).call(abi.encodeCall(TaskVault.deposit, (address(this), 1)));
        depositError = bytes4(reason);
        (viewReentered, reason) =
            address(vault).staticcall(abi.encodeCall(TaskVault.availableBalance, ()));
        viewError = bytes4(reason);
    }
}

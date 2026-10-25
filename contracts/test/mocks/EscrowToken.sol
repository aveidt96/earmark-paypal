// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import { MockUSDC } from "./MockUSDC.sol";

/// @dev Adversarial local fixture only. Modes deliberately violate conventional ERC-20 assumptions.
contract EscrowToken is MockUSDC {
    enum Mode {
        NORMAL,
        FALSE_RETURN,
        RECIPIENT_FEE,
        SENDER_FEE,
        REVERT_TRANSFER
    }
    Mode public mode;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackSucceeded;
    bytes public callbackResult;

    function configure(Mode next, address target, bytes calldata data) external {
        mode = next;
        callbackTarget = target;
        callbackData = data;
    }

    function burn(address account, uint256 amount) external {
        _burn(account, amount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (mode == Mode.FALSE_RETURN) return false;
        if (mode == Mode.REVERT_TRANSFER) revert("blocked token transfer");
        if (mode == Mode.RECIPIENT_FEE) {
            super.transfer(to, amount - 1);
            _burn(msg.sender, 1);
        } else {
            super.transfer(to, amount);
            if (mode == Mode.SENDER_FEE) _burn(msg.sender, 1);
        }
        if (callbackTarget != address(0)) {
            (callbackSucceeded, callbackResult) = callbackTarget.call(callbackData);
        }
        return true;
    }
}

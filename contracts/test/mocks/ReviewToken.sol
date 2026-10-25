// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;
import { MockUSDC } from "./MockUSDC.sol";

/// @dev Test only: true-return no-ops and credit inflation violate the approved token assumptions.
contract ReviewToken is MockUSDC {
    enum Mode {
        NORMAL,
        NO_OP,
        RECIPIENT_BONUS
    }
    Mode public mode;

    function configure(Mode next) external {
        mode = next;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (mode == Mode.NO_OP) return true;
        bool ok = super.transfer(to, amount);
        if (mode == Mode.RECIPIENT_BONUS) _mint(to, 1);
        return ok;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (mode == Mode.NO_OP) return true;
        bool ok = super.transferFrom(from, to, amount);
        if (mode == Mode.RECIPIENT_BONUS) _mint(to, 1);
        return ok;
    }
}

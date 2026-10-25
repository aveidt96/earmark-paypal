// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/// @dev Compiler/dependency smoke checks only; no payment protocol is implemented.
contract ToolchainTest {
    function testConfiguredChain() external view {
        require(block.chainid == 10143, "expected Monad Testnet chain ID");
    }

    function testOpenZeppelinMath() external pure {
        require(Math.sqrt(81) == 9, "OpenZeppelin dependency unavailable");
        require(IERC20.transfer.selector == bytes4(keccak256("transfer(address,uint256)")));
    }
}

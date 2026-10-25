// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import { TaskVault } from "../../src/TaskVault.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";

/// @dev Minimal Foundry cheatcode surface; no new testing dependency is needed.
interface Vm {
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function warp(uint256 timestamp) external;
    function expectRevert(bytes calldata reason) external;
    function expectRevert(bytes4 selector) external;
}

/// @dev Test-only state seeding. This is NOT an escrow implementation or production API.
contract TaskVaultHarness is TaskVault {
    constructor(address initialOwner, address token) TaskVault(initialOwner, token) { }

    function seedAccounting(
        bytes32 taskHash,
        uint128 reserved,
        uint128 settled,
        uint256 allReserved
    ) external {
        Mandate storage mandate = _getMandate(taskHash);
        mandate.reserved = reserved;
        mandate.settled = settled;
        totalReserved = allReserved;
    }

    function exposedInternalAuthorization(
        bytes32 taskHash,
        address provider,
        address token,
        uint256 amount
    ) external view returns (bool) {
        _authorizePayment(taskHash, provider, token, amount);
        return true;
    }
}

abstract contract VaultTestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant OWNER = address(0x1001);
    address internal constant AGENT = address(0x1002);
    address internal constant PROVIDER = address(0x1003);
    address internal constant OTHER = address(0x1004);
    bytes32 internal constant TASK = keccak256("task:invoice-research:v1");
    uint128 internal constant CAP = 100 * 1e6;
    uint64 internal constant EXPIRY = 2_000_000;

    MockUSDC internal token;
    TaskVaultHarness internal vault;

    function setUp() public virtual {
        vm.warp(1_000_000);
        token = new MockUSDC();
        vault = new TaskVaultHarness(OWNER, address(token));
        token.mint(OWNER, 1_000 * 1e6);
        vm.prank(OWNER);
        token.approve(address(vault), type(uint256).max);
    }

    function _providers() internal pure returns (address[] memory providers) {
        providers = new address[](2);
        providers[0] = PROVIDER;
        providers[1] = OTHER;
    }

    function _terms() internal pure returns (TaskVault.DeliveryTerms memory) {
        return TaskVault.DeliveryTerms(1 days, 2 days, keccak256("expected-deliverable-bytes"));
    }

    function _create() internal {
        vm.prank(OWNER);
        vault.createMandate(TASK, AGENT, address(token), CAP, EXPIRY, _providers(), _terms());
    }

    function _fund(uint256 amount) internal {
        vm.prank(OWNER);
        vault.deposit(address(token), amount);
    }

    function _check(uint256 amount) internal returns (bool) {
        vm.prank(AGENT);
        return vault.checkAuthorization(TASK, PROVIDER, address(token), amount);
    }

    function _eq(uint256 actual, uint256 expected) internal pure {
        require(actual == expected, "uint mismatch");
    }

    function _eq(address actual, address expected) internal pure {
        require(actual == expected, "address mismatch");
    }

    function _eq(bytes32 actual, bytes32 expected) internal pure {
        require(actual == expected, "bytes32 mismatch");
    }
}

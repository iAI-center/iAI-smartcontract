// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract RewardDistributor is AccessControl, ReentrancyGuard {
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    IERC20 public token;

    constructor(IERC20 _token) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(DISTRIBUTOR_ROLE, msg.sender);
        token = _token;
    }

    event FundsAdded(address indexed admin, uint256 amount);
    event TokensDistributed(
        address indexed distributor,
        address indexed recipient,
        uint256 amount
    );

    function addFunds(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(amount > 0, "Must send some tokens");
        require(
            token.transferFrom(msg.sender, address(this), amount),
            "Token transfer failed"
        );
        emit FundsAdded(msg.sender, amount);
    }

    function distribute(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external nonReentrant onlyRole(DISTRIBUTOR_ROLE) {
        require(
            recipients.length == amounts.length,
            "Recipients and amounts length mismatch"
        );

        for (uint256 i = 0; i < recipients.length; i++) {
            require(
                token.balanceOf(address(this)) >= amounts[i],
                "Insufficient token balance in contract"
            );
            require(
                token.transfer(recipients[i], amounts[i]),
                "Token transfer failed"
            );
            emit TokensDistributed(msg.sender, recipients[i], amounts[i]);
        }
    }
}

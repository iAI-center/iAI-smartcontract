//SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MMVPaymentRouterV1 is AccessControl {
    bytes32 public SUPER_ADMIN_ROLE = keccak256("SUPER_ADMIN_ROLE");

    event PaymentMade(
        address indexed user,
        address indexed token,
        uint256 amount
    );
    event AdminTokenWithdrawn(
        address indexed token,
        address indexed to,
        uint256 amount,
        address indexed caller
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SUPER_ADMIN_ROLE, msg.sender);
    }

    function pay(
        address user,
        uint256 amount,
        address paymentToken
    ) public onlyRole(SUPER_ADMIN_ROLE) {
        require(user != address(0), "user: zero address");
        _pay(user, amount, paymentToken);
    }

    function _pay(address user, uint256 amount, address paymentToken) internal {
        ERC20(paymentToken).transferFrom(user, address(this), amount);
        emit PaymentMade(paymentToken, user, amount);
    }

    function adminTokenWithdraw(
        address token,
        address to,
        uint256 amount
    ) public onlyRole(SUPER_ADMIN_ROLE) {
        ERC20(token).transfer(to, amount);
        emit AdminTokenWithdrawn(token, to, amount, msg.sender);
    }
}

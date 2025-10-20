// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract GREENToken is ERC20, ERC20Burnable, Ownable, ERC20Permit {
    constructor(
        address initialOwner,
        uint256 initialSupply
    )
        ERC20("Green Token", "GREEN")
        Ownable(initialOwner)
        ERC20Permit("Green Token")
    {
        require(
            initialSupply > 0,
            "GREENToken: initial supply should be greater than 0"
        );
        _mint(initialOwner, initialSupply);
    }
}

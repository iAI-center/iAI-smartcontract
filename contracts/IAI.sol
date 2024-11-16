// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract IAIToken is ERC20, ERC20Burnable, Ownable, ERC20Permit {
    constructor(
        address initialOwner
    )
        ERC20("iAI Token", "IAI")
        Ownable(initialOwner)
        ERC20Permit("iAI Token")
    {}

    function mint(address to, uint256 amount) public onlyOwner {
        require(to != address(0), "IAIToken: mint to the zero address");
        require(amount > 0, "IAIToken: mint amount should be greater than 0");
        _mint(to, amount);
    }
}

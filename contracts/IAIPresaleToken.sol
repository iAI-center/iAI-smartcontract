// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract IAIPresaleToken is ERC20 {
    uint8 private _decimals;

    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        uint8 decimalsPlaces
    ) ERC20(name, symbol) {
        _decimals = decimalsPlaces;
        _mint(msg.sender, initialSupply * (10 ** decimalsPlaces));
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}

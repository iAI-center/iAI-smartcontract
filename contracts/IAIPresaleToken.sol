// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract IAIPresaleToken is ERC20, Ownable {
    uint8 private _decimals;

    /// @notice Creates a new token with specified initial supply
    /// @param name The name of the token
    /// @param symbol The symbol of the token
    /// @param initialSupply The initial supply in smallest unit (wei)
    /// @param decimalsPlaces The number of decimal places the token uses
    /// @dev initialSupply should be provided in wei (e.g., 100.5 tokens with 18 decimals = 100500000000000000000)
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        uint8 decimalsPlaces
    ) ERC20(name, symbol) Ownable(msg.sender) {
        require(decimalsPlaces > 0, "Decimals must be greater than 0");
        require(initialSupply > 0, "Initial supply must be greater than 0");

        _decimals = decimalsPlaces;
        _mint(msg.sender, initialSupply);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /// @notice Mints new tokens to the specified address
    /// @param to The address that will receive the minted tokens
    /// @param amount The amount of tokens to mint
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}

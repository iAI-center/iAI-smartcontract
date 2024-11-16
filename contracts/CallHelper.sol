// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract CallHelper is AccessControl, Pausable {
    using Address for address;

    bytes32 public constant CALLER_ROLE = keccak256("CALLER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    event Success(bytes32 indexed _signature);
    event Failure(bytes32 indexed _signature);

    constructor(address defaultAdmin, address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(CALLER_ROLE, admin);
    }

    function call(
        address[] calldata _addr,
        bytes[] calldata _bytedata,
        bytes32[] calldata _signature
    ) external onlyRole(CALLER_ROLE) whenNotPaused {
        require(
            _addr.length == _bytedata.length &&
                _addr.length == _signature.length,
            "Err: addr data and sig must be the same length"
        );
        for (uint256 i; i < _addr.length; i++) {
            (bool success, ) = _addr[i].call(_bytedata[i]);
            if (success) {
                emit Success(_signature[i]);
            } else {
                emit Failure(_signature[i]);
            }
        }
    }

    // Pausable functions ...

    function pause() external onlyRole(ADMIN_ROLE) whenNotPaused {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) whenPaused {
        _unpause();
    }
}

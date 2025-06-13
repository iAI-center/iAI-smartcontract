// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./SmartChefInitializableV3.sol";

contract SmartChefFactoryV3 is Ownable {
    event NewSmartChefContract(address indexed smartChef);

    constructor() Ownable(_msgSender()) {
        //
    }

    /*
     * @notice Deploy the pool
     * @param _stakedToken: staked token address
     * @param _rewardToken: reward token address
     * @param _rewardPerBlock: reward per block (in rewardToken)
     * @param _startBlock: start block
     * @param _endBlock: end block
     * @param _poolLimitPerUser: pool limit per user in stakedToken (if any, else 0)
     * @param _admin: admin address with ownership
     * @return address of new smart chef contract
     */
    function deployPool(
        address _stakedToken,
        address _rewardToken,
        uint256 _rewardPerBlock,
        uint256 _startBlock,
        uint256 _bonusEndBlock,
        uint256 _poolLimitPerUser,
        uint256 _lockPeriod,
        address _admin
    ) external onlyOwner {
        require(ERC20(_stakedToken).totalSupply() >= 0);
        require(ERC20(_rewardToken).totalSupply() >= 0);
        // require(_stakedToken != _rewardToken, "Tokens must be be different");

        // Calculate total rewards needed
        uint256 totalBlocks = _bonusEndBlock - _startBlock;
        uint256 totalRewardsNeeded = totalBlocks * _rewardPerBlock;

        // Transfer rewards from caller to factory
        require(
            IERC20(_rewardToken).transferFrom(
                msg.sender,
                address(this),
                totalRewardsNeeded
            ),
            "Failed to transfer rewards"
        );

        bytes memory bytecode = type(SmartChefInitializableV3).creationCode;
        bytes32 salt = keccak256(
            abi.encodePacked(_stakedToken, _rewardToken, _startBlock)
        );
        address smartChefAddress;

        assembly {
            smartChefAddress := create2(
                0,
                add(bytecode, 32),
                mload(bytecode),
                salt
            )
        }

        // Transfer rewards to the new pool before initialization
        IERC20(_rewardToken).transfer(smartChefAddress, totalRewardsNeeded);

        SmartChefInitializableV3(smartChefAddress).initialize(
            _stakedToken,
            _rewardToken,
            _rewardPerBlock,
            _startBlock,
            _bonusEndBlock,
            _poolLimitPerUser,
            _lockPeriod,
            _admin
        );

        emit NewSmartChefContract(smartChefAddress);
    }
}

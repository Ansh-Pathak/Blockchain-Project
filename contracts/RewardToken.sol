// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title RewardToken
/// @notice A standard ERC20 token minted to therapists as a reward when they
/// complete a session. These tokens are also intended to be the voting
/// weight used by the DAO governance contract (Day 4).
/// @dev Minting is restricted to a single "minter" address - in this project
/// that will be the SessionEscrow contract, so tokens can only be created as
/// a result of a real, verified completed session, not arbitrarily.
contract RewardToken is ERC20, Ownable {
    /// @notice The only address allowed to call mint(). Set by the owner
    /// after both this contract and SessionEscrow have been deployed.
    address public minter;

    event MinterUpdated(address indexed previousMinter, address indexed newMinter);

    modifier onlyMinter() {
        require(msg.sender == minter, "RewardToken: caller is not the minter");
        _;
    }

    /// @dev msg.sender (the deployer) becomes the owner, who can later set the minter.
    constructor() ERC20("MindChain Reward Token", "MIND") Ownable(msg.sender) {}

    /// @notice Sets which address is allowed to mint tokens. Meant to be
    /// called once, right after SessionEscrow is deployed, pointing at its address.
    function setMinter(address newMinter) external onlyOwner {
        emit MinterUpdated(minter, newMinter);
        minter = newMinter;
    }

    /// @notice Mints `amount` tokens to `to`. Only callable by SessionEscrow.
    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }
}

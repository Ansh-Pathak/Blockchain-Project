// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HelloMindChain
/// @notice Placeholder contract used only to verify the Hardhat setup
/// (compile, test, deploy) works end-to-end before the real contracts
/// (PatientRegistry, TherapistRegistry, SessionEscrow, RewardToken, Governance)
/// are added on Day 2-4. Safe to delete once those are in place.
contract HelloMindChain {
    string public projectName = "MindChain DAO";

    function ping() external pure returns (string memory) {
        return "MindChain DAO environment is working";
    }
}

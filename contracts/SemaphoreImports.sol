// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// This file exists solely to force Hardhat to compile the Semaphore protocol
// contracts from the @semaphore-protocol/contracts npm package. Without an
// explicit import somewhere in our contracts/ directory, Hardhat won't
// generate artifacts for them, and ethers.getContractFactory("Semaphore")
// will fail at deploy/test time.
//
// This file deploys nothing and costs nothing — it's just an import trigger.

import {Semaphore} from "@semaphore-protocol/contracts/Semaphore.sol";
import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";

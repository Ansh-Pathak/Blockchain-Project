import { useMemo } from "react";
import { Contract } from "ethers";
import { CONTRACT_ADDRESSES } from "../contracts/addresses";
import {
  PatientRegistryABI,
  TherapistRegistryABI,
  RewardTokenABI,
  SessionEscrowABI,
  MindChainGovernanceABI,
} from "../contracts/abis";

const ABIS = {
  PatientRegistry: PatientRegistryABI,
  TherapistRegistry: TherapistRegistryABI,
  RewardToken: RewardTokenABI,
  SessionEscrow: SessionEscrowABI,
  MindChainGovernance: MindChainGovernanceABI,
};

/**
 * useContract(name, signerOrProvider) - returns an ethers Contract instance
 * you can call functions on, e.g. contract.registerAsPatient().
 *
 * Pass a "signer" (from provider.getSigner()) when you need to WRITE to the
 * blockchain (send a transaction, costs gas, needs MetaMask approval).
 * Pass the plain "provider" when you only need to READ data (free, instant).
 *
 * useMemo just avoids recreating the Contract object on every single render
 * unless its inputs actually changed - a small performance habit, not
 * critical to understand deeply right now.
 */
export function useContract(name, signerOrProvider) {
  return useMemo(() => {
    if (!signerOrProvider) return null;
    return new Contract(CONTRACT_ADDRESSES[name], ABIS[name], signerOrProvider);
  }, [name, signerOrProvider]);
}

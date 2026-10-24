import { useState, useEffect, useCallback } from "react";
import { formatEther } from "ethers";
import { useContract } from "../contracts/useContract";

export function TokenBalancePanel({ provider, address }) {
  const contract = useContract("RewardToken", provider);
  const [balance, setBalance] = useState("0");

  const refresh = useCallback(async () => {
    if (!contract || !address) return;
    try {
      const raw = await contract.balanceOf(address);
      setBalance(formatEther(raw));
    } catch (err) {
      console.error("Error refreshing token balance:", err);
    }
  }, [contract, address]);

  useEffect(() => {
    if (!contract || !address) return;
    refresh();

    // ERC20's standard Transfer event fires on every mint/transfer. If it
    // involves our address (as sender or receiver), refresh the balance -
    // this is what makes the balance update live right after a session is
    // confirmed, with no manual refresh needed.
    const onTransfer = (from, to) => {
      if (from.toLowerCase() === address.toLowerCase() || to.toLowerCase() === address.toLowerCase()) {
        refresh();
      }
    };
    contract.on("Transfer", onTransfer);

    return () => {
      contract.off("Transfer", onTransfer);
    };
  }, [contract, address, refresh]);

  return (
    <div className="panel">
      <h2>MIND Token Balance</h2>
      <p className="big-number">{balance} MIND</p>
    </div>
  );
}

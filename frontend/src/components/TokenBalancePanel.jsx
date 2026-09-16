import { useState, useEffect } from "react";
import { formatEther } from "ethers";
import { useContract } from "../contracts/useContract";

export function TokenBalancePanel({ provider, address }) {
  const contract = useContract("RewardToken", provider);
  const [balance, setBalance] = useState("0");

  useEffect(() => {
    if (!contract || !address) return;
    refresh();
  }, [contract, address]);

  async function refresh() {
    const raw = await contract.balanceOf(address);
    // ERC20 balances are stored with 18 decimal places internally (like
    // storing cents instead of dollars). formatEther converts that back to
    // a normal human-readable number.
    setBalance(formatEther(raw));
  }

  return (
    <div className="panel">
      <h2>MIND Token Balance</h2>
      <p className="big-number">{balance} MIND</p>
      <button onClick={refresh}>Refresh</button>
    </div>
  );
}

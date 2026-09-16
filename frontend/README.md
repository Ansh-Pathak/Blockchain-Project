# MindChain DAO — Frontend

A React app (built with Vite) that connects a MetaMask wallet to the MindChain DAO smart contracts and lets you interact with every core module: patient registration & journaling, therapist applications & admin approval, session booking/escrow, MIND token balance, and DAO governance voting.

## One-time setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. **Add the local Hardhat network to MetaMask:**
   - Open MetaMask -> Networks -> Add a network -> Add a network manually
   - Network name: `Hardhat Local`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `1337`
   - Currency symbol: `ETH`

3. **Import a test account into MetaMask** so you have ETH to test with:
   - Run `npx hardhat node` in the main project folder (one level up) - it prints 20 accounts with private keys
   - In MetaMask: Account menu -> Add account or hardware wallet -> Import account -> paste one of the printed private keys
   - Import at least 2-3 different accounts (e.g. one to act as "patient", one as "therapist") so you can test the full flow by switching accounts in MetaMask

4. **Check contract addresses match your deployment.** Every time you restart `npx hardhat node` and redeploy, addresses may change if you've deployed anything before in that session. Compare the addresses printed by `npx hardhat run scripts/deploy-all.js --network localhost` against `src/contracts/addresses.js` and update if they differ.

## Running the app

In the main project folder (one level up), in a separate terminal, keep this running the whole time you're testing:
```bash
npx hardhat node
```

In another terminal, deploy the contracts to it:
```bash
npx hardhat run scripts/deploy-all.js --network localhost
```

Then, in this `frontend` folder:
```bash
npm run dev
```
Open the URL it prints (usually `http://localhost:5173`).

## Demo flow to test

1. Connect wallet (use the account you'll pretend is the "patient")
2. Register as a patient, log a journal entry
3. Switch MetaMask to a different account (pretend "therapist"), apply as a therapist
4. Switch back to the account you deployed contracts with (that's the `admin`), approve the therapist application by pasting their address
5. Switch to the patient account, book a session with the therapist's address
6. Switch to the therapist account, confirm the session - check the MIND token balance panel updates
7. Try creating a DAO proposal and voting (requires holding at least 1 MIND token, so use the therapist account after they've earned one from a completed session)

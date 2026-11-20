# GenLayer Portal Submission Fields (Ready for Human Submission)

> Copy-paste these fields into the GenLayer Builder Portal manually. Do not auto-submit.

## Contribution Type
`Projects / deployed contract` *(also eligible to submit `docs/TUTORIAL.md` separately as `Tutorial / documentation`)*

## One-Liner
Crowdfunded defensive patent prior-art anticipation protocol on GenLayer where validators map claim elements to immutable historical archives and plain code settles verified native payouts after finality.

## Description (strictly <= 1,000 characters)
PriorArtPool lets open-source communities crowdfund defensive patent bounties while researchers race to prove 35 U.S.C. § 102 anticipation via immutable third-party archives (IETF RFCs, Wikipedia revid API, CDX-verified Archive.org id_ captures, 40-hex GitHub commits). Plain code in PriorArtPool manages crowdfunding shares, anti-spam bonds, chronology gates (pub_date < priority_date), the All-Elements Matrix, per-element retries, locked judge wiring, non-stranding payable guards, and zero-dust pro-rata timeout refunds. PriorArtJudge executes narrow single-element LLM consensus via gl.vm.run_nondet_unsafe—checking SHA-256 slice digests and verbatim quotes in every validator's own copy—settling payouts strictly via emit(on='finalized') and native EthSend transfers. Proven live on StudioNet across 64 finalized txs (0 errors, verified real EOA balance deltas, live 2-researcher race, real USPTO patents) with a live React UI and verify:proof CLI.

## Live Links
- **Live Frontend:** https://prior-art-pool.vercel.app
- **Public GitHub Repo:** https://github.com/khezzed/Prior-Art-Pool
- **PriorArtPool Contract (Explorer):** https://explorer-studio.genlayer.com/address/0x7adb74f3A7cb166299E354C894cd2699a154ce2e
- **PriorArtJudge Contract (Explorer):** https://explorer-studio.genlayer.com/address/0xFd30Bc73881C7F10e675408DBc2B14Fb07393E15
- **EvidenceProbe Contract (Explorer):** https://explorer-studio.genlayer.com/address/0x3C4912006E0ab8d2e61Cc487a50ce61C10F2AF0A

## How-To Steps for Reviewers
1. Open https://prior-art-pool.vercel.app — no wallet required to inspect all 4 completed challenges, 6 prior-art submissions, verbatim validator quotes, SHA-256 slice digests, evidence URLs, GenLayer native appeal-window status, and finalized StudioNet Explorer links.
2. Toggle between **Recorded proof** (`deploy/proof.json`) and **Live RPC** (`https://studio.genlayer.com/api`) in the top header to cross-check live on-chain state and the conservation invariant (`501 inbound - 381 outbound == 120 wei live contract balance`).
3. Inspect Challenge #1 (`DRAFT-VAGUE-REJECT`, RuleGate rejection + `+101 wei` EOA refund), Challenge #2 (`US 10,103,888 B2`, live 2-researcher race where RFC 2104 wins `+120 wei` EOA payout and losing racer reclaims `+20 wei` bond), Challenge #3 (`US 10,728,041 B2`, symmetric All-Elements proof across Wikipedia rev `333954216`, CDX-verified Archive.org Hashcash FAQ, and post-dated RFC 9162), and Challenge #4 (`US-2025-1101-SEC`, live Wikipedia `Prompt_injection` defense + `+72 / +48 wei` EOA pro-rata timeout refunds).
4. Open the **Audit ledger** tab to inspect all 64 finalized parent, callback, and `EthSend` native transfer transactions with verified EOA balance deltas and appeal-window states.
5. Optional CLI check: clone `https://github.com/khezzed/Prior-Art-Pool`, run `npm install && npm run verify:proof` to verify live `gen_getContractCode` byte-for-byte source hashes, vault conservation (`120 == 120 wei`), and all 64 finalized StudioNet transactions; run `pytest tests/direct -v` for all 12 local unit & Byzantine consensus tests.
6. Optional **Wallet workbench** tab: connect MetaMask (auto-switches to StudioNet Chain 61999), click **Request 1 testnet GEN**, and execute live challenge/crowdfund/submit/map/claim flows with the resumable 5-state finality monitor.

## Expected Outcome
- Frontend loads immediately without a wallet, showing all 6 finalized outcomes, verbatim quotes, appeal-window states, verified EOA deltas, immutable archive links, and a passing Live RPC cross-check (`Conserved`).
- `npm run verify:proof` exits 0 confirming live on-chain `gen_getContractCode` byte-for-byte matches for all 3 contracts, conservation (`120 == 120 wei`), and 64 finalized StudioNet transactions with 0 errors.
- `pytest tests/direct -v` passes 12/12 local unit and Byzantine consensus tests.

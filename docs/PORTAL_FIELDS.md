# GenLayer Portal Submission Fields (Ready for Human Submission)

> Copy-paste these fields into the GenLayer Builder Portal manually. Do not auto-submit.

## Contribution Type
`Projects / deployed contract` *(also eligible to submit `docs/TUTORIAL.md` separately as `Tutorial / documentation`)*

## One-Liner
Crowdfunded defensive patent prior-art anticipation protocol on GenLayer where validators map claim elements to immutable historical archives and plain code settles payouts after finality.

## Description (strictly <= 1,000 characters)
PriorArtPool lets open-source ecosystems crowdfund defensive patent bounties while researchers race to prove 35 U.S.C. § 102 anticipation using immutable third-party archives (IETF RFCs, Wikipedia revid API, CDX-verified Archive.org id_ captures, and 40-hex GitHub commits). Plain code in PriorArtPool handles multi-sponsor crowdfunding, anti-spam bonds, chronology checks (pub_date < priority_date), the conjunctive All-Elements Matrix, non-stranding payable guards, and zero-dust pro-rata timeout refunds. PriorArtJudge executes narrow single-element LLM consensus via gl.vm.run_nondet_unsafe—verifying SHA-256 slice digests and verbatim quotes in every validator's own copy—and settles payouts only inside emit(on='finalized') callbacks. Proven live on StudioNet across 57 finalized txs (vague RuleGate rejection, RFC 2104 win, Wikipedia partial rejection, Archive.org CDX, RFC 6962 post-dating, prompt injection defense, pro-rata refund) with a live React UI and verify:proof CLI.

## Live Links
- **Live Frontend:** https://prior-art-pool.vercel.app
- **Public GitHub Repo:** https://github.com/khezzed/Prior-Art-Pool
- **PriorArtPool Contract (Explorer):** https://explorer-studio.genlayer.com/address/0x8d448f8e7Acca6459bE3cf4B80ccc17BcA4957FE
- **PriorArtJudge Contract (Explorer):** https://explorer-studio.genlayer.com/address/0x2Ed9A19063E082b6c829b370e0D3374be37f40C3
- **EvidenceProbe Contract (Explorer):** https://explorer-studio.genlayer.com/address/0x3C4912006E0ab8d2e61Cc487a50ce61C10F2AF0A

## How-To Steps for Reviewers
1. Open https://prior-art-pool.vercel.app — no wallet required to inspect all 4 completed challenges, 5 prior-art submissions, verbatim validator quotes, SHA-256 slice digests, evidence URLs, and finalized StudioNet Explorer transaction links.
2. Toggle between **Recorded Proof** (`deploy/proof.json`) and **Live RPC Read** (`https://studio.genlayer.com/api`) in the header to verify live on-chain state and the conservation invariant (`481 inbound - 361 outbound == 120 wei contract balance`).
3. Inspect Challenge #1 (RuleGate `REJECTED_VAGUE` + safe refund), Challenge #2 (2-sponsor crowdfund + RFC 2104 2-element anticipation win), Challenge #3 (Wikipedia partial rejection + Archive.org CDX-verified disclosure + RFC 6962 deterministic `POST_DATED` rejection), and Challenge #4 (live `Open-Prompt-Injection` defense + pro-rata timeout refund).
4. Optional CLI check: clone `https://github.com/khezzed/Prior-Art-Pool`, run `npm install && npm run verify:proof` to re-verify all 57 finalized transactions and SHA-256 source hashes live against StudioNet, and `pytest tests/direct -v` for all 11 direct-mode & Byzantine consensus tests.
5. Optional Wallet Flows tab: connect MetaMask (auto-switches to StudioNet Chain 61999), click **+1 Testnet GEN**, and test opening/crowdfunding/submitting/mapping/claiming with the resumable 5-state transaction & appeal-window tracker.

## Expected Outcome
- Frontend loads immediately without a wallet, displaying all 6 finalized outcomes with verbatim quotes, immutable archive links, explorer tx links, and a passing Live RPC cross-check (`INVARIANT HOLDS ✓`).
- `npm run verify:proof` exits 0 confirming all 3 contract SHA-256 digests, live conservation (`net_liabilities=120 == live_contract_balance=120 wei`), and 57 finalized StudioNet transactions.
- `pytest tests/direct -v` passes 11/11 unit and Byzantine consensus tests.

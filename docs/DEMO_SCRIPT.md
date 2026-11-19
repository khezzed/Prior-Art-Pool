# PriorArtPool — Two-Minute Reviewer Demo Script

**Goal:** Show a GenLayer Portal steward every mechanism, live finalized verdict, verbatim quote, explorer transaction, and accounting invariant in under 2 minutes—without needing to connect a wallet first.

---

## 0:00 – 0:20 | Framing the Problem & Architecture
- Open the deployed **PriorArtPool** frontend URL.
- Point out the top telemetry bar showing **GenLayer StudioNet (Chain ID 61999)**, all three deployed contract links (`PriorArtPool`, `PriorArtJudge`, `EvidenceProbe`), and the **Financial Conservation Invariant (`INVARIANT HOLDS ✓`)**.
- Click **"Live RPC Read"** vs **"Recorded Proof"** in the top-right toggle to demonstrate explicit separation between the static `deploy/proof.json` snapshot and live read-only `readContract` queries hitting `https://studio.genlayer.com/api` right now.

## 0:20 – 0:45 | Case 1: Up-Front RuleGate & Non-Stranding Payable Safety
- Click **Challenge #1 (`US-VAGUE-2020-001`)**.
- Show that subjective marketing claims (*"revolutionary, intuitive, best-in-class"*) were rejected up front by decentralized validators (`REJECTED_VAGUE`) via `emit(on="finalized")`.
- Point out in the **Finalized StudioNet Proof Ledger** below that both the `100 wei` RuleGate deposit and the `1 wei` invalid-date payable test were credited cleanly to `refundable_balances` and withdrawn with zero wei stranded.

## 0:45 – 1:15 | Case 2: Multi-Sponsor Crowdfund + § 102 Anticipation Win (RFC 2104)
- Click **Challenge #2 (`US-HMAC-2002-042`, Priority `2002-01-01`)**.
- Show the **2-sponsor crowdfund breakdown** (`50 wei` Sponsor A + `50 wei` Sponsor B = `100 wei`).
- Inspect **Submission #1 (`IETF RFC 2104`, Feb 1997)**:
  - Point to **Element E0** and **Element E1**, both finalized `DISCLOSED` in separate narrow transactions.
  - Read the **Validator-Verified Verbatim Excerpts** and matching **SHA-256 Slice Digests**—highlighting that the patent claim never used the words `"HMAC"`, `"ipad"`, or `"opad"`, proving real LLM semantic judgment.
  - Click the StudioNet Explorer tx links showing parent tx + emitted `emit(on="finalized")` callback child txs, ending in Researcher 1's `120 wei` finalized payout.

## 1:15 – 1:40 | Cases 3 & 4: All-Elements Rule, Archive.org CDX & Post-Dated Rejection
- Click **Challenge #3 (`US-HYBRID-2011-088`, Priority `2011-01-01`)**.
- Show three real public archives side-by-side:
  1. **Wikipedia `revid=333954216` (`2009-12-25`)**: `E0 DISCLOSED`, `E1 NOT_DISCLOSED` → disqualified under the All-Elements Rule; bond forfeited to the pool.
  2. **Archive.org `20040326113623id_` (Hashcash FAQ, `2004-03-26`)**: displays **`Archive.org id_ · CDX Verified ✓`** and verbatim quote on `E1 DISCLOSED`.
  3. **IETF RFC 6962 (`2013-06-30`)**: deterministically rejected as **`POST_DATED`** in plain Python (`2013-06-30 >= 2011-01-01`) without trusting the LLM for dates.

## 1:40 – 2:00 | Cases 5 & 6: Prompt Injection Defense + Pro-Rata Timeout Refund + CLI Verification
- Click **Challenge #4 (`US-INJ-TIMEOUT-2027`)**:
  - Show **Submission #5** (`liu00222/Open-Prompt-Injection/IgnoreAttacker.py`) containing `"Ignore previous instructions."` → neutralized inside `<UNTRUSTED_PRIOR_ART_EXCERPT>`, finalized `NOT_DISCLOSED`, `20 wei` attacker bond forfeited into the pool.
  - Show **Deterministic Timeout Fallback (`EXPIRED`)**: Sponsor A (`60%`) received `72 wei` and Sponsor B (`40%`) received `48 wei` (including their pro-rata shares of the attacker's forfeited bond!), leaving `0` dust.
- Switch briefly to the **Wallet Flows** tab to show human-approved StudioNet interactions and the 5-state **Resumable Transaction & Native Appeal Window Monitor**.
- Conclude in terminal with `npm run verify:proof` to confirm every contract hash, finalized transaction, and balance directly against StudioNet RPC.

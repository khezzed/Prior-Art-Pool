# PriorArtPool — Two-Minute Reviewer Demo Script

**Goal:** Show a GenLayer Portal steward every mechanism, live finalized verdict, verbatim quote, explorer transaction, real native EOA payout delta, and accounting invariant in under 2 minutes—without needing to connect a wallet first.

---

## 0:00 – 0:20 | Framing the Problem, Archival Dossier & Live RPC Cross-Check
- Open [https://prior-art-pool.vercel.app](https://prior-art-pool.vercel.app) (no wallet connection required).
- Point out the left **Patent docket** rail showing **Vault accounting (`Conserved`)**, exact `501 wei inbound / 381 wei outbound / 120 wei live contract balance`, and Explorer links to all three deployed contracts (`PriorArtPool`, `PriorArtJudge`, `EvidenceProbe`).
- Toggle **Recorded proof** vs **Live RPC** in the top header to prove explicit separation between the static `deploy/proof.json` snapshot and live read-only `readContract` queries hitting `https://studio.genlayer.com/api` right now.

## 0:20 – 0:40 | Case 1: Up-Front RuleGate & Non-Stranding Payable Safety
- Select **Challenge #1 (`DRAFT-VAGUE-REJECT`)** in the docket rail.
- Show that subjective marketing claims (*"revolutionary, intuitive, best-in-class"*) were rejected up front by decentralized validators (`REJECTED_VAGUE`) via `emit(on="finalized")` before submissions ever opened.
- Point out the **GenLayer native appeal window** lifecycle indicator (`Finalized · 0 appeals filed`) and note that Sponsor A withdrew `101 wei` (`100 wei` RuleGate deposit + `1 wei` invalid-date guard) with a verified real EOA balance delta of **`+101 wei`**.

## 0:40 – 1:15 | Case 2: Real USPTO Patent, Live 2-Researcher Race & § 102 Win
- Select **Challenge #2 (`US 10,103,888 B2`, Dyadic Security, Priority `2015-11-22`)**.
- Show the **2-sponsor crowdfund** (`50 wei` Sponsor A + `50 wei` Sponsor B = `100 wei`) and frozen claim elements (which specify `0x36`/`0x5C` XOR padding and nested two-pass hashing without naming `"HMAC"`).
- Point out **BOTH competing researcher submissions** in the live race:
  1. **Submission #1 (`Wikipedia: HMAC rev 31406215`, `2005-12-15`)**: Researcher 2 entered concurrently; once Researcher 1 won, Researcher 2 executed **`reclaim_superseded_bond(1)` + `withdraw_refund()`** live and received **`+20 wei`** real EOA balance delta (`SUPERSEDED_REFUNDED`).
  2. **Submission #2 (`IETF RFC 2104`, `1997-02-28`)**: Researcher 1 finalized **Element 0** and **Element 1** in two separate narrow consensus transactions (`DISCLOSED`). Read the distinct **Validator-verified verbatim excerpts** (`ipad = the byte 0x36... / opad = the byte 0x5C...` on E0; `H(K XOR opad, H(K XOR ipad, text))` on E1) and SHA-256 slice digests. Researcher 1 claimed **`+120 wei`** verified EOA payout via `EthSend`.

## 1:15 – 1:40 | Cases 3 & 4: Symmetric All-Elements Proof, Archive.org CDX & Post-Dated Gate
- Select **Challenge #3 (`US 10,728,041 B2`, Amazon Technologies, Priority `2016-12-23`)**.
- Walk through all three real third-party archives side-by-side (zero half-mapped submissions):
  1. **Submission #3 (`Wikipedia Merkle_tree rev 333954216`, `2009-12-25`)**: `E0 DISCLOSED`, `E1 NOT_DISCLOSED` → disqualified (`20 wei` bond forfeited).
  2. **Submission #4 (`Archive.org 20040326113623id_` Hashcash FAQ, `2004-03-26`)**: shows **`Archive.org raw id_ (CDX verified)`**, `E1 DISCLOSED`, `E0 NOT_DISCLOSED` → disqualified (`20 wei` bond forfeited, completing the symmetric All-Elements proof!).
  3. **Submission #5 (`IETF RFC 9162`, `2021-12-31`)**: deterministically rejected as **`POST_DATED`** in plain Python (`2021-12-31 >= 2016-12-23`) without trusting the LLM for dates (`20 wei` bond forfeited; active pool grew to `120 wei`).

## 1:40 – 2:00 | Cases 5 & 6: Prompt Injection Defense, Pro-Rata Timeout & CLI Proof
- Select **Challenge #4 (`US-2025-1101-SEC`, Priority `2025-11-01`)**:
  - Show **Submission #6** (`Wikipedia Prompt_injection rev 1289403591`, `2025-05-08`) anchored directly on `"Ignore the above directions"` → neutralized inside `<UNTRUSTED_PRIOR_ART_EXCERPT>`, finalized `NOT_DISCLOSED`, `20 wei` attacker bond forfeited.
  - Show **Deterministic Timeout Fallback (`EXPIRED`)**: Sponsor A (`60%`) received **`+72 wei`** and Sponsor B (`40%`) received **`+48 wei`** (real EOA balance deltas including pro-rata shares of the forfeited attacker bond, `0` dust).
- Click **Audit ledger** to show all 64 finalized parent, callback, and `EthSend` native-transfer transactions with the **Finality & appeal window** column and **Verified EOA balance delta** annotations.
- Conclude in terminal with `npm run verify:proof` to independently verify live `gen_getContractCode` byte-for-byte source hashes, vault conservation (`120 == 120 wei`), and all 64 finalized StudioNet transactions.

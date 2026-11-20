import json
import pytest

OWNER = "0x1111111111111111111111111111111111111111"
SPONSOR_A = "0x2222222222222222222222222222222222222222"
SPONSOR_B = "0x3333333333333333333333333333333333333333"
RESEARCHER_1 = "0x4444444444444444444444444444444444444444"
RESEARCHER_2 = "0x5555555555555555555555555555555555555555"
JUDGE_ADDR = "0x9999999999999999999999999999999999999999"

RFC_2104 = "https://www.rfc-editor.org/rfc/rfc2104.txt"
RFC_6962 = "https://www.rfc-editor.org/rfc/rfc6962.txt"
WIKI_MERKLE = "https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=timestamp|content&format=json&revids=333954216"
ARCHIVE_HASHCASH = "https://web.archive.org/web/20040326113623id_/http://www.hashcash.org/faq/"
MUTABLE_GH = "https://raw.githubusercontent.com/org/repo/main/README.md"

VALID_ELEMENTS = json.dumps(
    [
        "Combines a shared secret key with two distinct fixed padding byte strings via bitwise XOR to form inner and outer key masks.",
        "Computes an authentication digest via a nested two-pass cryptographic hash applying the inner mask first and the outer mask second.",
    ]
)


def assert_conserved(pool):
    acc = json.loads(pool.get_accounting_summary())
    assert acc["invariant_holds"] is True, f"Conservation broken: {acc}"
    return acc


def deploy_pool(genvm):
    from contracts.prior_art_pool import PriorArtPool

    genvm.set_context(OWNER, value=0)
    pool = PriorArtPool(judge_address=JUDGE_ADDR, vetting_timeout_seconds=300)
    assert_conserved(pool)
    return pool


def test_rulegate_rejection_and_safe_refund(genvm):
    pool = deploy_pool(genvm)
    genvm.set_context(SPONSOR_A, value=100)
    out = pool.open_challenge("US-VAGUE-001", "2020-01-01", VALID_ELEMENTS, 600, 60, 20)
    assert out.startswith("CHALLENGE_PENDING_VETTING:1:")
    assert len(genvm.emitted_calls) == 1
    assert genvm.emitted_calls[0]["on"] == "finalized"
    assert genvm.emitted_calls[0]["method"] == "vet_claim_elements"
    assert_conserved(pool)

    # Judge rejects vague elements via finalized callback
    genvm.set_context(JUDGE_ADDR, value=0)
    cb = pool.on_challenge_vetted(1, json.dumps({"verdict": "REJECTED_VAGUE", "reason": "Subjective terms"}))
    assert cb == "CHALLENGE_REJECTED_VAGUE:1:REFUNDED_100"
    assert_conserved(pool)

    # Sponsor withdraws full refund via EthSend native EOA transfer
    genvm.set_context(SPONSOR_A, value=0)
    wd = pool.withdraw_refund()
    assert wd == f"REFUND_WITHDRAWN:{SPONSOR_A}:100"
    assert genvm.emitted_transfers[-1] == {
        "recipient": SPONSOR_A,
        "value": 100,
        "on": "finalized",
        "kind": "EthSend",
    }
    acc = assert_conserved(pool)
    assert acc["total_inbound"] == 100 and acc["total_outbound"] == 100 and acc["net_liabilities"] == 0


def test_payable_invalid_inputs_never_strand_wei(genvm):
    pool = deploy_pool(genvm)
    # Invalid priority date with 5 wei -> credits refundable instead of stranding
    genvm.set_context(SPONSOR_A, value=5)
    res1 = pool.open_challenge("US-BAD", "not-a-date", VALID_ELEMENTS, 600, 60, 10)
    assert res1 == "ERROR:INVALID_PRIORITY_DATE:CREDITED_5"

    # Open a valid challenge then submit mutable /main/ URL with 25 wei -> credited safely
    genvm.set_context(SPONSOR_A, value=50)
    pool.open_challenge("US-OK-1", "2002-01-01", VALID_ELEMENTS, 600, 60, 20)
    genvm.set_context(JUDGE_ADDR, value=0)
    pool.on_challenge_vetted(1, json.dumps({"verdict": "ACCEPTED"}))

    genvm.set_context(RESEARCHER_1, value=25)
    res2 = pool.submit_prior_art(1, "Mutable branch", MUTABLE_GH)
    assert res2 == "ERROR:MUTABLE_OR_UNSUPPORTED_URL:CREDITED_25"
    assert_conserved(pool)

    # Both recover every single wei
    genvm.set_context(SPONSOR_A, value=0)
    assert pool.withdraw_refund() == f"REFUND_WITHDRAWN:{SPONSOR_A}:5"
    genvm.set_context(RESEARCHER_1, value=0)
    assert pool.withdraw_refund() == f"REFUND_WITHDRAWN:{RESEARCHER_1}:25"
    assert_conserved(pool)


def test_crowdfund_multi_researcher_race_and_all_elements_win(genvm):
    pool = deploy_pool(genvm)

    # Sponsor A opens with 50 wei; Judge accepts
    genvm.set_context(SPONSOR_A, value=50)
    pool.open_challenge("US-HMAC-2002", "2002-01-01", VALID_ELEMENTS, 600, 60, 20)
    genvm.set_context(JUDGE_ADDR, value=0)
    pool.on_challenge_vetted(1, json.dumps({"verdict": "ACCEPTED"}))

    # Sponsor B crowdfunds +50 wei -> 100 wei pool
    genvm.set_context(SPONSOR_B, value=50)
    assert pool.contribute_bounty(1) == "CONTRIBUTED:1:50:POOL_100"

    # Researcher 1 & Researcher 2 race simultaneously with different immutable references
    genvm.set_context(RESEARCHER_1, value=20)
    assert pool.submit_prior_art(1, "IETF RFC 2104", RFC_2104) == "PRIOR_ART_SUBMITTED:1:CHALLENGE_1"
    genvm.set_context(RESEARCHER_2, value=20)
    assert pool.submit_prior_art(1, "Wikipedia Merkle Tree", WIKI_MERKLE) == "PRIOR_ART_SUBMITTED:2:CHALLENGE_1"
    assert_conserved(pool)

    # Researcher 1 maps Element 0 -> DISCLOSED (1 of 2; not yet won!)
    genvm.set_context(RESEARCHER_1, value=0)
    pool.map_claim_element(1, 0, "ipad = the byte 0x36")
    genvm.set_context(JUDGE_ADDR, value=0)
    r0 = pool.on_element_judged(
        1,
        0,
        json.dumps(
            {
                "verdict": "DISCLOSED",
                "pub_date_iso": "1997-02-28",
                "source_type": "rfc",
                "slice_digest": "a" * 64,
                "verbatim_quote": "ipad = the byte 0x36 repeated B times",
            }
        ),
    )
    assert r0 == "ELEMENT_DISCLOSED:1:E0:1_OF_2"
    assert json.loads(pool.get_challenge(1))["status"] == "OPEN"

    # Researcher 1 maps Element 1 -> DISCLOSED (2 of 2 -> FIRST COMPLETE CHART WINS!)
    genvm.set_context(RESEARCHER_1, value=0)
    pool.map_claim_element(1, 1, "H(K XOR opad")
    genvm.set_context(JUDGE_ADDR, value=0)
    r1 = pool.on_element_judged(
        1,
        1,
        json.dumps(
            {
                "verdict": "DISCLOSED",
                "pub_date_iso": "1997-02-28",
                "source_type": "rfc",
                "slice_digest": "b" * 64,
                "verbatim_quote": "H(K XOR opad, H(K XOR ipad, text))",
            }
        ),
    )
    assert r1 == "ANTICIPATED_WINNER:1:SUB_1:PAYOUT_120"
    assert_conserved(pool)

    # Winner claims 120 wei (100 pool + 20 bond)
    genvm.set_context(RESEARCHER_1, value=0)
    assert pool.claim_payout() == f"PAYOUT_CLAIMED:{RESEARCHER_1}:120"

    # Competing honest Researcher 2 reclaims their 20 wei bond safely!
    genvm.set_context(RESEARCHER_2, value=0)
    assert pool.reclaim_superseded_bond(2) == "BOND_RECLAIMED:2:20"
    assert pool.withdraw_refund() == f"REFUND_WITHDRAWN:{RESEARCHER_2}:20"
    acc = assert_conserved(pool)
    assert acc["net_liabilities"] == 0 and acc["total_outbound"] == 140


def test_partial_disclosure_postdated_forfeiture_and_pro_rata_timeout_refund(genvm):
    pool = deploy_pool(genvm)

    # Sponsor A (60 wei) + Sponsor B (40 wei) open 100 wei pool with 120s duration + 20s grace
    genvm.set_context(SPONSOR_A, value=60)
    pool.open_challenge("US-HYBRID-2011", "2011-01-01", VALID_ELEMENTS, 120, 20, 20)
    genvm.set_context(JUDGE_ADDR, value=0)
    pool.on_challenge_vetted(1, json.dumps({"verdict": "ACCEPTED"}))
    genvm.set_context(SPONSOR_B, value=40)
    pool.contribute_bounty(1)

    # Submission 1: Partial disclosure fails on Element 1 -> bond forfeited to pool (100 -> 120)
    genvm.set_context(RESEARCHER_1, value=20)
    pool.submit_prior_art(1, "Wiki Merkle 2009", WIKI_MERKLE)
    genvm.set_context(RESEARCHER_1, value=0)
    pool.map_claim_element(1, 0, "Hash trees")
    genvm.set_context(JUDGE_ADDR, value=0)
    pool.on_element_judged(1, 0, json.dumps({"verdict": "DISCLOSED", "verbatim_quote": "Hash trees or Merkle trees"}))
    genvm.set_context(RESEARCHER_1, value=0)
    pool.map_claim_element(1, 1, "Hash trees")
    genvm.set_context(JUDGE_ADDR, value=0)
    dq1 = pool.on_element_judged(1, 1, json.dumps({"verdict": "NOT_DISCLOSED", "reason": "Missing mechanism"}))
    assert dq1 == "SUBMISSION_DISQUALIFIED:1:NOT_DISCLOSED:BOND_FORFEITED_20"

    # Submission 2: Post-dated RFC 6962 -> bond forfeited to pool (120 -> 140)
    genvm.set_context(RESEARCHER_2, value=20)
    pool.submit_prior_art(1, "RFC 6962 (2013)", RFC_6962)
    genvm.set_context(RESEARCHER_2, value=0)
    pool.map_claim_element(2, 0, "Certificate Transparency")
    genvm.set_context(JUDGE_ADDR, value=0)
    dq2 = pool.on_element_judged(2, 0, json.dumps({"verdict": "POST_DATED", "pub_date_iso": "2013-06-30"}))
    assert dq2 == "SUBMISSION_DISQUALIFIED:2:POST_DATED:BOND_FORFEITED_20"
    assert_conserved(pool)

    # Cannot expire before grace deadline
    genvm.set_context(SPONSOR_A, value=0)
    with pytest.raises(Exception, match="GRACE_DEADLINE_NOT_REACHED"):
        pool.expire_challenge(1)

    # Advance past duration (120) + grace (20) = 140s
    genvm.advance_time(145)
    exp = pool.expire_challenge(1)
    assert exp == "CHALLENGE_EXPIRED:1:DISTRIBUTABLE_140"

    # Sponsor A contributed 60% -> 84 wei; Sponsor B contributed 40% -> 56 wei (84 + 56 == 140, zero dust!)
    genvm.set_context(SPONSOR_A, value=0)
    assert pool.claim_pro_rata_refund(1) == f"PRO_RATA_REFUNDED:1:{SPONSOR_A}:84"
    genvm.set_context(SPONSOR_B, value=0)
    assert pool.claim_pro_rata_refund(1) == f"PRO_RATA_REFUNDED:1:{SPONSOR_B}:56"

    # Double claim blocked
    with pytest.raises(Exception, match="NO_PRO_RATA_REFUND_DUE"):
        pool.claim_pro_rata_refund(1)

    acc = assert_conserved(pool)
    assert acc["net_liabilities"] == 0 and acc["total_inbound"] == 140 and acc["total_outbound"] == 140


def test_stalled_vetting_timeout_and_unauthorized_callback_guards(genvm):
    pool = deploy_pool(genvm)
    genvm.set_context(SPONSOR_A, value=75)
    pool.open_challenge("US-STALLED", "2010-01-01", VALID_ELEMENTS, 600, 60, 10)

    # Random attacker AND contract owner CANNOT spoof judge callback (zero owner backdoor!)
    genvm.set_context(RESEARCHER_1, value=0)
    with pytest.raises(Exception, match="UNAUTHORIZED_CALLBACK"):
        pool.on_challenge_vetted(1, json.dumps({"verdict": "ACCEPTED"}))
    genvm.set_context(OWNER, value=0)
    with pytest.raises(Exception, match="UNAUTHORIZED_CALLBACK"):
        pool.on_challenge_vetted(1, json.dumps({"verdict": "ACCEPTED"}))
    with pytest.raises(Exception, match="JUDGE_ALREADY_LOCKED"):
        pool.set_judge(RESEARCHER_2)

    # Cannot reclaim vetting before timeout
    genvm.set_context(RESEARCHER_1, value=0)
    with pytest.raises(Exception, match="VETTING_DEADLINE_NOT_REACHED"):
        pool.reclaim_stalled_vetting(1)

    # After vetting timeout (300s), deterministic fallback returns 75 wei cleanly
    genvm.advance_time(305)
    assert pool.reclaim_stalled_vetting(1) == "VETTING_EXPIRED:1:REFUNDED_75"
    genvm.set_context(SPONSOR_A, value=0)
    assert pool.withdraw_refund() == f"REFUND_WITHDRAWN:{SPONSOR_A}:75"
    assert_conserved(pool)


def test_per_element_stalled_pending_retry_fallback(genvm):
    from contracts.prior_art_pool import PriorArtPool

    genvm.set_context(OWNER, value=0)
    pool = PriorArtPool(judge_address=JUDGE_ADDR, vetting_timeout_seconds=300, element_timeout_seconds=120)
    genvm.set_context(SPONSOR_A, value=50)
    pool.open_challenge("US-RETRY-TEST", "2015-11-22", VALID_ELEMENTS, 1800, 60, 20)
    genvm.set_context(JUDGE_ADDR, value=0)
    pool.on_challenge_vetted(1, json.dumps({"verdict": "ACCEPTED"}))

    genvm.set_context(RESEARCHER_1, value=20)
    pool.submit_prior_art(1, "IETF RFC 2104", RFC_2104)

    # Map E0 -> stuck in PENDING
    genvm.set_context(RESEARCHER_1, value=0)
    pool.map_claim_element(1, 0, "ipad")
    with pytest.raises(Exception, match="ELEMENT_ALREADY_PENDING"):
        pool.map_claim_element(1, 0, "ipad")

    # After element_timeout_seconds (120s), deterministic retry succeeds without waiting for challenge expiry!
    genvm.advance_time(125)
    assert pool.map_claim_element(1, 0, "ipad = the byte 0x36") == "ELEMENT_MAPPING_DISPATCHED:1:E0"
    assert_conserved(pool)


def test_zero_dust_odd_pro_rata_split_and_insufficient_evidence_retry(genvm):
    pool = deploy_pool(genvm)
    # 3 sponsors contribute 10 + 10 + 10 = 30, plus 11 wei forfeited bond -> 41 wei split 3 ways (13+13+13 + 2 dust -> creator gets 15)
    genvm.set_context(SPONSOR_A, value=10)
    pool.open_challenge("US-ODD-DUST", "2010-01-01", VALID_ELEMENTS, 120, 20, 11)
    genvm.set_context(JUDGE_ADDR, value=0)
    pool.on_challenge_vetted(1, json.dumps({"verdict": "ACCEPTED"}))
    genvm.set_context(SPONSOR_B, value=10)
    pool.contribute_bounty(1)
    genvm.set_context(OWNER, value=10)
    pool.contribute_bounty(1)

    # Researcher 1 submits & hits non-fatal INSUFFICIENT_EVIDENCE -> allowed to retry!
    genvm.set_context(RESEARCHER_1, value=11)
    pool.submit_prior_art(1, "Wiki Merkle", WIKI_MERKLE)

    # Duplicate URL on same challenge refunded cleanly (never stranded)
    genvm.set_context(RESEARCHER_2, value=11)
    dup = pool.submit_prior_art(1, "Duplicate Wiki", WIKI_MERKLE)
    assert dup == "ERROR:DUPLICATE_REFERENCE_URL:CREDITED_11"
    genvm.set_context(RESEARCHER_2, value=0)
    assert pool.withdraw_refund() == f"REFUND_WITHDRAWN:{RESEARCHER_2}:11"

    # Non-researcher cannot map someone else's submission
    with pytest.raises(Exception, match="UNAUTHORIZED_RESEARCHER"):
        pool.map_claim_element(1, 0, "Hash trees")

    # Researcher 1 maps -> INSUFFICIENT_EVIDENCE -> retries -> NOT_DISCLOSED (bond forfeited -> 41 wei pool)
    genvm.set_context(RESEARCHER_1, value=0)
    pool.map_claim_element(1, 0, "bad-anchor")
    genvm.set_context(JUDGE_ADDR, value=0)
    assert pool.on_element_judged(1, 0, json.dumps({"verdict": "INSUFFICIENT_EVIDENCE"})) == "ELEMENT_INSUFFICIENT_EVIDENCE:1:E0"
    genvm.set_context(RESEARCHER_1, value=0)
    pool.map_claim_element(1, 0, "Hash trees")
    genvm.set_context(JUDGE_ADDR, value=0)
    assert pool.on_element_judged(1, 0, json.dumps({"verdict": "NOT_DISCLOSED"})) == "SUBMISSION_DISQUALIFIED:1:NOT_DISCLOSED:BOND_FORFEITED_11"

    # Expire -> 41 wei distributed as 15 (creator SPONSOR_A) + 13 (SPONSOR_B) + 13 (OWNER) == 41!
    genvm.advance_time(145)
    assert pool.expire_challenge(1) == "CHALLENGE_EXPIRED:1:DISTRIBUTABLE_41"
    genvm.set_context(SPONSOR_A, value=0)
    assert pool.claim_pro_rata_refund(1) == f"PRO_RATA_REFUNDED:1:{SPONSOR_A}:15"
    genvm.set_context(SPONSOR_B, value=0)
    assert pool.claim_pro_rata_refund(1) == f"PRO_RATA_REFUNDED:1:{SPONSOR_B}:13"
    genvm.set_context(OWNER, value=0)
    assert pool.claim_pro_rata_refund(1) == f"PRO_RATA_REFUNDED:1:{OWNER}:13"
    acc = assert_conserved(pool)
    assert acc["net_liabilities"] == 0 and acc["total_pool_locked"] == 0

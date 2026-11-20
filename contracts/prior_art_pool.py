# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import hashlib
import json
import re
from datetime import datetime, timezone


@gl.evm.contract_interface
class EoaTransfer:
    class View:
        pass

    class Write:
        pass


def _is_valid_iso_date(date_str: str) -> bool:
    if not isinstance(date_str, str):
        return False
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", date_str.strip())
    if not m:
        return False
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 1970 or y > 2100 or mo < 1 or mo > 12 or d < 1 or d > 31:
        return False
    return True


def _is_valid_wiki_api_url(u: str) -> bool:
    prefix = "https://en.wikipedia.org/w/api.php?"
    if not u.startswith(prefix):
        return False
    qs = u[len(prefix) :]
    if not qs or "#" in qs or " " in qs:
        return False
    params = {}
    for pair in qs.split("&"):
        if "=" not in pair:
            return False
        k, v = pair.split("=", 1)
        params[k] = v
    if params.get("action") != "query" or params.get("prop") != "revisions" or params.get("format") != "json":
        return False
    revids = params.get("revids", "")
    if not re.match(r"^\d+$", revids):
        return False
    rvprop_parts = set(params.get("rvprop", "").replace("%7C", "|").replace("%7c", "|").split("|"))
    return "timestamp" in rvprop_parts and "content" in rvprop_parts


def _is_valid_immutable_url(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    u = url.strip()
    if len(u) > 512:
        return False
    # 1. Official IETF RFC plain-text archive
    if re.match(r"^https://www\.rfc-editor\.org/rfc/rfc\d{1,5}\.txt$", u):
        return True
    # 2. Wikipedia permanent revision API (order-independent query params)
    if _is_valid_wiki_api_url(u):
        return True
    # 3. Archive.org raw id_ capture (no mutable toolbar; CDX-verified in PriorArtJudge)
    if re.match(r"^https://web\.archive\.org/web/\d{14}id_/https?://.+$", u):
        return True
    # 4. GitHub pinned 40-hex commit SHA (mutable branches like /main/ rejected)
    if re.match(
        r"^https://raw\.githubusercontent\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/[0-9a-fA-F]{40}/.+$",
        u,
    ):
        return True
    return False


def _utc_date_from_ts(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")


class PriorArtPool(gl.Contract):
    """
    PriorArtPool (v2 Hardened): Deterministic crowdfunded defensive patent prior-art vault & claim-chart engine.
    - 100% deterministic: zero LLM or web calls; zero owner verdict backdoor.
    - One-time immutable wiring via set_judge(); callbacks strictly accept only self.judge_address.
    - Dispatches narrow judgments via emit(on='finalized') after GenLayer's native appeal window.
    - Delivers real native wei to EOAs via @gl.evm.contract_interface EoaTransfer (EthSend).
    - Never strands native deposits on payable validation errors (credits refundable_balances).
    - Enforces All-Elements Rule (35 U.S.C. § 102), per-element pending retry timeouts, and exact conservation:
      total_pool_locked + total_bonds_held + total_claimable + total_refundable == total_inbound - total_outbound
    """

    owner: str
    judge_address: str
    vetting_timeout_seconds: u256
    element_timeout_seconds: u256

    challenge_count: u256
    submission_count: u256

    challenges: TreeMap[u256, str]
    submissions: TreeMap[u256, str]
    challenge_submissions: TreeMap[u256, str]
    url_dedup: TreeMap[str, u256]

    claimable_balances: TreeMap[str, u256]
    refundable_balances: TreeMap[str, u256]

    total_pool_locked: u256
    total_bonds_held: u256
    total_claimable: u256
    total_refundable: u256
    total_inbound: u256
    total_outbound: u256

    def __init__(
        self,
        judge_address: str = "",
        vetting_timeout_seconds: int = 900,
        element_timeout_seconds: int = 600,
    ):
        super().__init__()
        self.owner = str(gl.message.sender_address).lower()
        self.judge_address = judge_address.strip() if judge_address else ""
        self.vetting_timeout_seconds = u256(max(60, int(vetting_timeout_seconds)))
        self.element_timeout_seconds = u256(max(60, int(element_timeout_seconds)))
        self.challenge_count = u256(0)
        self.submission_count = u256(0)
        self.total_pool_locked = u256(0)
        self.total_bonds_held = u256(0)
        self.total_claimable = u256(0)
        self.total_refundable = u256(0)
        self.total_inbound = u256(0)
        self.total_outbound = u256(0)

    def _now(self) -> int:
        raw = getattr(gl, "message_raw", None)
        if raw and isinstance(raw, dict) and "datetime" in raw:
            dt_raw = raw["datetime"]
            if isinstance(dt_raw, str):
                dt_str = dt_raw.replace("Z", "+00:00")
                return int(datetime.fromisoformat(dt_str).timestamp())
            if isinstance(dt_raw, (int, float)):
                return int(dt_raw)
        if hasattr(gl.message, "timestamp") and gl.message.timestamp:
            return int(gl.message.timestamp)
        return int(datetime.now(timezone.utc).timestamp())

    def _credit_refundable(self, addr: str, amount: int) -> None:
        if amount <= 0:
            return
        key = addr.lower()
        prev = int(self.refundable_balances[key]) if key in self.refundable_balances else 0
        self.refundable_balances[key] = u256(prev + amount)
        self.total_refundable = u256(int(self.total_refundable) + amount)

    def _credit_claimable(self, addr: str, amount: int) -> None:
        if amount <= 0:
            return
        key = addr.lower()
        prev = int(self.claimable_balances[key]) if key in self.claimable_balances else 0
        self.claimable_balances[key] = u256(prev + amount)
        self.total_claimable = u256(int(self.total_claimable) + amount)

    def _send_native_eoa(self, recipient: str, amount: int) -> None:
        EoaTransfer(Address(recipient)).emit_transfer(value=u256(amount))

    @gl.public.write
    def set_judge(self, judge_address: str) -> str:
        """One-time immutable wiring to PriorArtJudge. Cannot be overwritten once locked."""
        caller = str(gl.message.sender_address).lower()
        if caller != self.owner:
            raise gl.vm.UserError("UNAUTHORIZED_OWNER")
        if self.judge_address:
            raise gl.vm.UserError("JUDGE_ALREADY_LOCKED")
        if not judge_address or not judge_address.startswith("0x") or len(judge_address) != 42:
            raise gl.vm.UserError("INVALID_JUDGE_ADDRESS")
        self.judge_address = judge_address
        return f"JUDGE_LOCKED:{judge_address}"

    @gl.public.write.payable
    def open_challenge(
        self,
        patent_ref: str,
        priority_date_iso: str,
        elements_json: str,
        duration_seconds: int,
        grace_period_seconds: int,
        min_bond_wei: int,
    ) -> str:
        """
        Opens a new crowdfunded prior-art anticipation challenge.
        Payable safety: any validation failure credits msg.value to refundable_balances
        instead of stranding wei on StudioNet.
        """
        sender = str(gl.message.sender_address).lower()
        value = int(gl.message.value)
        self.total_inbound = u256(int(self.total_inbound) + value)

        if not self.judge_address:
            self._credit_refundable(sender, value)
            return f"ERROR:JUDGE_NOT_CONFIGURED:CREDITED_{value}"
        if value < 1:
            return "ERROR:ZERO_BOUNTY_DEPOSIT:CREDITED_0"
        if not patent_ref or len(patent_ref.strip()) < 3 or len(patent_ref.strip()) > 120:
            self._credit_refundable(sender, value)
            return f"ERROR:INVALID_PATENT_REF:CREDITED_{value}"
        if not _is_valid_iso_date(priority_date_iso):
            self._credit_refundable(sender, value)
            return f"ERROR:INVALID_PRIORITY_DATE:CREDITED_{value}"
        if duration_seconds < 60 or duration_seconds > 31536000:
            self._credit_refundable(sender, value)
            return f"ERROR:INVALID_DURATION:CREDITED_{value}"
        if grace_period_seconds < 10 or grace_period_seconds > 604800:
            self._credit_refundable(sender, value)
            return f"ERROR:INVALID_GRACE_PERIOD:CREDITED_{value}"
        if min_bond_wei < 1:
            self._credit_refundable(sender, value)
            return f"ERROR:INVALID_MIN_BOND:CREDITED_{value}"

        try:
            elements = json.loads(elements_json)
        except Exception:
            self._credit_refundable(sender, value)
            return f"ERROR:INVALID_ELEMENTS_JSON:CREDITED_{value}"

        if not isinstance(elements, list) or len(elements) < 2 or len(elements) > 4:
            self._credit_refundable(sender, value)
            return f"ERROR:ELEMENTS_COUNT_MUST_BE_2_TO_4:CREDITED_{value}"

        cleaned_elements = []
        for elem in elements:
            if not isinstance(elem, str) or len(elem.strip()) < 15 or len(elem.strip()) > 320:
                self._credit_refundable(sender, value)
                return f"ERROR:INVALID_ELEMENT_LENGTH:CREDITED_{value}"
            cleaned_elements.append(elem.strip())

        now = self._now()
        cid = int(self.challenge_count) + 1
        self.challenge_count = u256(cid)

        canonical_elements = json.dumps(cleaned_elements, separators=(",", ":"))
        rules_digest = hashlib.sha256(
            f"{patent_ref.strip()}|{priority_date_iso.strip()}|{canonical_elements}".encode("utf-8")
        ).hexdigest()

        challenge = {
            "id": cid,
            "creator": sender,
            "patent_ref": patent_ref.strip(),
            "priority_date_iso": priority_date_iso.strip(),
            "elements": cleaned_elements,
            "rules_digest": rules_digest,
            "status": "PENDING_VETTING",
            "created_at": now,
            "vetting_deadline": now + int(self.vetting_timeout_seconds),
            "duration_seconds": int(duration_seconds),
            "grace_period_seconds": int(grace_period_seconds),
            "opened_at": 0,
            "expires_at": 0,
            "grace_deadline": 0,
            "min_bond_wei": int(min_bond_wei),
            "pool_wei": value,
            "total_contributed_wei": value,
            "forfeited_bonds_wei": 0,
            "contributions": {sender: value},
            "pro_rata_owed": {},
            "pro_rata_claimed": {},
            "vetting_result": {},
            "winner_submission_id": 0,
            "winner": "",
        }
        self.challenges[u256(cid)] = json.dumps(challenge)
        self.challenge_submissions[u256(cid)] = json.dumps([])
        self.total_pool_locked = u256(int(self.total_pool_locked) + value)

        gl.get_contract_at(Address(self.judge_address)).emit(on="finalized").vet_claim_elements(
            cid,
            patent_ref.strip(),
            priority_date_iso.strip(),
            canonical_elements,
            rules_digest,
        )
        return f"CHALLENGE_PENDING_VETTING:{cid}:{rules_digest[:16]}"

    @gl.public.write
    def on_challenge_vetted(self, challenge_id: int, result_json: str) -> str:
        """
        Finality callback strictly restricted to the locked PriorArtJudge contract.
        No owner override is permitted.
        """
        caller = str(gl.message.sender_address).lower()
        if not self.judge_address or caller != self.judge_address.lower():
            raise gl.vm.UserError("UNAUTHORIZED_CALLBACK")
        cid_key = u256(challenge_id)
        if cid_key not in self.challenges:
            raise gl.vm.UserError("CHALLENGE_NOT_FOUND")

        challenge = json.loads(self.challenges[cid_key])
        if challenge["status"] != "PENDING_VETTING":
            return f"IGNORED:STATUS_{challenge['status']}"

        try:
            res = json.loads(result_json)
        except Exception:
            res = {"verdict": "REJECTED_VAGUE", "reason": "MALFORMED_JUDGE_RESULT"}

        verdict = str(res.get("verdict", "REJECTED_VAGUE"))
        challenge["vetting_result"] = res
        now = self._now()

        if verdict == "ACCEPTED":
            challenge["status"] = "OPEN"
            challenge["opened_at"] = now
            challenge["expires_at"] = now + int(challenge["duration_seconds"])
            challenge["grace_deadline"] = challenge["expires_at"] + int(challenge["grace_period_seconds"])
            self.challenges[cid_key] = json.dumps(challenge)
            return f"CHALLENGE_OPENED:{challenge_id}"

        refund_amt = int(challenge["pool_wei"])
        challenge["status"] = "REJECTED_VAGUE"
        challenge["pool_wei"] = 0
        self.challenges[cid_key] = json.dumps(challenge)
        if refund_amt > 0:
            self.total_pool_locked = u256(int(self.total_pool_locked) - refund_amt)
            self._credit_refundable(challenge["creator"], refund_amt)
        return f"CHALLENGE_REJECTED_VAGUE:{challenge_id}:REFUNDED_{refund_amt}"

    @gl.public.write
    def reclaim_stalled_vetting(self, challenge_id: int) -> str:
        """Deterministic fallback if RuleGate vetting never finalizes before vetting_deadline."""
        cid_key = u256(challenge_id)
        if cid_key not in self.challenges:
            raise gl.vm.UserError("CHALLENGE_NOT_FOUND")
        challenge = json.loads(self.challenges[cid_key])
        if challenge["status"] != "PENDING_VETTING":
            raise gl.vm.UserError("NOT_PENDING_VETTING")
        if self._now() < int(challenge["vetting_deadline"]):
            raise gl.vm.UserError("VETTING_DEADLINE_NOT_REACHED")

        refund_amt = int(challenge["pool_wei"])
        challenge["status"] = "VETTING_EXPIRED"
        challenge["pool_wei"] = 0
        self.challenges[cid_key] = json.dumps(challenge)
        if refund_amt > 0:
            self.total_pool_locked = u256(int(self.total_pool_locked) - refund_amt)
            self._credit_refundable(challenge["creator"], refund_amt)
        return f"VETTING_EXPIRED:{challenge_id}:REFUNDED_{refund_amt}"

    @gl.public.write.payable
    def contribute_bounty(self, challenge_id: int) -> str:
        """Allows additional open-source sponsors to crowdfund an OPEN challenge."""
        sender = str(gl.message.sender_address).lower()
        value = int(gl.message.value)
        self.total_inbound = u256(int(self.total_inbound) + value)

        if value < 1:
            return "ERROR:ZERO_CONTRIBUTION:CREDITED_0"
        cid_key = u256(challenge_id)
        if cid_key not in self.challenges:
            self._credit_refundable(sender, value)
            return f"ERROR:CHALLENGE_NOT_FOUND:CREDITED_{value}"

        challenge = json.loads(self.challenges[cid_key])
        if challenge["status"] != "OPEN":
            self._credit_refundable(sender, value)
            return f"ERROR:CHALLENGE_NOT_OPEN:CREDITED_{value}"
        if self._now() >= int(challenge["expires_at"]):
            self._credit_refundable(sender, value)
            return f"ERROR:CHALLENGE_EXPIRED:CREDITED_{value}"

        contribs = challenge["contributions"]
        contribs[sender] = int(contribs.get(sender, 0)) + value
        challenge["pool_wei"] = int(challenge["pool_wei"]) + value
        challenge["total_contributed_wei"] = int(challenge["total_contributed_wei"]) + value
        self.challenges[cid_key] = json.dumps(challenge)
        self.total_pool_locked = u256(int(self.total_pool_locked) + value)
        return f"CONTRIBUTED:{challenge_id}:{value}:POOL_{challenge['pool_wei']}"

    @gl.public.write.payable
    def submit_prior_art(self, challenge_id: int, reference_title: str, reference_url: str) -> str:
        """
        Registers a candidate immutable prior-art publication with an anti-spam researcher bond.
        Multiple researchers may submit competing prior art concurrently.
        """
        sender = str(gl.message.sender_address).lower()
        value = int(gl.message.value)
        self.total_inbound = u256(int(self.total_inbound) + value)

        cid_key = u256(challenge_id)
        if cid_key not in self.challenges:
            self._credit_refundable(sender, value)
            return f"ERROR:CHALLENGE_NOT_FOUND:CREDITED_{value}"

        challenge = json.loads(self.challenges[cid_key])
        if challenge["status"] != "OPEN":
            self._credit_refundable(sender, value)
            return f"ERROR:CHALLENGE_NOT_OPEN:CREDITED_{value}"
        now = self._now()
        if now >= int(challenge["expires_at"]):
            self._credit_refundable(sender, value)
            return f"ERROR:SUBMISSION_WINDOW_CLOSED:CREDITED_{value}"
        if value < int(challenge["min_bond_wei"]):
            self._credit_refundable(sender, value)
            return f"ERROR:INSUFFICIENT_BOND:CREDITED_{value}"
        if not reference_title or len(reference_title.strip()) < 3 or len(reference_title.strip()) > 140:
            self._credit_refundable(sender, value)
            return f"ERROR:INVALID_TITLE:CREDITED_{value}"
        if not _is_valid_immutable_url(reference_url):
            self._credit_refundable(sender, value)
            return f"ERROR:MUTABLE_OR_UNSUPPORTED_URL:CREDITED_{value}"

        norm_url = reference_url.strip()
        dedup_key = f"{challenge_id}:{hashlib.sha256(norm_url.encode('utf-8')).hexdigest()}"
        if dedup_key in self.url_dedup:
            self._credit_refundable(sender, value)
            return f"ERROR:DUPLICATE_REFERENCE_URL:CREDITED_{value}"

        sid = int(self.submission_count) + 1
        self.submission_count = u256(sid)
        self.url_dedup[dedup_key] = u256(sid)

        num_elements = len(challenge["elements"])
        element_records = []
        for idx in range(num_elements):
            element_records.append(
                {
                    "index": idx,
                    "status": "UNMAPPED",
                    "anchor_text": "",
                    "pending_deadline": 0,
                    "verdict": "",
                    "pub_date_iso": "",
                    "source_type": "",
                    "cdx_verified": False,
                    "slice_digest": "",
                    "verbatim_quote": "",
                    "reason": "",
                }
            )

        submission = {
            "id": sid,
            "challenge_id": challenge_id,
            "researcher": sender,
            "reference_title": reference_title.strip(),
            "reference_url": norm_url,
            "submitted_at": now,
            "submitted_date_iso": _utc_date_from_ts(now),
            "bond_wei": value,
            "status": "ACTIVE",
            "disqualified_reason": "",
            "elements": element_records,
        }
        self.submissions[u256(sid)] = json.dumps(submission)

        sub_ids = json.loads(self.challenge_submissions[cid_key])
        sub_ids.append(sid)
        self.challenge_submissions[cid_key] = json.dumps(sub_ids)

        self.total_bonds_held = u256(int(self.total_bonds_held) + value)
        return f"PRIOR_ART_SUBMITTED:{sid}:CHALLENGE_{challenge_id}"

    @gl.public.write
    def map_claim_element(self, submission_id: int, element_index: int, anchor_text: str) -> str:
        """
        Triggers ONE narrow validator judgment mapping ONE claim element against ONE bounded
        slice of the submitted immutable prior-art document via emit(on='finalized').
        Includes per-element pending_deadline retry fallback so stalled consensus never deadlocks.
        """
        caller = str(gl.message.sender_address).lower()
        sid_key = u256(submission_id)
        if sid_key not in self.submissions:
            raise gl.vm.UserError("SUBMISSION_NOT_FOUND")
        sub = json.loads(self.submissions[sid_key])
        if sub["researcher"] != caller:
            raise gl.vm.UserError("UNAUTHORIZED_RESEARCHER")
        if sub["status"] != "ACTIVE":
            raise gl.vm.UserError(f"SUBMISSION_NOT_ACTIVE:{sub['status']}")

        cid_key = u256(int(sub["challenge_id"]))
        challenge = json.loads(self.challenges[cid_key])
        if challenge["status"] != "OPEN":
            raise gl.vm.UserError(f"CHALLENGE_NOT_OPEN:{challenge['status']}")
        now = self._now()
        if now >= int(challenge["grace_deadline"]):
            raise gl.vm.UserError("GRACE_PERIOD_ELAPSED")

        elements = sub["elements"]
        if element_index < 0 or element_index >= len(elements):
            raise gl.vm.UserError("ELEMENT_INDEX_OUT_OF_RANGE")

        rec = elements[element_index]
        can_retry_stalled = rec["status"] == "PENDING" and now >= int(rec.get("pending_deadline", 0))
        if rec["status"] not in ("UNMAPPED", "INSUFFICIENT_EVIDENCE") and not can_retry_stalled:
            raise gl.vm.UserError(f"ELEMENT_ALREADY_{rec['status']}")

        clean_anchor = (anchor_text or "").strip()[:120]
        rec["status"] = "PENDING"
        rec["anchor_text"] = clean_anchor
        rec["pending_deadline"] = now + int(self.element_timeout_seconds)
        self.submissions[sid_key] = json.dumps(sub)

        gl.get_contract_at(Address(self.judge_address)).emit(on="finalized").judge_element_disclosure(
            submission_id,
            int(sub["challenge_id"]),
            element_index,
            challenge["priority_date_iso"],
            sub["submitted_date_iso"],
            challenge["elements"][element_index],
            sub["reference_url"],
            clean_anchor,
        )
        return f"ELEMENT_MAPPING_DISPATCHED:{submission_id}:E{element_index}"

    @gl.public.write
    def on_element_judged(self, submission_id: int, element_index: int, result_json: str) -> str:
        """
        Finality callback strictly restricted to the locked PriorArtJudge contract.
        Enforces the All-Elements Rule (35 U.S.C. § 102) and settles the first complete
        anticipation chart to reach consensus finality.
        """
        caller = str(gl.message.sender_address).lower()
        if not self.judge_address or caller != self.judge_address.lower():
            raise gl.vm.UserError("UNAUTHORIZED_CALLBACK")
        sid_key = u256(submission_id)
        if sid_key not in self.submissions:
            raise gl.vm.UserError("SUBMISSION_NOT_FOUND")

        sub = json.loads(self.submissions[sid_key])
        cid_key = u256(int(sub["challenge_id"]))
        challenge = json.loads(self.challenges[cid_key])

        if element_index < 0 or element_index >= len(sub["elements"]):
            raise gl.vm.UserError("ELEMENT_INDEX_OUT_OF_RANGE")

        try:
            res = json.loads(result_json)
        except Exception:
            res = {"verdict": "INSUFFICIENT_EVIDENCE", "reason": "MALFORMED_RESULT"}

        verdict = str(res.get("verdict", "INSUFFICIENT_EVIDENCE"))
        rec = sub["elements"][element_index]
        rec["verdict"] = verdict
        rec["pub_date_iso"] = str(res.get("pub_date_iso", ""))
        rec["source_type"] = str(res.get("source_type", ""))
        rec["cdx_verified"] = bool(res.get("cdx_verified", False))
        rec["slice_digest"] = str(res.get("slice_digest", ""))
        rec["verbatim_quote"] = str(res.get("verbatim_quote", ""))
        rec["reason"] = str(res.get("reason", ""))[:240]

        # If another researcher won or challenge expired while tx was in flight, release honest bond
        if challenge["status"] != "OPEN":
            rec["status"] = verdict
            if sub["status"] == "ACTIVE":
                sub["status"] = "SUPERSEDED"
                bond = int(sub["bond_wei"])
                if bond > 0:
                    sub["bond_wei"] = 0
                    self.total_bonds_held = u256(int(self.total_bonds_held) - bond)
                    self._credit_refundable(sub["researcher"], bond)
            self.submissions[sid_key] = json.dumps(sub)
            return f"SUPERSEDED_BY_CHALLENGE_{challenge['status']}:{submission_id}"

        if sub["status"] != "ACTIVE":
            self.submissions[sid_key] = json.dumps(sub)
            return f"IGNORED_INACTIVE_SUBMISSION:{submission_id}"

        if verdict == "DISCLOSED":
            rec["status"] = "DISCLOSED"
            all_disclosed = all(e["status"] == "DISCLOSED" for e in sub["elements"])
            if all_disclosed:
                pool_amt = int(challenge["pool_wei"])
                bond_amt = int(sub["bond_wei"])
                total_payout = pool_amt + bond_amt

                challenge["status"] = "ANTICIPATED"
                challenge["pool_wei"] = 0
                challenge["winner_submission_id"] = submission_id
                challenge["winner"] = sub["researcher"]

                sub["status"] = "WON"
                sub["bond_wei"] = 0

                self.total_pool_locked = u256(int(self.total_pool_locked) - pool_amt)
                self.total_bonds_held = u256(int(self.total_bonds_held) - bond_amt)
                self._credit_claimable(sub["researcher"], total_payout)

                self.challenges[cid_key] = json.dumps(challenge)
                self.submissions[sid_key] = json.dumps(sub)
                return f"ANTICIPATED_WINNER:{challenge['id']}:SUB_{submission_id}:PAYOUT_{total_payout}"

            self.submissions[sid_key] = json.dumps(sub)
            disclosed_count = sum(1 for e in sub["elements"] if e["status"] == "DISCLOSED")
            return f"ELEMENT_DISCLOSED:{submission_id}:E{element_index}:{disclosed_count}_OF_{len(sub['elements'])}"

        if verdict in ("NOT_DISCLOSED", "POST_DATED", "INVALID_EVIDENCE"):
            rec["status"] = verdict
            sub["status"] = f"DISQUALIFIED_{verdict}"
            sub["disqualified_reason"] = rec["reason"]
            bond_amt = int(sub["bond_wei"])
            sub["bond_wei"] = 0

            if bond_amt > 0:
                self.total_bonds_held = u256(int(self.total_bonds_held) - bond_amt)
                challenge["pool_wei"] = int(challenge["pool_wei"]) + bond_amt
                challenge["forfeited_bonds_wei"] = int(challenge["forfeited_bonds_wei"]) + bond_amt
                self.total_pool_locked = u256(int(self.total_pool_locked) + bond_amt)

            self.challenges[cid_key] = json.dumps(challenge)
            self.submissions[sid_key] = json.dumps(sub)
            return f"SUBMISSION_DISQUALIFIED:{submission_id}:{verdict}:BOND_FORFEITED_{bond_amt}"

        rec["status"] = "INSUFFICIENT_EVIDENCE"
        self.submissions[sid_key] = json.dumps(sub)
        return f"ELEMENT_INSUFFICIENT_EVIDENCE:{submission_id}:E{element_index}"

    @gl.public.write
    def reclaim_superseded_bond(self, submission_id: int) -> str:
        """
        Allows an honest competing researcher whose submission was neither won nor disqualified
        to reclaim their held bond once the challenge settles (ANTICIPATED or EXPIRED).
        """
        sid_key = u256(submission_id)
        if sid_key not in self.submissions:
            raise gl.vm.UserError("SUBMISSION_NOT_FOUND")
        sub = json.loads(self.submissions[sid_key])
        cid_key = u256(int(sub["challenge_id"]))
        challenge = json.loads(self.challenges[cid_key])

        if challenge["status"] not in ("ANTICIPATED", "EXPIRED"):
            raise gl.vm.UserError("CHALLENGE_STILL_ACTIVE")
        bond_amt = int(sub["bond_wei"])
        if bond_amt <= 0 or sub["status"] not in ("ACTIVE", "SUPERSEDED"):
            raise gl.vm.UserError("NO_RECLAIMABLE_BOND")

        sub["status"] = "SUPERSEDED_REFUNDED"
        sub["bond_wei"] = 0
        self.submissions[sid_key] = json.dumps(sub)
        self.total_bonds_held = u256(int(self.total_bonds_held) - bond_amt)
        self._credit_refundable(sub["researcher"], bond_amt)
        return f"BOND_RECLAIMED:{submission_id}:{bond_amt}"

    @gl.public.write
    def expire_challenge(self, challenge_id: int) -> str:
        """
        Deterministic fallback after expires_at + grace_period_seconds.
        Marks unjudged PENDING elements as INSUFFICIENT_EVIDENCE and computes zero-dust
        pro-rata entitlements for all crowdfunders.
        """
        cid_key = u256(challenge_id)
        if cid_key not in self.challenges:
            raise gl.vm.UserError("CHALLENGE_NOT_FOUND")
        challenge = json.loads(self.challenges[cid_key])
        if challenge["status"] != "OPEN":
            raise gl.vm.UserError(f"CHALLENGE_NOT_OPEN:{challenge['status']}")
        if self._now() < int(challenge["grace_deadline"]):
            raise gl.vm.UserError("GRACE_DEADLINE_NOT_REACHED")

        sub_ids = json.loads(self.challenge_submissions[cid_key])
        for sid in sub_ids:
            s_key = u256(int(sid))
            sub = json.loads(self.submissions[s_key])
            changed = False
            for rec in sub["elements"]:
                if rec["status"] == "PENDING":
                    rec["status"] = "INSUFFICIENT_EVIDENCE"
                    rec["reason"] = "EXPIRED_BEFORE_FINALITY"
                    changed = True
            if changed:
                self.submissions[s_key] = json.dumps(sub)

        distributable = int(challenge["pool_wei"])
        total_contrib = int(challenge["total_contributed_wei"])
        contribs = challenge["contributions"]

        pro_rata_owed = {}
        allocated = 0
        for sp in sorted(contribs.keys()):
            c_amt = int(contribs[sp])
            share = (distributable * c_amt) // total_contrib if total_contrib > 0 else 0
            pro_rata_owed[sp] = share
            allocated += share

        remainder = distributable - allocated
        if remainder > 0:
            creator = challenge["creator"]
            pro_rata_owed[creator] = int(pro_rata_owed.get(creator, 0)) + remainder

        challenge["status"] = "EXPIRED"
        challenge["pro_rata_owed"] = pro_rata_owed
        challenge["pro_rata_claimed"] = {}
        self.challenges[cid_key] = json.dumps(challenge)
        return f"CHALLENGE_EXPIRED:{challenge_id}:DISTRIBUTABLE_{distributable}"

    @gl.public.write
    def claim_pro_rata_refund(self, challenge_id: int) -> str:
        """Pull-payment pro-rata refund delivering native wei directly to EOA via EthSend."""
        sender = str(gl.message.sender_address).lower()
        cid_key = u256(challenge_id)
        if cid_key not in self.challenges:
            raise gl.vm.UserError("CHALLENGE_NOT_FOUND")
        challenge = json.loads(self.challenges[cid_key])
        if challenge["status"] != "EXPIRED":
            raise gl.vm.UserError("CHALLENGE_NOT_EXPIRED")

        owed = int(challenge["pro_rata_owed"].get(sender, 0))
        if owed <= 0 or challenge["pro_rata_claimed"].get(sender, False):
            raise gl.vm.UserError("NO_PRO_RATA_REFUND_DUE")

        challenge["pro_rata_claimed"][sender] = True
        challenge["pool_wei"] = int(challenge["pool_wei"]) - owed
        self.challenges[cid_key] = json.dumps(challenge)

        self.total_pool_locked = u256(int(self.total_pool_locked) - owed)
        self.total_outbound = u256(int(self.total_outbound) + owed)

        self._send_native_eoa(sender, owed)
        return f"PRO_RATA_REFUNDED:{challenge_id}:{sender}:{owed}"

    @gl.public.write
    def claim_payout(self) -> str:
        """Pull-payment withdrawal delivering winning bounty + bond wei directly to EOA via EthSend."""
        sender = str(gl.message.sender_address).lower()
        amount = int(self.claimable_balances[sender]) if sender in self.claimable_balances else 0
        if amount <= 0:
            raise gl.vm.UserError("NO_CLAIMABLE_PAYOUT")

        self.claimable_balances[sender] = u256(0)
        self.total_claimable = u256(int(self.total_claimable) - amount)
        self.total_outbound = u256(int(self.total_outbound) + amount)

        self._send_native_eoa(sender, amount)
        return f"PAYOUT_CLAIMED:{sender}:{amount}"

    @gl.public.write
    def withdraw_refund(self) -> str:
        """Pull-payment withdrawal delivering refundable deposit wei directly to EOA via EthSend."""
        sender = str(gl.message.sender_address).lower()
        amount = int(self.refundable_balances[sender]) if sender in self.refundable_balances else 0
        if amount <= 0:
            raise gl.vm.UserError("NO_REFUNDABLE_BALANCE")

        self.refundable_balances[sender] = u256(0)
        self.total_refundable = u256(int(self.total_refundable) - amount)
        self.total_outbound = u256(int(self.total_outbound) + amount)

        self._send_native_eoa(sender, amount)
        return f"REFUND_WITHDRAWN:{sender}:{amount}"

    # -------------------------------------------------------------------------
    # Read-Only View Methods
    # -------------------------------------------------------------------------

    @gl.public.view
    def get_protocol_config(self) -> str:
        return json.dumps(
            {
                "owner": self.owner,
                "judge_address": self.judge_address,
                "vetting_timeout_seconds": int(self.vetting_timeout_seconds),
                "element_timeout_seconds": int(self.element_timeout_seconds),
                "challenge_count": int(self.challenge_count),
                "submission_count": int(self.submission_count),
            }
        )

    @gl.public.view
    def get_challenge(self, challenge_id: int) -> str:
        cid_key = u256(challenge_id)
        if cid_key not in self.challenges:
            return "{}"
        return self.challenges[cid_key]

    @gl.public.view
    def get_submission(self, submission_id: int) -> str:
        sid_key = u256(submission_id)
        if sid_key not in self.submissions:
            return "{}"
        return self.submissions[sid_key]

    @gl.public.view
    def get_challenge_submissions(self, challenge_id: int) -> str:
        cid_key = u256(challenge_id)
        if cid_key not in self.challenge_submissions:
            return "[]"
        sub_ids = json.loads(self.challenge_submissions[cid_key])
        out = []
        for sid in sub_ids:
            s_key = u256(int(sid))
            if s_key in self.submissions:
                out.append(json.loads(self.submissions[s_key]))
        return json.dumps(out)

    @gl.public.view
    def get_account_balances(self, account: str) -> str:
        key = account.strip().lower()
        claimable = int(self.claimable_balances[key]) if key in self.claimable_balances else 0
        refundable = int(self.refundable_balances[key]) if key in self.refundable_balances else 0
        return json.dumps({"account": key, "claimable_wei": claimable, "refundable_wei": refundable})

    @gl.public.view
    def get_accounting_summary(self) -> str:
        pool_locked = int(self.total_pool_locked)
        bonds_held = int(self.total_bonds_held)
        claimable = int(self.total_claimable)
        refundable = int(self.total_refundable)
        inbound = int(self.total_inbound)
        outbound = int(self.total_outbound)
        lhs = pool_locked + bonds_held + claimable + refundable
        rhs = inbound - outbound
        return json.dumps(
            {
                "total_pool_locked": pool_locked,
                "total_bonds_held": bonds_held,
                "total_claimable": claimable,
                "total_refundable": refundable,
                "total_inbound": inbound,
                "total_outbound": outbound,
                "net_liabilities": lhs,
                "net_flow": rhs,
                "invariant_holds": lhs == rhs,
            }
        )

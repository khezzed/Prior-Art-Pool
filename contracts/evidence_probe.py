# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import hashlib
import json


class EvidenceProbe(gl.Contract):
    """
    Pre-flight network probe deployed on StudioNet before main contracts.
    Verifies that decentralized GenLayer validators can fetch each candidate
    immutable evidence source and achieve strict byte-level consensus.
    """

    results: TreeMap[str, str]
    probe_count: u256

    def __init__(self):
        self.probe_count = u256(0)

    @gl.public.write
    def probe_get(self, label: str, target_url: str) -> str:
        def fetch_and_digest() -> str:
            resp = gl.nondet.web.get(target_url)
            status = int(getattr(resp, "status", 0))
            body = getattr(resp, "body", b"")
            if isinstance(body, bytes):
                text = body.decode("utf-8", errors="replace")
            else:
                text = str(body)
            normalized = text.replace("\r\n", "\n")
            sample = normalized[:2000]
            digest = hashlib.sha256(sample.encode("utf-8")).hexdigest()
            payload = {
                "label": label,
                "status": status,
                "length": len(normalized),
                "sample_digest": digest,
                "preview": sample[:120].replace("\n", " "),
            }
            return json.dumps(payload, sort_keys=True)

        res = gl.eq_principle.strict_eq(fetch_and_digest)
        self.results[label] = res
        self.probe_count = u256(int(self.probe_count) + 1)
        return res

    @gl.public.view
    def get_result(self, label: str) -> str:
        if label in self.results:
            return self.results[label]
        return ""

    @gl.public.view
    def get_probe_count(self) -> int:
        return int(self.probe_count)

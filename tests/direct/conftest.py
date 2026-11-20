import sys
import types
from dataclasses import dataclass
from typing import Any, Callable, Generic, TypeVar
import pytest

K = TypeVar("K")
V = TypeVar("V")


class u256(int):
    def __new__(cls, val: int = 0):
        v = int(val)
        if v < 0 or v >= (1 << 256):
            raise OverflowError("u256 out of range")
        return super().__new__(cls, v)


class Address(str):
    def __new__(cls, val: str = "0x0000000000000000000000000000000000000000"):
        v = str(val)
        if not v.startswith("0x") or len(v) != 42:
            raise ValueError(f"Invalid Address: {val}")
        return super().__new__(cls, v)


class TreeMap(Generic[K, V], dict):
    pass


class UserError(Exception):
    pass


@dataclass
class Return:
    calldata: Any


@dataclass
class WebResponse:
    status: int
    body: bytes


class MockGenVM:
    def __init__(self):
        self.sender = Address("0x1111111111111111111111111111111111111111")
        self.value = 0
        self.timestamp = 1795000000  # 2026-11-18T11:06:40Z
        self.emitted_calls: list[dict] = []
        self.emitted_transfers: list[dict] = []
        self.web_responses: dict[str, WebResponse] = {}
        self.llm_handler: Callable[[str], str] = lambda prompt: '{"verdict": "INSUFFICIENT_EVIDENCE"}'
        self.last_leader_fn = None
        self.last_validator_fn = None
        self.leader_override: Callable[[Any], Any] | None = None

    def set_context(self, sender: str, value: int = 0, timestamp: int | None = None):
        self.sender = Address(sender)
        self.value = int(value)
        if timestamp is not None:
            self.timestamp = int(timestamp)

    def advance_time(self, seconds: int):
        self.timestamp += int(seconds)

    def reset_events(self):
        self.emitted_calls.clear()
        self.emitted_transfers.clear()


class _ContractProxy:
    def __init__(self, vm: MockGenVM, target: Address):
        self._vm = vm
        self._target = target

    def emit(self, on: str = "finalized"):
        vm = self._vm
        target = self._target

        class _Emitter:
            def __getattr__(self, method_name: str):
                def _record(*args, **kwargs):
                    vm.emitted_calls.append(
                        {
                            "target": str(target).lower(),
                            "on": on,
                            "method": method_name,
                            "args": args,
                            "kwargs": kwargs,
                        }
                    )

                return _record

        return _Emitter()

    def emit_transfer(self, value: u256, on: str = "finalized"):
        self._vm.emitted_transfers.append(
            {"recipient": str(self._target).lower(), "value": int(value), "on": on}
        )


def _install_mock_genlayer(vm: MockGenVM):
    mod = types.ModuleType("genlayer")

    class _Message:
        @property
        def sender_address(self):
            return vm.sender

        @property
        def value(self):
            return u256(vm.value)

        @property
        def timestamp(self):
            return vm.timestamp

    class _WriteDecorator:
        def __call__(self, fn):
            return fn

        @property
        def payable(self):
            return lambda fn: fn

    class _Public:
        write = _WriteDecorator()

        @staticmethod
        def view(fn):
            return fn

    class _Web:
        @staticmethod
        def get(url: str):
            if url in vm.web_responses:
                return vm.web_responses[url]
            return WebResponse(status=404, body=b"Not Found")

    class _NonDet:
        web = _Web()

        @staticmethod
        def exec_prompt(prompt: str, response_format: str = "text"):
            return vm.llm_handler(prompt)

    class _VM:
        UserError = UserError
        Return = Return

        @staticmethod
        def run_nondet_unsafe(leader_fn, validator_fn):
            vm.last_leader_fn = leader_fn
            vm.last_validator_fn = validator_fn
            leader_out = leader_fn()
            if vm.leader_override is not None:
                leader_out = vm.leader_override(leader_out)
            agreed = validator_fn(Return(calldata=leader_out))
            if not agreed:
                raise UserError("CONSENSUS_VALIDATOR_DISAGREE")
            return leader_out

    class _Contract:
        def __init__(self):
            # Initialize TreeMap annotations automatically
            annotations = getattr(self.__class__, "__annotations__", {})
            for name, typ in annotations.items():
                if not hasattr(self, name):
                    origin = getattr(typ, "__origin__", None)
                    if origin is TreeMap or typ is TreeMap:
                        setattr(self, name, TreeMap())

    class _EVM:
        @staticmethod
        def contract_interface(cls):
            def _factory(addr: Address):
                class _EvmProxy:
                    def emit_transfer(self, *, value: u256):
                        vm.emitted_transfers.append(
                            {"recipient": str(addr).lower(), "value": int(value), "on": "finalized", "kind": "EthSend"}
                        )

                return _EvmProxy()

            return _factory

    class _GL:
        Contract = _Contract
        public = _Public()
        nondet = _NonDet()
        vm = _VM()
        evm = _EVM()
        message = _Message()

        @property
        def message_raw(self):
            return {"datetime": vm.timestamp}

        @staticmethod
        def get_contract_at(addr: Address):
            return _ContractProxy(vm, addr)

    gl_obj = _GL()
    mod.gl = gl_obj
    mod.u256 = u256
    mod.Address = Address
    mod.TreeMap = TreeMap
    sys.modules["genlayer"] = mod
    return vm


@pytest.fixture
def genvm():
    vm = MockGenVM()
    _install_mock_genlayer(vm)
    # Reload contract modules cleanly against fresh mock genlayer
    for mod_name in ["contracts.prior_art_pool", "contracts.prior_art_judge"]:
        if mod_name in sys.modules:
            del sys.modules[mod_name]
    return vm

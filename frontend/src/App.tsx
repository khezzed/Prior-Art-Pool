import React, { useCallback, useEffect, useState } from 'react';
import {
  Scale,
  ExternalLink,
  RefreshCw,
  Database,
  Radio,
  ShieldCheck,
  Wallet,
  BookOpen,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import proofData from './data/proof.json';
import type { AccountingSummary, ChallengeRecord, ProofManifest, SubmissionRecord, TrackedTx } from './types';
import {
  fetchLiveProtocolSnapshot,
  inspectTxState,
  shortHash,
  STUDIONET_EXPLORER,
} from './lib/studionet';
import { CaseExplorer } from './components/CaseExplorer';
import { WalletWorkbench } from './components/WalletWorkbench';
import { TxTracker } from './components/TxTracker';

const PROOF = proofData as unknown as ProofManifest;
const STORAGE_KEY = 'prior_art_pool_tracked_txs_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<'explorer' | 'wallet'>('explorer');
  const [dataMode, setDataMode] = useState<'proof' | 'live'>('proof');

  // Live StudioNet RPC read state (completely separate from static recorded proof.json!)
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string>('');
  const [liveFetchedAt, setLiveFetchedAt] = useState<string>('');
  const [liveChallenges, setLiveChallenges] = useState<ChallengeRecord[] | null>(null);
  const [liveSubmissions, setLiveSubmissions] = useState<SubmissionRecord[] | null>(null);
  const [liveAccounting, setLiveAccounting] = useState<AccountingSummary | null>(null);
  const [liveContractBal, setLiveContractBal] = useState<string>('');

  // Resumable localStorage tx tracker
  const [trackedTxs, setTrackedTxs] = useState<TrackedTx[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trackedTxs));
    } catch {
      // Ignore storage quota errors
    }
  }, [trackedTxs]);

  const refreshLive = useCallback(async () => {
    if (!PROOF.contracts?.priorArtPool?.address) return;
    setLiveLoading(true);
    setLiveError('');
    try {
      const snap = await fetchLiveProtocolSnapshot(PROOF.contracts.priorArtPool.address);
      setLiveChallenges(snap.challenges);
      setLiveSubmissions(snap.submissions);
      setLiveAccounting(snap.accounting);
      setLiveContractBal(snap.nativeBalanceWei);
      setLiveFetchedAt(snap.fetchedAt);
    } catch (err: any) {
      setLiveError(err?.message || 'Unable to fetch live StudioNet state');
    } finally {
      setLiveLoading(false);
    }
  }, []);

  // Automatically do one live read-only check on mount (wallet-free!) while keeping Recorded Proof distinct
  useEffect(() => {
    refreshLive();
  }, [refreshLive]);

  // Resumable 8-second polling loop for any non-finalized user wallet transactions
  useEffect(() => {
    const hasInFlight = trackedTxs.some(
      (tx) =>
        tx.state !== 'finalized-success' &&
        tx.state !== 'finalized-error' ||
        tx.childTxHashes.some(
          (ch) => tx.childStates[ch] !== 'finalized-success' && tx.childStates[ch] !== 'finalized-error'
        )
    );
    if (!hasInFlight) return;

    const timer = setInterval(async () => {
      const next = await Promise.all(
        trackedTxs.map(async (tx) => {
          let updated = { ...tx, childStates: { ...tx.childStates } };
          if (tx.state !== 'finalized-success' && tx.state !== 'finalized-error') {
            try {
              const res = await inspectTxState(tx.hash);
              updated = {
                ...updated,
                state: res.state,
                consensusResult: res.consensusResult,
                returnReadable: res.returnReadable,
                errorDetail: res.errorDetail,
                childTxHashes: Array.from(new Set([...tx.childTxHashes, ...res.childTxHashes])),
              };
            } catch {
              // Keep polling
            }
          }
          for (const ch of updated.childTxHashes) {
            const st = updated.childStates[ch];
            if (st !== 'finalized-success' && st !== 'finalized-error') {
              try {
                const cres = await inspectTxState(ch);
                updated.childStates[ch] = cres.state;
                for (const grand of cres.childTxHashes) {
                  if (!updated.childTxHashes.includes(grand)) {
                    updated.childTxHashes = [...updated.childTxHashes, grand];
                  }
                }
              } catch {
                // Keep polling
              }
            }
          }
          return updated;
        })
      );
      setTrackedTxs(next);
    }, 8000);

    return () => clearInterval(timer);
  }, [trackedTxs]);

  const handleTxSubmitted = (hash: string, label: string, method: string) => {
    setTrackedTxs((prev) => [
      {
        hash,
        label,
        method,
        createdAt: Date.now(),
        state: 'submitted',
        childTxHashes: [],
        childStates: {},
      },
      ...prev,
    ]);
  };

  const displayChallenges =
    dataMode === 'live' && liveChallenges ? liveChallenges : PROOF.challenges;
  const displaySubmissions =
    dataMode === 'live' && liveSubmissions ? liveSubmissions : PROOF.submissions;
  const displayAccounting =
    dataMode === 'live' && liveAccounting ? liveAccounting : PROOF.accountingSummary;
  const displayContractBal =
    dataMode === 'live' && liveContractBal ? liveContractBal : PROOF.poolContractBalanceWei;

  const liveMatchesProof =
    liveAccounting !== null &&
    liveAccounting.invariant_holds &&
    liveChallenges !== null &&
    PROOF.challenges.every((pc) => {
      const lc = liveChallenges.find((x) => x.id === pc.id);
      return lc && lc.status === pc.status && lc.rules_digest === pc.rules_digest;
    });

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100">
      {/* Top Header */}
      <header className="border-b border-slate-800/90 bg-slate-950/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-sky-500 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-950/60">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">PriorArtPool</h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/35">
                  GenLayer StudioNet · 61999
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Crowdfunded Defensive Patent Prior-Art Anticipation &amp; All-Elements Claim-Chart Protocol
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Explicit separation toggle: Recorded Proof vs Live RPC */}
            <div className="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-800 text-xs font-mono">
              <button
                onClick={() => setDataMode('proof')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                  dataMode === 'proof'
                    ? 'bg-slate-800 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Database className="w-3.5 h-3.5" /> Recorded Proof
              </button>
              <button
                onClick={() => {
                  setDataMode('live');
                  refreshLive();
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                  dataMode === 'live'
                    ? 'bg-slate-800 text-sky-300 border border-sky-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Radio className={`w-3.5 h-3.5 ${liveLoading ? 'animate-pulse' : ''}`} /> Live RPC Read
              </button>
            </div>

            <div className="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-800 text-xs font-semibold">
              <button
                onClick={() => setActiveTab('explorer')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                  activeTab === 'explorer' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" /> Proof Explorer (No Wallet)
              </button>
              <button
                onClick={() => setActiveTab('wallet')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                  activeTab === 'wallet' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Wallet className="w-3.5 h-3.5" /> Wallet Flows
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Explicit Recorded Proof vs Live RPC Verification Banner */}
        <section className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono border ${
                dataMode === 'live'
                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/35'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
              }`}
            >
              {dataMode === 'live' ? <Radio className="w-3.5 h-3.5" /> : <Database className="w-3.5 h-3.5" />}
              VIEWING: {dataMode === 'live' ? 'LIVE STUDIONET RPC STATE' : 'RECORDED PROOF MANIFEST (deploy/proof.json)'}
            </span>
            {liveLoading ? (
              <span className="text-slate-400 font-mono">Querying https://studio.genlayer.com/api ...</span>
            ) : liveError ? (
              <span className="inline-flex items-center gap-1 text-amber-300 font-mono">
                <AlertCircle className="w-3.5 h-3.5" /> Live RPC check warning: {liveError}
              </span>
            ) : liveAccounting ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-300 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Live RPC Cross-Check: {liveMatchesProof ? '100% Matches Recorded Proof' : 'Updated On-Chain State Detected'}{' '}
                ({new Date(liveFetchedAt).toLocaleTimeString()})
              </span>
            ) : null}
          </div>

          <button
            onClick={refreshLive}
            disabled={liveLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${liveLoading ? 'animate-spin' : ''}`} /> Refresh Live RPC
          </button>
        </section>

        {/* Deployed Contracts + Conservation Invariant Strip */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="glass-panel rounded-2xl p-4 space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Deployed StudioNet Contracts (Pinned GenVM)
            </p>
            {[
              { label: 'PriorArtPool (Vault)', meta: PROOF.contracts.priorArtPool },
              { label: 'PriorArtJudge (Oracle)', meta: PROOF.contracts.priorArtJudge },
              { label: 'EvidenceProbe (Step 2)', meta: PROOF.contracts.evidenceProbe },
            ].map((c) => (
              <div key={c.label} className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300">{c.label}</span>
                <a
                  href={`${STUDIONET_EXPLORER}/address/${c.meta.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                >
                  {shortHash(c.meta.address, 8, 6)} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>

          <div className="glass-panel rounded-2xl p-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Deterministic Financial Conservation Invariant
              </p>
              <span
                className={`text-xs font-mono px-2.5 py-0.5 rounded-full border ${
                  displayAccounting.invariant_holds
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                    : 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                }`}
              >
                {displayAccounting.invariant_holds ? 'INVARIANT HOLDS ✓' : 'INVARIANT MISMATCH'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 font-mono text-xs">
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-2.5">
                <p className="text-[10px] text-slate-400">Inbound</p>
                <p className="text-sm font-bold text-white">{displayAccounting.total_inbound}</p>
              </div>
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-2.5">
                <p className="text-[10px] text-slate-400">Outbound</p>
                <p className="text-sm font-bold text-emerald-300">{displayAccounting.total_outbound}</p>
              </div>
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-2.5">
                <p className="text-[10px] text-slate-400">Pool Locked</p>
                <p className="text-sm font-bold text-sky-300">{displayAccounting.total_pool_locked}</p>
              </div>
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-2.5">
                <p className="text-[10px] text-slate-400">Bonds Held</p>
                <p className="text-sm font-bold text-amber-300">{displayAccounting.total_bonds_held}</p>
              </div>
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-2.5">
                <p className="text-[10px] text-slate-400">Claim / Ref</p>
                <p className="text-sm font-bold text-indigo-300">
                  {displayAccounting.total_claimable}/{displayAccounting.total_refundable}
                </p>
              </div>
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-2.5">
                <p className="text-[10px] text-slate-400">On-Chain Wei</p>
                <p className="text-sm font-bold text-emerald-400">{displayContractBal}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Resumable Tx & Native Appeal Window Tracker */}
        <TxTracker txs={trackedTxs} onClear={() => setTrackedTxs([])} />

        {/* Main Content Switch */}
        {activeTab === 'explorer' ? (
          <CaseExplorer
            challenges={displayChallenges}
            submissions={displaySubmissions}
            steps={PROOF.steps}
            dataMode={dataMode}
          />
        ) : (
          <WalletWorkbench
            poolAddress={PROOF.contracts.priorArtPool.address}
            challenges={displayChallenges}
            submissions={displaySubmissions}
            onTxSubmitted={handleTxSubmitted}
            onRefreshLive={refreshLive}
          />
        )}

        <footer className="border-t border-slate-800/80 pt-5 pb-10 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 font-mono">
          <span>
            PriorArtPool · Runner: {PROOF.network.runner} · All settlement gated by emit(on="finalized")
          </span>
          <a
            href="https://github.com/khezzed/Prior-Art-Pool"
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 hover:text-emerald-300 inline-flex items-center gap-1"
          >
            github.com/khezzed/Prior-Art-Pool <ExternalLink className="w-3 h-3" />
          </a>
        </footer>
      </main>
    </div>
  );
}

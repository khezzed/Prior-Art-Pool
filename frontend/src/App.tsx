import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';
import proofData from './data/proof.json';
import type { AccountingSummary, ChallengeRecord, ProofManifest, SubmissionRecord, TrackedTx } from './types';
import { fetchLiveProtocolSnapshot, inspectTxState } from './lib/studionet';
import { cn } from './lib/utils';
import { DocketRail } from './components/DocketRail';
import { ClaimChartDossier } from './components/ClaimChartDossier';
import { AuditLedger } from './components/AuditLedger';
import { WalletWorkbench } from './components/WalletWorkbench';
import { TxMonitor } from './components/TxMonitor';

const PROOF = proofData as unknown as ProofManifest;
const STORAGE_KEY = 'prior_art_pool_tracked_txs_v1';

type ViewTab = 'dossiers' | 'ledger' | 'wallet';

export default function App() {
  const [activeTab, setActiveTab] = useState<ViewTab>('dossiers');
  const [dataMode, setDataMode] = useState<'proof' | 'live'>('proof');
  const [selectedChallengeId, setSelectedChallengeId] = useState<number>(2);

  // Live StudioNet RPC read state (explicitly separated from static recorded proof.json)
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
      setLiveError(err?.message || 'Unable to query StudioNet RPC');
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshLive();
  }, [refreshLive]);

  // Resumable 8-second polling loop for user-submitted wallet transactions
  useEffect(() => {
    const hasInFlight = trackedTxs.some(
      (tx) =>
        (tx.state !== 'finalized-success' && tx.state !== 'finalized-error') ||
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
              // Retry next cycle
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
                // Retry next cycle
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

  const displayChallenges = dataMode === 'live' && liveChallenges ? liveChallenges : PROOF.challenges;
  const displaySubmissions = dataMode === 'live' && liveSubmissions ? liveSubmissions : PROOF.submissions;
  const displayAccounting = dataMode === 'live' && liveAccounting ? liveAccounting : PROOF.accountingSummary;
  const displayContractBal =
    dataMode === 'live' && liveContractBal ? liveContractBal : PROOF.poolContractBalanceWei;

  const selectedChallenge =
    displayChallenges.find((c) => c.id === selectedChallengeId) || displayChallenges[0] || null;
  const selectedSubs = selectedChallenge
    ? displaySubmissions.filter((s) => s.challenge_id === selectedChallenge.id)
    : [];

  const liveMatchesProof =
    liveAccounting !== null &&
    liveAccounting.invariant_holds &&
    liveChallenges !== null &&
    PROOF.challenges.every((pc) => {
      const lc = liveChallenges.find((x) => x.id === pc.id);
      return lc && lc.status === pc.status && lc.rules_digest === pc.rules_digest;
    });

  const liveVerifiedText = liveLoading
    ? 'Querying live StudioNet RPC...'
    : liveAccounting
      ? liveMatchesProof
        ? `Live StudioNet RPC matches recorded proof (${new Date(liveFetchedAt).toLocaleTimeString()}).`
        : `Live StudioNet RPC updated (${new Date(liveFetchedAt).toLocaleTimeString()}).`
      : 'Viewing static recorded proof manifest.';

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink-primary">
      {/* Single-line Compact Sticky Navigation Header */}
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-xl border-b border-line-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Brand Wordmark (stronger presence than nav links) */}
          <div className="flex items-baseline gap-3 min-w-0">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('dossiers');
              }}
              className="font-serif text-lg sm:text-xl font-semibold tracking-tight text-ink-primary shrink-0 focus-visible:rounded-sm"
            >
              PriorArtPool
            </a>
            <span className="hidden md:inline text-compact text-ink-muted truncate">
              GenLayer StudioNet · Chain 61999
            </span>
          </div>

          {/* Primary Workspace Tabs (standard underline affordance) */}
          <nav aria-label="Workspace views" className="hidden sm:flex items-center gap-6 h-full">
            {(
              [
                ['dossiers', 'Case dossiers'],
                ['ledger', 'Audit ledger'],
                ['wallet', 'Wallet workbench'],
              ] as Array<[ViewTab, string]>
            ).map(([id, label]) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'h-full inline-flex items-center text-compact font-medium border-b-2 btn-transition focus-visible:outline-none focus-visible:text-brand',
                    active
                      ? 'border-brand text-ink-primary'
                      : 'border-transparent text-ink-secondary hover:text-ink-primary hover:border-line-strong'
                  )}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Data Mode Segmented Toggle (Recorded Proof vs Live RPC) */}
          <div className="flex items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label="Data source mode"
              className="inline-flex rounded-md bg-subtle p-0.5 border border-line-subtle text-compact"
            >
              <button
                type="button"
                aria-pressed={dataMode === 'proof'}
                onClick={() => setDataMode('proof')}
                className={cn(
                  'px-2 sm:px-2.5 py-1 rounded-sm font-medium whitespace-nowrap btn-transition focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98]',
                  dataMode === 'proof'
                    ? 'bg-surface text-ink-primary shadow-control'
                    : 'text-ink-secondary hover:text-ink-primary'
                )}
              >
                Recorded proof
              </button>
              <button
                type="button"
                aria-pressed={dataMode === 'live'}
                onClick={() => {
                  setDataMode('live');
                  refreshLive();
                }}
                className={cn(
                  'px-2 sm:px-2.5 py-1 rounded-sm font-medium whitespace-nowrap btn-transition focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98]',
                  dataMode === 'live'
                    ? 'bg-surface text-brand shadow-control'
                    : 'text-ink-secondary hover:text-ink-primary'
                )}
              >
                Live RPC
              </button>
            </div>

            <button
              type="button"
              onClick={refreshLive}
              disabled={liveLoading}
              aria-label="Refresh live StudioNet RPC state"
              className="p-1.5 rounded-md bg-surface border border-line-strong text-ink-secondary hover:bg-subtle hover:text-ink-primary active:scale-95 disabled:opacity-50 btn-transition focus-visible:ring-2 focus-visible:ring-brand"
            >
              <RefreshCw className={cn('w-4 h-4', liveLoading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Mobile Tab Bar (< sm) */}
        <nav
          aria-label="Mobile workspace views"
          className="sm:hidden border-t border-line-subtle px-4 flex items-center gap-5 h-10 bg-surface"
        >
          {(
            [
              ['dossiers', 'Case dossiers'],
              ['ledger', 'Audit ledger'],
              ['wallet', 'Wallet workbench'],
            ] as Array<[ViewTab, string]>
          ).map(([id, label]) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'h-full inline-flex items-center text-compact font-medium border-b-2 btn-transition',
                  active ? 'border-brand text-ink-primary' : 'border-transparent text-ink-secondary'
                )}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Workspace */}
      <main id="top" className="flex-1 max-w-7xl w-full mx-auto">
        {activeTab === 'dossiers' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[calc(100vh-7rem)]">
            <DocketRail
              className="lg:col-span-4 xl:col-span-3"
              challenges={displayChallenges}
              submissions={displaySubmissions}
              selectedChallengeId={selectedChallenge?.id || 1}
              onSelectChallenge={setSelectedChallengeId}
              accounting={displayAccounting}
              contractBalanceWei={displayContractBal}
              contracts={PROOF.contracts}
              liveVerifiedText={liveVerifiedText}
              liveError={liveError}
              loading={dataMode === 'live' && liveLoading && !liveChallenges}
            />
            <div className="lg:col-span-8 xl:col-span-9 p-4 sm:p-6 lg:p-8 space-y-6">
              <TxMonitor txs={trackedTxs} onClear={() => setTrackedTxs([])} />
              <ClaimChartDossier
                challenge={selectedChallenge}
                submissions={selectedSubs}
                dataMode={dataMode}
                loading={dataMode === 'live' && liveLoading && !liveChallenges}
              />
            </div>
          </div>
        ) : activeTab === 'ledger' ? (
          <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            <TxMonitor txs={trackedTxs} onClear={() => setTrackedTxs([])} />
            <AuditLedger steps={PROOF.steps} />
          </div>
        ) : (
          <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            <TxMonitor txs={trackedTxs} onClear={() => setTrackedTxs([])} />
            <WalletWorkbench
              poolAddress={PROOF.contracts.priorArtPool.address}
              challenges={displayChallenges}
              submissions={displaySubmissions}
              onTxSubmitted={handleTxSubmitted}
              onRefreshLive={refreshLive}
            />
          </div>
        )}
      </main>

      {/* Quiet Archival Footer */}
      <footer className="border-t border-line-subtle bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-compact text-ink-muted">
          <span>
            PriorArtPool · Pinned runner <code className="font-code">{PROOF.network.runner.slice(0, 26)}...</code> ·
            Settlement gated by finality callbacks
          </span>
          <a
            href="https://github.com/khezzed/Prior-Art-Pool"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-ink-secondary hover:text-brand hover:underline focus-visible:rounded-sm"
          >
            GitHub repository
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </footer>
    </div>
  );
}

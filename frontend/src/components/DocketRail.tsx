import React from 'react';
import { ExternalLink, CheckCircle2, AlertCircle, FileSearch } from 'lucide-react';
import type { AccountingSummary, ChallengeRecord, ProofManifest, SubmissionRecord } from '../types';
import { STUDIONET_EXPLORER, shortHash } from '../lib/studionet';
import { cn } from '../lib/utils';
import { StatusTag } from './StatusTag';

export interface DocketRailProps {
  challenges: ChallengeRecord[];
  submissions: SubmissionRecord[];
  selectedChallengeId: number;
  onSelectChallenge: (id: number) => void;
  accounting: AccountingSummary;
  contractBalanceWei: string;
  contracts: ProofManifest['contracts'];
  liveVerifiedText: string;
  liveError: string;
  loading?: boolean;
  className?: string;
}

export const DocketRail: React.FC<DocketRailProps> = ({
  challenges,
  submissions,
  selectedChallengeId,
  onSelectChallenge,
  accounting,
  contractBalanceWei,
  contracts,
  liveVerifiedText,
  liveError,
  loading = false,
  className,
}) => {
  return (
    <aside
      aria-label="Patent docket and protocol ledger summary"
      className={cn(
        'bg-subtle border-b lg:border-b-0 lg:border-r border-line-subtle flex flex-col justify-between',
        className
      )}
    >
      <div className="p-4 sm:p-5 space-y-6">
        {/* Docket Selector */}
        <div>
          <div className="flex items-baseline justify-between mb-3 px-1">
            <h2 className="text-heading font-semibold text-ink-primary">Patent docket</h2>
            <span className="text-compact text-ink-muted tabular">{challenges.length} filings</span>
          </div>

          {loading ? (
            <div className="space-y-2" aria-busy="true">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-20 rounded-md bg-surface/70 animate-pulse" />
              ))}
            </div>
          ) : challenges.length === 0 ? (
            <div className="rounded-md border border-line-subtle bg-surface p-4 text-center space-y-1.5">
              <FileSearch className="w-5 h-5 text-ink-muted mx-auto" />
              <p className="text-body font-medium text-ink-primary">No patent challenges yet</p>
              <p className="text-compact text-ink-muted">Open a challenge in Wallet Workbench.</p>
            </div>
          ) : (
            <nav aria-label="Challenges" className="divide-y divide-line-subtle border-y border-line-subtle">
              {challenges.map((ch) => {
                const isSelected = ch.id === selectedChallengeId;
                const refCount = submissions.filter((s) => s.challenge_id === ch.id).length;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => onSelectChallenge(ch.id)}
                    className={cn(
                      'w-full text-left px-3 py-3.5 btn-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand active:scale-[0.995]',
                      isSelected
                        ? 'bg-surface text-ink-primary shadow-control'
                        : 'bg-transparent text-ink-secondary hover:bg-hoverbg'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className={cn(
                          'text-body font-semibold truncate',
                          isSelected ? 'text-brand' : 'text-ink-primary'
                        )}
                      >
                        {ch.patent_ref}
                      </span>
                      <span className="text-compact text-ink-muted tabular shrink-0">#{ch.id}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <StatusTag status={ch.status} />
                      <span className="text-compact text-ink-muted tabular">
                        {ch.total_contributed_wei} wei · {refCount} ref{refCount === 1 ? '' : 's'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        {/* Conservation Invariant Summary */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2.5 px-1">
            <h2 className="text-heading font-semibold text-ink-primary">Vault accounting</h2>
            <span
              className={cn(
                'inline-flex items-center gap-1 text-compact font-medium',
                accounting.invariant_holds ? 'text-pass-ink' : 'text-fail-ink'
              )}
            >
              {accounting.invariant_holds ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Conserved
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5" /> Mismatch
                </>
              )}
            </span>
          </div>

          <dl className="divide-y divide-line-subtle border-y border-line-subtle text-compact bg-surface/60 px-3">
            <div className="py-2 flex items-center justify-between">
              <dt className="text-ink-muted">Total inbound</dt>
              <dd className="font-medium text-ink-primary tabular">{accounting.total_inbound} wei</dd>
            </div>
            <div className="py-2 flex items-center justify-between">
              <dt className="text-ink-muted">Total outbound</dt>
              <dd className="font-medium text-ink-primary tabular">{accounting.total_outbound} wei</dd>
            </div>
            <div className="py-2 flex items-center justify-between">
              <dt className="text-ink-muted">Pool locked + bonds</dt>
              <dd className="font-medium text-ink-primary tabular">
                {accounting.total_pool_locked} + {accounting.total_bonds_held} wei
              </dd>
            </div>
            <div className="py-2 flex items-center justify-between">
              <dt className="text-ink-muted">Live contract balance</dt>
              <dd className="font-semibold text-pass-ink tabular">{contractBalanceWei} wei</dd>
            </div>
          </dl>

          <p className="text-compact text-ink-muted mt-2.5 px-1 leading-snug">
            {liveError ? liveError : liveVerifiedText}
          </p>
        </div>

        {/* Deployed Contracts */}
        <div className="pt-2">
          <h2 className="text-heading font-semibold text-ink-primary mb-2.5 px-1">StudioNet contracts</h2>
          <ul className="divide-y divide-line-subtle border-y border-line-subtle text-compact">
            {[
              { name: 'PriorArtPool', role: 'Vault', addr: contracts.priorArtPool.address },
              { name: 'PriorArtJudge', role: 'Oracle', addr: contracts.priorArtJudge.address },
              { name: 'EvidenceProbe', role: 'Probe', addr: contracts.evidenceProbe.address },
            ].map((item) => (
              <li key={item.name} className="py-2 px-1 flex items-center justify-between gap-2">
                <span className="text-ink-secondary font-medium">
                  {item.name} <span className="text-ink-muted font-normal">({item.role})</span>
                </span>
                <a
                  href={`${STUDIONET_EXPLORER}/address/${item.addr}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-code text-brand hover:text-brand-hover hover:underline focus-visible:rounded-sm"
                >
                  {shortHash(item.addr, 6, 4)}
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
};

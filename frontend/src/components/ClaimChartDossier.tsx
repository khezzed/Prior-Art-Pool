import React, { useState } from 'react';
import {
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  FileText,
  Scale,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import type { ChallengeRecord, SubmissionRecord } from '../types';
import { shortHash } from '../lib/studionet';
import { cn } from '../lib/utils';
import { StatusTag } from './StatusTag';
import { DossierSkeleton } from './DossierSkeleton';

export interface ClaimChartDossierProps {
  challenge: ChallengeRecord | null;
  submissions: SubmissionRecord[];
  dataMode: 'proof' | 'live';
  loading?: boolean;
  className?: string;
}

function sourceLabel(sourceType: string, cdxVerified: boolean): string {
  if (sourceType === 'rfc') return 'IETF RFC header date';
  if (sourceType === 'wikipedia') return 'Wikipedia permanent revision API';
  if (sourceType === 'archive') {
    return cdxVerified ? 'Archive.org raw id_ (CDX verified)' : 'Archive.org raw id_';
  }
  if (sourceType === 'github') return 'GitHub 40-hex commit (submission date)';
  return 'Immutable public archive';
}

export const ClaimChartDossier: React.FC<ClaimChartDossierProps> = ({
  challenge,
  submissions,
  dataMode,
  loading = false,
  className,
}) => {
  const [copiedKey, setCopiedKey] = useState<string>('');

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 1600);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  if (loading) {
    return <DossierSkeleton className={className} />;
  }

  if (!challenge) {
    return (
      <div
        className={cn(
          'bg-surface border border-line-subtle rounded-lg p-10 text-center space-y-2',
          className
        )}
      >
        <Scale className="w-7 h-7 text-ink-muted mx-auto" />
        <h2 className="text-heading font-semibold text-ink-primary">Select a patent challenge</h2>
        <p className="text-body text-ink-secondary max-w-md mx-auto">
          Choose a filing from the docket to inspect its frozen claim elements, prior-art submissions, and
          validator-verified verbatim quotes.
        </p>
      </div>
    );
  }

  const sponsorEntries = Object.entries(challenge.contributions || {});

  return (
    <article
      className={cn(
        'bg-surface border border-line-subtle rounded-lg shadow-sheet p-5 sm:p-7 space-y-6',
        className
      )}
    >
      {/* Dossier Title Header (starts directly with h1, zero eyebrow kicker) */}
      <header className="pb-5 border-b border-line-subtle space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-dossier font-semibold text-ink-primary">
              {challenge.patent_ref}
            </h1>
            <StatusTag status={challenge.status} />
          </div>

          <span className="text-compact text-ink-muted">
            Source: {dataMode === 'live' ? 'Live StudioNet RPC' : 'Recorded proof manifest'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-compact text-ink-secondary tabular">
          <span>
            Priority date <strong className="font-semibold text-ink-primary">{challenge.priority_date_iso}</strong>
          </span>
          <span>
            Crowdfunded{' '}
            <strong className="font-semibold text-ink-primary">
              {challenge.total_contributed_wei} wei
            </strong>{' '}
            ({sponsorEntries.length} sponsor{sponsorEntries.length === 1 ? '' : 's'})
          </span>
          <span>
            Forfeited bonds{' '}
            <strong className="font-semibold text-ink-primary">{challenge.forfeited_bonds_wei} wei</strong>
          </span>
          <span>
            Active pool <strong className="font-semibold text-ink-primary">{challenge.pool_wei} wei</strong>
          </span>
        </div>

        {/* Frozen rules digest */}
        <div className="flex flex-wrap items-center gap-2 text-compact text-ink-muted pt-1">
          <span>Frozen rules SHA-256:</span>
          <code className="font-code text-ink-secondary break-all">{challenge.rules_digest}</code>
          <button
            type="button"
            onClick={() => handleCopy('rules', challenge.rules_digest)}
            aria-label="Copy frozen rules SHA-256"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-ink-muted hover:text-ink-primary hover:bg-subtle active:scale-95 btn-transition focus-visible:ring-2 focus-visible:ring-brand"
          >
            {copiedKey === 'rules' ? <Check className="w-3.5 h-3.5 text-pass-ink" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* RuleGate & Outcome Summary (clean 2-column hairline grid, zero card cages) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6 border-b border-line-subtle">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
            <h2 className="text-heading font-semibold text-ink-primary">Up-front RuleGate vetting</h2>
            {challenge.vetting_result?.verdict && <StatusTag status={challenge.vetting_result.verdict} />}
          </div>
          <p className="text-body text-ink-secondary max-w-prose">
            {challenge.vetting_result?.reason ||
              'Validators verify every claim element is concrete and technically falsifiable before opening the pool.'}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {challenge.status === 'ANTICIPATED' ? (
              <CheckCircle2 className="w-4 h-4 text-pass-ink shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-ink-muted shrink-0" />
            )}
            <h2 className="text-heading font-semibold text-ink-primary">Settlement record</h2>
          </div>

          {challenge.status === 'ANTICIPATED' ? (
            <p className="text-body text-ink-secondary max-w-prose">
              Anticipated by <strong className="font-semibold text-ink-primary">Submission #{challenge.winner_submission_id}</strong>.
              Winning researcher{' '}
              <code className="font-code text-compact text-ink-primary">{shortHash(challenge.winner, 10, 6)}</code>{' '}
              proved every element prior to <span className="tabular">{challenge.priority_date_iso}</span> and claimed
              the crowdfunded pool plus bond return after finality.
            </p>
          ) : challenge.status === 'EXPIRED' ? (
            <p className="text-body text-ink-secondary max-w-prose">
              Grace deadline elapsed without a complete anticipation chart. Deterministic timeout unlocked zero-dust
              pro-rata refunds (including {challenge.forfeited_bonds_wei} wei in forfeited spam bonds) to all sponsors.
            </p>
          ) : challenge.status === 'REJECTED_VAGUE' ? (
            <p className="text-body text-ink-secondary max-w-prose">
              Blocked before opening because the claim relied on subjective marketing language. The sponsor deposit was
              credited safely to refundable balances with zero wei stranded.
            </p>
          ) : (
            <p className="text-body text-ink-secondary max-w-prose">
              Challenge remains open under the All-Elements Rule. Partial and post-dated submissions were disqualified
              and their anti-spam bonds enriched this pool.
            </p>
          )}

          {/* Wallet-free GenLayer Native Appeal Window & Finality Lifecycle */}
          <div className="pt-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-compact text-ink-muted mb-1.5">
              <span>GenLayer native appeal window</span>
              <span className="text-pass-ink font-medium tabular">
                Finalized · 0 appeals filed
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5" aria-label="GenLayer finality lifecycle">
              {['Submitted', 'Pending', 'Accepted', 'Finalized'].map((stage) => (
                <div key={stage}>
                  <div className="h-1.5 rounded-full bg-pass-ink" />
                  <p className="text-compact text-ink-muted mt-1">{stage}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Frozen Claim Elements & Crowdfunding Ledger */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-8 pb-6 border-b border-line-subtle">
        <div className="xl:col-span-2 space-y-3">
          <h2 className="text-heading font-semibold text-ink-primary">Frozen claim elements</h2>
          <ol className="divide-y divide-line-subtle border-y border-line-subtle">
            {challenge.elements.map((elem, idx) => (
              <li key={idx} className="py-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-baseline">
                <span className="sm:col-span-2 text-compact font-semibold text-ink-muted tabular">
                  Element {idx}
                </span>
                <p className="sm:col-span-10 text-body text-ink-primary max-w-prose">{elem}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-3">
          <h2 className="text-heading font-semibold text-ink-primary">Sponsor pool shares</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-compact border-y border-line-subtle">
              <thead>
                <tr className="border-b border-line-subtle text-ink-muted">
                  <th className="py-2 pr-2 font-medium">Sponsor</th>
                  <th className="py-2 pr-2 font-medium text-right">Funded</th>
                  {challenge.status === 'EXPIRED' && (
                    <th className="py-2 font-medium text-right">Pro-rata</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle tabular">
                {sponsorEntries.map(([addr, amt]) => {
                  const pct =
                    challenge.total_contributed_wei > 0
                      ? Math.round((amt / challenge.total_contributed_wei) * 100)
                      : 0;
                  const owed = challenge.pro_rata_owed?.[addr];
                  const claimed = challenge.pro_rata_claimed?.[addr];
                  return (
                    <tr key={addr}>
                      <td className="py-2.5 pr-2 font-code text-ink-secondary">{shortHash(addr, 7, 4)}</td>
                      <td className="py-2.5 pr-2 text-right text-ink-primary font-medium">
                        {amt} wei ({pct}%)
                      </td>
                      {challenge.status === 'EXPIRED' && (
                        <td className="py-2.5 text-right text-pass-ink font-medium">
                          {owed ?? 0} wei {claimed ? 'paid' : 'due'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Prior-Art Anticipation Claim Charts */}
      <section className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-heading font-semibold text-ink-primary">
            Prior-art anticipation claim charts ({submissions.length})
          </h2>
          <span className="text-compact text-ink-muted">
            One narrow validator consensus judgment per element
          </span>
        </div>

        {submissions.length === 0 ? (
          <div className="rounded-md bg-inset border border-line-subtle p-8 text-center space-y-1.5">
            <FileText className="w-6 h-6 text-ink-muted mx-auto" />
            <p className="text-body font-medium text-ink-primary">No prior-art references filed</p>
            <p className="text-compact text-ink-secondary max-w-md mx-auto">
              This filing was rejected during up-front RuleGate vetting before researcher submissions opened.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line-strong space-y-8">
            {submissions.map((sub, sIdx) => (
              <div key={sub.id} className={cn(sIdx > 0 && 'pt-8', 'space-y-4')}>
                {/* Submission Header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-body font-semibold text-ink-primary">
                        Submission #{sub.id}: {sub.reference_title}
                      </h3>
                      <StatusTag status={sub.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-compact text-ink-muted">
                      <span>
                        Researcher <code className="font-code text-ink-secondary">{shortHash(sub.researcher, 8, 5)}</code>
                      </span>
                      <a
                        href={sub.reference_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-code text-brand hover:text-brand-hover hover:underline break-all focus-visible:rounded-sm"
                      >
                        {sub.reference_url}
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Element-by-Element Claim-Chart Rows */}
                <div className="border-t border-line-subtle divide-y divide-line-subtle">
                  {sub.elements.map((el) => {
                    const copyId = `slice-${sub.id}-${el.index}`;
                    const datePrior = el.pub_date_iso && el.pub_date_iso < challenge.priority_date_iso;
                    return (
                      <div
                        key={el.index}
                        className="py-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start"
                      >
                        {/* Column 1: Element & Chronology */}
                        <div className="lg:col-span-4 space-y-2">
                          <div className="flex items-center justify-between lg:justify-start gap-2.5">
                            <span className="text-body font-semibold text-ink-primary tabular">
                              Element {el.index}
                            </span>
                            <StatusTag status={el.verdict || el.status} />
                          </div>

                          {el.pub_date_iso ? (
                            <div className="text-compact space-y-0.5 tabular">
                              <p className={datePrior ? 'text-pass-ink font-medium' : 'text-fail-ink font-medium'}>
                                Published {el.pub_date_iso} {datePrior ? '<' : '>='} priority{' '}
                                {challenge.priority_date_iso}
                              </p>
                              <p className="text-ink-muted">
                                {sourceLabel(el.source_type, el.cdx_verified)}
                              </p>
                            </div>
                          ) : sub.status === 'SUPERSEDED_REFUNDED' ? (
                            <p className="text-compact text-ink-muted">
                              Superseded before mapping — honest losing racer reclaimed bond
                            </p>
                          ) : (
                            <p className="text-compact text-ink-muted">Not yet mapped on-chain</p>
                          )}
                        </div>

                        {/* Column 2: Verbatim Excerpt & Validator Rationale */}
                        <div className="lg:col-span-8 space-y-2.5">
                          {el.verbatim_quote && (
                            <figure className="bg-inset border border-line-subtle rounded-md px-4 py-3 space-y-1.5">
                              <figcaption className="text-compact font-medium text-ink-muted">
                                Validator-verified verbatim excerpt
                              </figcaption>
                              <blockquote className="font-serif italic text-body text-ink-primary whitespace-pre-wrap leading-relaxed">
                                “{el.verbatim_quote}”
                              </blockquote>
                            </figure>
                          )}

                          {el.reason && (
                            <p className="text-body text-ink-secondary max-w-prose">{el.reason}</p>
                          )}

                          {el.slice_digest && (
                            <div className="flex flex-wrap items-center gap-2 text-compact text-ink-muted">
                              <span>Slice SHA-256:</span>
                              <code className="font-code text-ink-secondary">{shortHash(el.slice_digest, 18, 12)}</code>
                              <button
                                type="button"
                                onClick={() => handleCopy(copyId, el.slice_digest)}
                                aria-label={`Copy slice SHA-256 for submission ${sub.id} element ${el.index}`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-ink-muted hover:text-ink-primary hover:bg-subtle active:scale-95 btn-transition focus-visible:ring-2 focus-visible:ring-brand"
                              >
                                {copiedKey === copyId ? (
                                  <Check className="w-3.5 h-3.5 text-pass-ink" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  );
};

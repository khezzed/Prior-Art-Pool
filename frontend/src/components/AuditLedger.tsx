import React, { useMemo, useState } from 'react';
import { ExternalLink, FileCheck2 } from 'lucide-react';
import type { ProofStep } from '../types';
import { STUDIONET_EXPLORER, shortHash } from '../lib/studionet';
import { cn } from '../lib/utils';

export interface AuditLedgerProps {
  steps: ProofStep[];
  className?: string;
}

type FilterMode = 'all' | 'judgments' | 'payouts' | 'guards';

export const AuditLedger: React.FC<AuditLedgerProps> = ({ steps, className }) => {
  const [filter, setFilter] = useState<FilterMode>('all');

  const filteredSteps = useMemo(() => {
    if (filter === 'all') return steps;
    if (filter === 'judgments') {
      return steps.filter((s) => s.method === 'open_challenge' || s.method === 'map_claim_element');
    }
    if (filter === 'payouts') {
      return steps.filter(
        (s) =>
          s.method === 'withdraw_refund' ||
          s.method === 'claim_payout' ||
          s.method === 'claim_pro_rata_refund' ||
          s.method === 'expire_challenge'
      );
    }
    return steps.filter((s) => s.expectedFailure || s.stepId.includes('INJECTION') || s.stepId.includes('POSTDATED'));
  }, [steps, filter]);

  const totalTxs = useMemo(
    () => steps.reduce((acc, s) => acc + 1 + (s.childTxHashes?.length || 0), 0),
    [steps]
  );

  return (
    <section
      className={cn(
        'bg-surface border border-line-subtle rounded-lg shadow-sheet p-5 sm:p-8 space-y-6',
        className
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-line-subtle">
        <div className="space-y-1">
          <h1 className="font-serif text-dossier font-semibold text-ink-primary">
            Finalized StudioNet audit ledger
          </h1>
          <p className="text-body text-ink-secondary tabular">
            {steps.length} executed lifecycle steps and {totalTxs} finalized parent and callback transactions
            (plus 4 deployment and wiring transactions verified via <code className="font-code text-compact">npm run verify:proof</code>).
          </p>
        </div>

        {/* Connected Segmented Filter Control (non-button wall) */}
        <div
          role="tablist"
          aria-label="Filter transactions"
          className="inline-flex rounded-md bg-subtle p-1 border border-line-subtle text-compact"
        >
          {(
            [
              ['all', 'All steps'],
              ['judgments', 'Validator judgments'],
              ['payouts', 'Settlements'],
              ['guards', 'Adversarial & guards'],
            ] as Array<[FilterMode, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
              className={cn(
                'px-3 py-1.5 rounded-sm font-medium btn-transition focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98]',
                filter === id
                  ? 'bg-surface text-ink-primary shadow-control'
                  : 'text-ink-secondary hover:text-ink-primary'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filteredSteps.length === 0 ? (
        <div className="rounded-md bg-inset border border-line-subtle p-10 text-center space-y-1.5">
          <FileCheck2 className="w-6 h-6 text-ink-muted mx-auto" />
          <p className="text-body font-medium text-ink-primary">No matching transactions</p>
          <p className="text-compact text-ink-secondary">Switch the ledger filter above to inspect all steps.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line-strong text-compact text-ink-muted">
                <th className="py-2.5 pr-4 font-medium">Step</th>
                <th className="py-2.5 pr-4 font-medium">Action &amp; description</th>
                <th className="py-2.5 pr-4 font-medium">Method</th>
                <th className="py-2.5 pr-4 font-medium">Finalized return</th>
                <th className="py-2.5 font-medium">Explorer links</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle text-compact">
              {filteredSteps.map((st) => (
                <tr key={st.stepId} className="hover:bg-canvas/70 surface-transition align-top">
                  <td className="py-3.5 pr-4 font-code font-medium text-ink-primary whitespace-nowrap">
                    {st.stepId}
                  </td>
                  <td className="py-3.5 pr-4 text-ink-secondary max-w-md leading-relaxed">
                    {st.label}
                  </td>
                  <td className="py-3.5 pr-4 font-code text-ink-primary whitespace-nowrap">
                    {st.method}
                  </td>
                  <td className="py-3.5 pr-4 max-w-xs">
                    <span
                      className={cn(
                        'inline-block font-medium',
                        st.expectedFailure ? 'text-warn-ink' : 'text-pass-ink'
                      )}
                    >
                      {st.status} · {st.executionResult}
                    </span>
                    {st.returnValue ? (
                      <div className="font-code text-ink-muted mt-1 break-all">
                        {String(st.returnValue).replace(/^"|"$/g, '')}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-3.5 font-code whitespace-nowrap space-y-1">
                    <div>
                      <a
                        href={`${STUDIONET_EXPLORER}/tx/${st.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-brand hover:text-brand-hover hover:underline focus-visible:rounded-sm"
                      >
                        {shortHash(st.txHash, 10, 6)}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                    {(st.childTxHashes || []).map((ch, idx) => (
                      <div key={ch} className="pl-2 text-ink-muted">
                        <a
                          href={`${STUDIONET_EXPLORER}/tx/${ch}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-ink-secondary hover:text-brand hover:underline focus-visible:rounded-sm"
                        >
                          callback {idx + 1}: {shortHash(ch, 8, 5)}
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

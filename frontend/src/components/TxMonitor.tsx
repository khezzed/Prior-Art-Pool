import React from 'react';
import { ExternalLink, CheckCircle2, Clock, ShieldAlert, XCircle, Radio, Trash2 } from 'lucide-react';
import type { TrackedTx, TxLifecycleState } from '../types';
import { STUDIONET_EXPLORER, shortHash } from '../lib/studionet';
import { cn } from '../lib/utils';

export interface TxMonitorProps {
  txs: TrackedTx[];
  onClear: () => void;
  className?: string;
}

const STATE_INFO: Record<
  TxLifecycleState,
  { label: string; description: string; toneClass: string; icon: React.ReactNode }
> = {
  submitted: {
    label: 'Submitted',
    description: 'Signed and broadcast to GenLayer StudioNet RPC.',
    toneClass: 'bg-brand-soft text-brand border-brand-border',
    icon: <Radio className="w-3.5 h-3.5" />,
  },
  pending: {
    label: 'Pending consensus',
    description: 'Validators are executing GenVM consensus over the transaction.',
    toneClass: 'bg-neutralst-bg text-neutralst-ink border-neutralst-border',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  accepted: {
    label: 'Accepted (appeal window)',
    description: 'GenLayer native appeal window is open. Finality callbacks wait until finalized.',
    toneClass: 'bg-warn-bg text-warn-ink border-warn-border',
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
  },
  'finalized-success': {
    label: 'Finalized (success)',
    description: 'Appeal window closed and finality callbacks settled.',
    toneClass: 'bg-pass-bg text-pass-ink border-pass-border',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  'finalized-error': {
    label: 'Finalized (error)',
    description: 'Transaction finalized with a GenVM execution error or undetermined consensus.',
    toneClass: 'bg-fail-bg text-fail-ink border-fail-border',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

const STAGES: Array<{ id: TxLifecycleState; label: string }> = [
  { id: 'submitted', label: 'Submitted' },
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted (appeal window)' },
  { id: 'finalized-success', label: 'Finalized' },
];

export const TxMonitor: React.FC<TxMonitorProps> = ({ txs, onClear, className }) => {
  if (txs.length === 0) return null;

  return (
    <section
      aria-label="Submitted transaction monitor"
      className={cn(
        'bg-surface border border-line-subtle rounded-lg shadow-sheet p-5 sm:p-6 space-y-4',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-line-subtle">
        <div>
          <h2 className="text-heading font-semibold text-ink-primary">
            Transaction and appeal-window monitor
          </h2>
          <p className="text-compact text-ink-muted">
            Persisted in localStorage across reloads. Polls StudioNet every 8 seconds and tracks emitted finality callbacks.
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-compact font-medium bg-surface border border-line-strong text-ink-secondary hover:bg-subtle hover:text-ink-primary active:scale-[0.98] disabled:opacity-50 btn-transition focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear history
        </button>
      </div>

      <div className="divide-y divide-line-subtle">
        {txs.map((tx) => {
          const info = STATE_INFO[tx.state];
          const stageIdx =
            tx.state === 'finalized-error'
              ? 3
              : Math.max(
                  0,
                  STAGES.findIndex((s) => s.id === tx.state)
                );

          return (
            <div key={tx.hash} className="py-4 first:pt-1 last:pb-1 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm border text-compact font-medium',
                      info.toneClass
                    )}
                  >
                    {info.icon}
                    {info.label}
                  </span>
                  <span className="text-body font-medium text-ink-primary">{tx.label}</span>
                </div>
                <a
                  href={`${STUDIONET_EXPLORER}/tx/${tx.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-code text-compact text-brand hover:text-brand-hover hover:underline"
                >
                  {shortHash(tx.hash, 10, 6)}
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {STAGES.map((stage, idx) => {
                  const reached = idx <= stageIdx;
                  const isErr = idx === 3 && tx.state === 'finalized-error';
                  const isAppeal = idx === 2 && tx.state === 'accepted';
                  const bar = isErr
                    ? 'bg-fail-ink'
                    : isAppeal
                      ? 'bg-warn-ink'
                      : reached
                        ? 'bg-pass-ink'
                        : 'bg-subtle';
                  return (
                    <div key={stage.id}>
                      <div className={cn('h-1.5 rounded-full', bar)} />
                      <p className="text-compact text-ink-muted mt-1">{stage.label}</p>
                    </div>
                  );
                })}
              </div>

              <p className="text-compact text-ink-secondary">{info.description}</p>

              {tx.returnReadable && (
                <div className="rounded-md bg-inset border border-line-subtle px-3 py-2 font-code text-compact text-ink-primary break-all">
                  Return: {tx.returnReadable}
                </div>
              )}

              {tx.errorDetail && (
                <div className="rounded-md bg-fail-bg border border-fail-border px-3 py-2 font-code text-compact text-fail-ink break-all">
                  Error: {tx.errorDetail}
                </div>
              )}

              {tx.childTxHashes.length > 0 && (
                <div className="pt-2 space-y-1.5">
                  <p className="text-compact font-medium text-ink-secondary">
                    Emitted finality callbacks (emit on="finalized")
                  </p>
                  {tx.childTxHashes.map((ch) => {
                    const cst = tx.childStates[ch] || 'pending';
                    const cinfo = STATE_INFO[cst];
                    return (
                      <div key={ch} className="flex flex-wrap items-center justify-between gap-2 text-compact">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border font-medium',
                            cinfo.toneClass
                          )}
                        >
                          {cinfo.label}
                        </span>
                        <a
                          href={`${STUDIONET_EXPLORER}/tx/${ch}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-code text-brand hover:underline"
                        >
                          {shortHash(ch, 10, 6)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

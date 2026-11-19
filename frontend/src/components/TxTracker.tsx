import React from 'react';
import { ExternalLink, ShieldAlert, CheckCircle2, Clock, Radio, XCircle, Trash2 } from 'lucide-react';
import type { TrackedTx, TxLifecycleState } from '../types';
import { STUDIONET_EXPLORER, shortHash } from '../lib/studionet';

const STATE_META: Record<
  TxLifecycleState,
  { label: string; desc: string; badgeClass: string; icon: React.ReactNode }
> = {
  submitted: {
    label: 'SUBMITTED',
    desc: 'Signed & broadcast to StudioNet RPC',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    icon: <Radio className="w-3.5 h-3.5 animate-pulse" />,
  },
  pending: {
    label: 'PENDING',
    desc: 'Validators executing GenVM consensus',
    badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    icon: <Clock className="w-3.5 h-3.5 animate-spin" />,
  },
  accepted: {
    label: 'ACCEPTED (APPEAL WINDOW)',
    desc: 'GenLayer native appeal window open — finality callbacks wait until FINALIZED',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    icon: <ShieldAlert className="w-3.5 h-3.5 animate-pulse" />,
  },
  'finalized-success': {
    label: 'FINALIZED · SUCCESS',
    desc: 'Appeal window closed — finality callbacks & value transfers unlocked',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  'finalized-error': {
    label: 'FINALIZED · ERROR',
    desc: 'Transaction finalized with GenVM execution error or undetermined consensus',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

const PIPELINE: TxLifecycleState[] = ['submitted', 'pending', 'accepted', 'finalized-success'];

interface Props {
  txs: TrackedTx[];
  onClear: () => void;
}

export const TxTracker: React.FC<Props> = ({ txs, onClear }) => {
  if (txs.length === 0) return null;

  return (
    <section className="glass-panel rounded-2xl p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            Resumable StudioNet Transaction & Appeal Window Monitor
          </h3>
          <p className="text-xs text-slate-400">
            Persisted in localStorage across page reloads · Polls every 8s · Follows{' '}
            <code className="text-emerald-300">emit(on="finalized")</code> child callbacks
          </p>
        </div>
        <button
          onClick={onClear}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700"
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear History
        </button>
      </div>

      <div className="space-y-3">
        {txs.map((tx) => {
          const meta = STATE_META[tx.state];
          const activeStepIdx =
            tx.state === 'finalized-error' ? 3 : Math.max(0, PIPELINE.indexOf(tx.state));

          return (
            <div key={tx.hash} className="rounded-xl bg-slate-900/80 border border-slate-800 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border ${meta.badgeClass}`}
                  >
                    {meta.icon}
                    {meta.label}
                  </span>
                  <span className="text-sm font-medium text-slate-100">{tx.label}</span>
                </div>
                <a
                  href={`${STUDIONET_EXPLORER}/tx/${tx.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-sky-400 hover:text-sky-300"
                >
                  {shortHash(tx.hash)} <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* 4-stage progress bar including explicit GenLayer Native Appeal Window */}
              <div className="grid grid-cols-4 gap-1.5 my-2.5">
                {['1. Submitted', '2. Pending', '3. Accepted (Appeal Window)', '4. Finalized'].map(
                  (stepLabel, idx) => {
                    const reached = idx <= activeStepIdx;
                    const isErrorFinal = idx === 3 && tx.state === 'finalized-error';
                    const isAppeal = idx === 2 && tx.state === 'accepted';
                    const barColor = isErrorFinal
                      ? 'bg-rose-500'
                      : isAppeal
                        ? 'bg-amber-400 animate-pulse'
                        : reached
                          ? 'bg-emerald-400'
                          : 'bg-slate-800';
                    return (
                      <div key={stepLabel}>
                        <div className={`h-1.5 rounded-full ${barColor}`} />
                        <p className="text-[11px] text-slate-400 mt-1 truncate">{stepLabel}</p>
                      </div>
                    );
                  }
                )}
              </div>

              <p className="text-xs text-slate-400">{meta.desc}</p>

              {tx.returnReadable && (
                <div className="mt-2 px-3 py-1.5 rounded-lg bg-slate-950/90 border border-slate-800 text-xs font-mono text-emerald-300 break-all">
                  Return: {tx.returnReadable}
                </div>
              )}
              {tx.errorDetail && (
                <div className="mt-2 px-3 py-1.5 rounded-lg bg-rose-950/50 border border-rose-500/30 text-xs font-mono text-rose-300 break-all">
                  Error: {tx.errorDetail}
                </div>
              )}
              {tx.childTxHashes.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Emitted Finality Callbacks (emit on="finalized")
                  </p>
                  {tx.childTxHashes.map((ch) => {
                    const cst = tx.childStates[ch] || 'pending';
                    const cmeta = STATE_META[cst];
                    return (
                      <div key={ch} className="flex items-center justify-between text-xs font-mono">
                        <span className={`px-2 py-0.5 rounded border ${cmeta.badgeClass}`}>
                          {cmeta.label}
                        </span>
                        <a
                          href={`${STUDIONET_EXPLORER}/tx/${ch}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                        >
                          {shortHash(ch)} <ExternalLink className="w-3 h-3" />
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

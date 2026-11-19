import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  ExternalLink,
  Quote,
  FileCode2,
  CalendarClock,
  AlertTriangle,
  Award,
  Coins,
  Link2,
} from 'lucide-react';
import type { ChallengeRecord, SubmissionRecord, ProofStep } from '../types';
import { STUDIONET_EXPLORER, shortHash } from '../lib/studionet';

interface Props {
  challenges: ChallengeRecord[];
  submissions: SubmissionRecord[];
  steps: ProofStep[];
  dataMode: 'proof' | 'live';
}

function statusBadge(status: string) {
  switch (status) {
    case 'ANTICIPATED':
    case 'WON':
    case 'DISCLOSED':
    case 'ACCEPTED':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';
    case 'OPEN':
    case 'ACTIVE':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/35';
    case 'REJECTED_VAGUE':
    case 'DISQUALIFIED_NOT_DISCLOSED':
    case 'DISQUALIFIED_POST_DATED':
    case 'NOT_DISCLOSED':
    case 'POST_DATED':
    case 'INVALID_EVIDENCE':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/35';
    case 'EXPIRED':
    case 'PENDING_VETTING':
    case 'INSUFFICIENT_EVIDENCE':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
    default:
      return 'bg-slate-700/40 text-slate-300 border-slate-600';
  }
}

function sourceBadge(src: string, cdx: boolean) {
  if (src === 'rfc') return 'IETF RFC · Header Date';
  if (src === 'wikipedia') return 'Wikipedia revid API · Server Timestamp';
  if (src === 'archive') return cdx ? 'Archive.org id_ · CDX Verified ✓' : 'Archive.org id_';
  if (src === 'github') return 'GitHub 40-Hex SHA · Conservative Date';
  return src || 'Immutable Public Source';
}

export const CaseExplorer: React.FC<Props> = ({ challenges, submissions, steps, dataMode }) => {
  const [selectedChallengeId, setSelectedChallengeId] = useState<number>(challenges[1]?.id || challenges[0]?.id || 1);

  const selectedChallenge =
    challenges.find((c) => c.id === selectedChallengeId) || challenges[0] || null;
  const relatedSubs = selectedChallenge
    ? submissions.filter((s) => s.challenge_id === selectedChallenge.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Challenge Selector Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {challenges.map((ch) => {
          const active = selectedChallenge?.id === ch.id;
          const subs = submissions.filter((s) => s.challenge_id === ch.id);
          return (
            <button
              key={ch.id}
              onClick={() => setSelectedChallengeId(ch.id)}
              className={`text-left rounded-2xl p-4 transition-all border ${
                active
                  ? 'bg-slate-900 border-emerald-400/60 shadow-lg shadow-emerald-950/40'
                  : 'glass-panel hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-mono text-slate-400">CHALLENGE #{ch.id}</span>
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${statusBadge(ch.status)}`}
                >
                  {ch.status}
                </span>
              </div>
              <p className="font-semibold text-slate-100 text-sm truncate">{ch.patent_ref}</p>
              <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
                <span>Priority: {ch.priority_date_iso}</span>
                <span>{subs.length} ref(s)</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Contributed</span>
                <span className="text-emerald-300">{ch.total_contributed_wei} wei</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Challenge Deep Inspection */}
      {selectedChallenge && (
        <div className="glass-panel rounded-2xl p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5">
            <div>
              <div className="flex flex-wrap items-center gap-2.5 mb-2">
                <span
                  className={`text-xs font-mono px-2.5 py-1 rounded-full border ${statusBadge(selectedChallenge.status)}`}
                >
                  {selectedChallenge.status}
                </span>
                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-slate-800/90 text-slate-300 border border-slate-700">
                  {dataMode === 'live' ? 'LIVE RPC READ' : 'RECORDED PROOF MANIFEST'}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  Priority Date: <strong className="text-slate-200">{selectedChallenge.priority_date_iso}</strong>
                </span>
              </div>
              <h2 className="text-xl font-bold text-white">{selectedChallenge.patent_ref}</h2>
              <p className="text-xs font-mono text-slate-400 mt-1">
                Frozen Rules SHA-256: <span className="text-slate-300">{selectedChallenge.rules_digest}</span>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-right">
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 px-3.5 py-2.5">
                <p className="text-[11px] uppercase text-slate-400">Crowdfunded</p>
                <p className="text-base font-mono font-semibold text-emerald-300">
                  {selectedChallenge.total_contributed_wei} wei
                </p>
                <p className="text-[11px] text-slate-500">
                  {Object.keys(selectedChallenge.contributions || {}).length} sponsor(s)
                </p>
              </div>
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 px-3.5 py-2.5">
                <p className="text-[11px] uppercase text-slate-400">Forfeited Bonds</p>
                <p className="text-base font-mono font-semibold text-amber-300">
                  +{selectedChallenge.forfeited_bonds_wei} wei
                </p>
                <p className="text-[11px] text-slate-500">Spam/Invalid Penalty</p>
              </div>
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 px-3.5 py-2.5">
                <p className="text-[11px] uppercase text-slate-400">Active Pool</p>
                <p className="text-base font-mono font-semibold text-sky-300">
                  {selectedChallenge.pool_wei} wei
                </p>
                <p className="text-[11px] text-slate-500">Min bond: {selectedChallenge.min_bond_wei}</p>
              </div>
            </div>
          </div>

          {/* RuleGate Vetting Outcome */}
          {selectedChallenge.vetting_result?.verdict && (
            <div
              className={`rounded-xl p-4 border flex flex-wrap items-start gap-3 ${
                selectedChallenge.vetting_result.verdict === 'ACCEPTED'
                  ? 'bg-emerald-950/25 border-emerald-500/30'
                  : 'bg-rose-950/30 border-rose-500/35'
              }`}
            >
              {selectedChallenge.vetting_result.verdict === 'ACCEPTED' ? (
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                    Up-Front RuleGate Consensus Verdict:
                  </span>
                  <span
                    className={`text-xs font-mono px-2 py-0.5 rounded border ${statusBadge(selectedChallenge.vetting_result.verdict)}`}
                  >
                    {selectedChallenge.vetting_result.verdict}
                  </span>
                </div>
                <p className="text-sm text-slate-300 mt-1">
                  {selectedChallenge.vetting_result.reason || 'Evaluated by decentralized GenLayer validators.'}
                </p>
              </div>
            </div>
          )}

          {/* Frozen Claim Elements */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              Frozen Patent Claim Elements (All-Elements Rule: 35 U.S.C. § 102)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selectedChallenge.elements.map((elem, idx) => (
                <div key={idx} className="rounded-xl bg-slate-900/80 border border-slate-800 p-3.5">
                  <span className="text-xs font-mono text-emerald-400 font-semibold">ELEMENT E{idx}</span>
                  <p className="text-sm text-slate-200 mt-1 leading-relaxed">{elem}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Crowdfunders & Pro-Rata Distribution / Winner Banner */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                <Coins className="w-4 h-4 text-emerald-400" /> Crowdfunding Sponsors
              </div>
              <div className="space-y-2">
                {Object.entries(selectedChallenge.contributions || {}).map(([addr, amt]) => {
                  const pct =
                    selectedChallenge.total_contributed_wei > 0
                      ? ((amt / selectedChallenge.total_contributed_wei) * 100).toFixed(1)
                      : '0.0';
                  const proRata = selectedChallenge.pro_rata_owed?.[addr];
                  const claimed = selectedChallenge.pro_rata_claimed?.[addr];
                  return (
                    <div
                      key={addr}
                      className="flex items-center justify-between text-xs font-mono bg-slate-950/70 rounded-lg px-3 py-2 border border-slate-800/80"
                    >
                      <span className="text-slate-300">{shortHash(addr, 10, 6)}</span>
                      <div className="text-right">
                        <span className="text-emerald-300">
                          {amt} wei ({pct}%)
                        </span>
                        {proRata !== undefined && (
                          <span className="ml-2 text-amber-300">
                            → Refund: {proRata} wei {claimed ? '(CLAIMED ✓)' : '(DUE)'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                <Award className="w-4 h-4 text-amber-400" /> Settlement Status
              </div>
              {selectedChallenge.status === 'ANTICIPATED' ? (
                <div className="text-sm text-emerald-300 space-y-1">
                  <p className="font-semibold">
                    ✓ Claim Anticipated by Submission #{selectedChallenge.winner_submission_id}
                  </p>
                  <p className="text-xs font-mono text-slate-300">
                    Winning Researcher: {selectedChallenge.winner}
                  </p>
                  <p className="text-xs text-slate-400">
                    All elements finalized DISCLOSED before priority date {selectedChallenge.priority_date_iso}.
                  </p>
                </div>
              ) : selectedChallenge.status === 'EXPIRED' ? (
                <div className="text-sm text-amber-300 space-y-1">
                  <p className="font-semibold">Deterministic Timeout Fallback Executed</p>
                  <p className="text-xs text-slate-300">
                    No single reference proved all elements before grace deadline. Original pool +{' '}
                    {selectedChallenge.forfeited_bonds_wei} wei in forfeited spam bonds distributed pro-rata to sponsors.
                  </p>
                </div>
              ) : selectedChallenge.status === 'REJECTED_VAGUE' ? (
                <div className="text-sm text-rose-300 space-y-1">
                  <p className="font-semibold">Blocked Up Front by RuleGate</p>
                  <p className="text-xs text-slate-300">
                    Subjective/unobservable claim elements rejected before opening; deposit credited safely to sponsor
                    refundable balance.
                  </p>
                </div>
              ) : (
                <div className="text-sm text-sky-300 space-y-1">
                  <p className="font-semibold">Open Race — All-Elements Rule Active</p>
                  <p className="text-xs text-slate-300">
                    No competing prior-art submission has disclosed every element yet. Partial & post-dated references
                    were disqualified and their bonds enriched this pool.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Prior-Art Submissions & Element-by-Element Claim Charts */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Submitted Prior-Art References & Verbatim Claim Charts ({relatedSubs.length})
            </h3>
            {relatedSubs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-400">
                No prior-art references submitted on this challenge (blocked at up-front RuleGate).
              </div>
            ) : (
              <div className="space-y-4">
                {relatedSubs.map((sub) => (
                  <div key={sub.id} className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-slate-400">SUBMISSION #{sub.id}</span>
                          <span
                            className={`text-xs font-mono px-2.5 py-0.5 rounded-full border ${statusBadge(sub.status)}`}
                          >
                            {sub.status}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            Researcher: {shortHash(sub.researcher, 8, 6)}
                          </span>
                        </div>
                        <h4 className="text-base font-semibold text-white">{sub.reference_title}</h4>
                        <a
                          href={sub.reference_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-mono text-sky-400 hover:text-sky-300 mt-1 break-all"
                        >
                          <Link2 className="w-3.5 h-3.5 shrink-0" />
                          {sub.reference_url}
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    </div>

                    {/* Element-by-element rows */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                      {sub.elements.map((el) => (
                        <div
                          key={el.index}
                          className="rounded-xl bg-slate-950/90 border border-slate-800/90 p-4 space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-mono font-semibold text-slate-200">
                              Element E{el.index}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded border ${statusBadge(el.status)}`}
                            >
                              {el.status === 'DISCLOSED' ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : el.status === 'UNMAPPED' ? (
                                <Clock className="w-3.5 h-3.5" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5" />
                              )}
                              {el.verdict || el.status}
                            </span>
                          </div>

                          {el.pub_date_iso && (
                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                                <CalendarClock className="w-3 h-3 text-sky-400" />
                                Pub Date: {el.pub_date_iso} vs Priority: {selectedChallenge.priority_date_iso}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                                {sourceBadge(el.source_type, el.cdx_verified)}
                              </span>
                            </div>
                          )}

                          {el.verbatim_quote && (
                            <blockquote className="rounded-lg bg-emerald-950/30 border-l-2 border-emerald-400 px-3 py-2 text-xs text-emerald-100 font-mono">
                              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-400 block mb-1">
                                <Quote className="w-3 h-3" /> Validator-Verified Verbatim Excerpt
                              </span>
                              “{el.verbatim_quote}”
                            </blockquote>
                          )}

                          {el.slice_digest && (
                            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 break-all">
                              <FileCode2 className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                              <span>Slice SHA-256: {el.slice_digest.slice(0, 32)}…</span>
                            </div>
                          )}

                          {el.reason && <p className="text-xs text-slate-400">{el.reason}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Finalized Transaction Audit Ledger */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-white">
              Finalized StudioNet Proof Ledger ({steps.length} Executed Flows + Emitted Finality Callbacks)
            </h3>
            <p className="text-xs text-slate-400">
              Every parent transaction and every asynchronous <code className="text-emerald-300">emit(on="finalized")</code>{' '}
              callback verified on GenLayer StudioNet Explorer.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase">
                <th className="py-2.5 pr-3">Step</th>
                <th className="py-2.5 pr-3">Description</th>
                <th className="py-2.5 pr-3">Method</th>
                <th className="py-2.5 pr-3">Outcome</th>
                <th className="py-2.5">Explorer Tx & Callbacks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {steps.map((st) => (
                <tr key={st.stepId} className="hover:bg-slate-900/50">
                  <td className="py-3 pr-3 font-mono font-semibold text-slate-200 whitespace-nowrap">
                    {st.stepId}
                  </td>
                  <td className="py-3 pr-3 text-slate-300 max-w-md">{st.label}</td>
                  <td className="py-3 pr-3 font-mono text-sky-300 whitespace-nowrap">{st.method}</td>
                  <td className="py-3 pr-3 font-mono">
                    <span
                      className={`inline-block px-2 py-0.5 rounded border ${
                        st.expectedFailure
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                      }`}
                    >
                      {st.status} · {st.executionResult}
                    </span>
                    {st.returnValue ? (
                      <div className="text-[11px] text-slate-400 mt-1 max-w-xs truncate">
                        {String(st.returnValue)}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-3 font-mono space-y-1 whitespace-nowrap">
                    <a
                      href={`${STUDIONET_EXPLORER}/tx/${st.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                    >
                      {shortHash(st.txHash, 10, 6)} <ExternalLink className="w-3 h-3" />
                    </a>
                    {(st.childTxHashes || []).map((ch, idx) => (
                      <div key={ch}>
                        <a
                          href={`${STUDIONET_EXPLORER}/tx/${ch}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
                        >
                          ↳ cb{idx + 1}: {shortHash(ch, 8, 5)} <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

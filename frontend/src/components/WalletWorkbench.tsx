import React, { useEffect, useState } from 'react';
import { Wallet, Sparkles, Send, Coins, FileSearch, ArrowDownToLine, RefreshCw, Shield } from 'lucide-react';
import type { ChallengeRecord, SubmissionRecord } from '../types';
import {
  ensureStudioNetWalletNetwork,
  fetchAccountBalances,
  fetchNativeBalanceWei,
  fundStudioNetAccount,
  getWalletClient,
  shortHash,
} from '../lib/studionet';

interface Props {
  poolAddress: string;
  challenges: ChallengeRecord[];
  submissions: SubmissionRecord[];
  onTxSubmitted: (hash: string, label: string, method: string) => void;
  onRefreshLive: () => void;
}

export const WalletWorkbench: React.FC<Props> = ({
  poolAddress,
  challenges,
  submissions,
  onTxSubmitted,
  onRefreshLive,
}) => {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [nativeWei, setNativeWei] = useState<string>('0');
  const [claimableWei, setClaimableWei] = useState<number>(0);
  const [refundableWei, setRefundableWei] = useState<number>(0);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);

  // Open Challenge Form
  const [patentRef, setPatentRef] = useState('US-DEMO-2005-001');
  const [priorityDate, setPriorityDate] = useState('2005-01-01');
  const [elem0, setElem0] = useState(
    'Combines a shared secret key with two distinct fixed repeated padding byte strings via bitwise XOR.'
  );
  const [elem1, setElem1] = useState(
    'Applies a nested two-pass cryptographic hash over the message and inner/outer keyed blocks.'
  );
  const [openDeposit, setOpenDeposit] = useState('50');
  const [openMinBond, setOpenMinBond] = useState('10');

  // Crowdfund Form
  const [fundChallengeId, setFundChallengeId] = useState('3');
  const [fundAmount, setFundAmount] = useState('25');

  // Submit Prior Art Form
  const [subChallengeId, setSubChallengeId] = useState('3');
  const [subTitle, setSubTitle] = useState('IETF RFC 2104: HMAC (Feb 1997)');
  const [subUrl, setSubUrl] = useState('https://www.rfc-editor.org/rfc/rfc2104.txt');
  const [subBond, setSubBond] = useState('20');

  // Map Element Form
  const [mapSubId, setMapSubId] = useState('3');
  const [mapElemIdx, setMapElemIdx] = useState('0');
  const [mapAnchor, setMapAnchor] = useState('partial hash-collisions');

  // Timeout / Pro-rata Form
  const [expireChallengeId, setExpireChallengeId] = useState('4');

  const refreshWalletBalances = async (addr: `0x${string}`) => {
    try {
      const [bal, contractBals] = await Promise.all([
        fetchNativeBalanceWei(addr),
        fetchAccountBalances(poolAddress, addr),
      ]);
      setNativeWei(bal);
      setClaimableWei(contractBals.claimable_wei);
      setRefundableWei(contractBals.refundable_wei);
    } catch {
      // Non-fatal
    }
  };

  useEffect(() => {
    if (account) {
      refreshWalletBalances(account);
    }
  }, [account, poolAddress]);

  const handleConnect = async () => {
    setErrorMsg('');
    setStatusMsg('');
    setBusy(true);
    try {
      const addr = await ensureStudioNetWalletNetwork();
      setAccount(addr);
      await refreshWalletBalances(addr);
      setStatusMsg(`Connected to GenLayer StudioNet (Chain 61999) as ${shortHash(addr)}`);
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleFaucet = async () => {
    if (!account) return;
    setBusy(true);
    setErrorMsg('');
    try {
      await fundStudioNetAccount(account);
      await refreshWalletBalances(account);
      setStatusMsg('Credited 1 GEN on GenLayer StudioNet via sim_fundAccount.');
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const execWrite = async (label: string, functionName: string, args: any[], valueWei: bigint = 0n) => {
    if (!account) {
      setErrorMsg('Connect a browser wallet first.');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    setStatusMsg(`Waiting for wallet signature (${functionName})...`);
    try {
      const client = getWalletClient(account);
      const txHash = await client.writeContract({
        address: poolAddress as `0x${string}`,
        functionName,
        args,
        value: valueWei,
      });
      setStatusMsg(`Broadcasted ${functionName}: ${shortHash(String(txHash))}`);
      onTxSubmitted(String(txHash), label, functionName);
      setTimeout(() => {
        refreshWalletBalances(account);
        onRefreshLive();
      }, 4000);
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const openChallenges = challenges.filter((c) => c.status === 'OPEN');

  return (
    <div className="space-y-6">
      {/* Wallet Connection & Testnet Faucet Bar */}
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-400" />
            Interactive StudioNet Wallet Flows (Human Popup Approval)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Test every lifecycle path end-to-end on GenLayer StudioNet (Chain ID 61999): fund, crowdfund, submit prior
            art, map claim elements, claim payouts, and withdraw refunds.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {account ? (
            <>
              <div className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs font-mono">
                <span className="text-slate-400">Wallet:</span>{' '}
                <span className="text-emerald-300">{shortHash(account)}</span>
                <span className="mx-2 text-slate-600">|</span>
                <span className="text-slate-300">{(Number(nativeWei) / 1e18).toFixed(4)} GEN</span>
              </div>
              <button
                onClick={handleFaucet}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40"
              >
                <Sparkles className="w-3.5 h-3.5" /> +1 Testnet GEN
              </button>
              <button
                onClick={() => refreshWalletBalances(account)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={handleConnect}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors"
            >
              <Wallet className="w-4 h-4" /> Connect Browser Wallet
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div className="rounded-xl bg-emerald-950/40 border border-emerald-500/35 px-4 py-3 text-xs font-mono text-emerald-200">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl bg-rose-950/40 border border-rose-500/35 px-4 py-3 text-xs font-mono text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Pull-Payment Claim & Refund Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase font-mono">Claimable Winner Payout</p>
            <p className="text-xl font-mono font-bold text-emerald-300 mt-1">{claimableWei} wei</p>
          </div>
          <button
            onClick={() => execWrite('Claim Anticipation Payout', 'claim_payout', [])}
            disabled={!account || busy || claimableWei === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-40 text-emerald-200 border border-emerald-500/40"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" /> Claim
          </button>
        </div>

        <div className="glass-panel rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase font-mono">Refundable Deposit Balance</p>
            <p className="text-xl font-mono font-bold text-sky-300 mt-1">{refundableWei} wei</p>
          </div>
          <button
            onClick={() => execWrite('Withdraw Refundable Balance', 'withdraw_refund', [])}
            disabled={!account || busy || refundableWei === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-40 text-sky-200 border border-sky-500/40"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" /> Withdraw
          </button>
        </div>

        <div className="glass-panel rounded-2xl p-4 space-y-2">
          <p className="text-xs text-slate-400 uppercase font-mono">Timeout / Pro-Rata Fallback</p>
          <div className="flex gap-2">
            <input
              type="number"
              value={expireChallengeId}
              onChange={(e) => setExpireChallengeId(e.target.value)}
              className="w-20 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
              placeholder="ID"
            />
            <button
              onClick={() =>
                execWrite(`Expire Challenge #${expireChallengeId}`, 'expire_challenge', [Number(expireChallengeId)])
              }
              disabled={!account || busy}
              className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-40 text-amber-200 border border-amber-500/35"
            >
              Expire
            </button>
            <button
              onClick={() =>
                execWrite(`Pro-Rata Refund #${expireChallengeId}`, 'claim_pro_rata_refund', [
                  Number(expireChallengeId),
                ])
              }
              disabled={!account || busy}
              className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 text-emerald-200 border border-emerald-500/35"
            >
              Claim Pro-Rata
            </button>
          </div>
        </div>
      </div>

      {/* Action Forms Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1. Open Challenge (Payable + RuleGate) */}
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" /> 1. Fund & Open Challenge (Triggers RuleGate)
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">Patent Reference</label>
              <input
                value={patentRef}
                onChange={(e) => setPatentRef(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">Priority Date (YYYY-MM-DD)</label>
              <input
                value={priorityDate}
                onChange={(e) => setPriorityDate(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs font-mono text-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">Claim Element E0</label>
            <textarea
              rows={2}
              value={elem0}
              onChange={(e) => setElem0(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">Claim Element E1</label>
            <textarea
              rows={2}
              value={elem1}
              onChange={(e) => setElem1(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">Initial Bounty (wei)</label>
              <input
                type="number"
                value={openDeposit}
                onChange={(e) => setOpenDeposit(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">Min Researcher Bond (wei)</label>
              <input
                type="number"
                value={openMinBond}
                onChange={(e) => setOpenMinBond(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs font-mono text-white"
              />
            </div>
          </div>
          <button
            onClick={() =>
              execWrite(
                `Open Challenge ${patentRef}`,
                'open_challenge',
                [patentRef, priorityDate, JSON.stringify([elem0, elem1]), 3600, 60, Number(openMinBond)],
                BigInt(openDeposit || '1')
              )
            }
            disabled={!account || busy}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950"
          >
            <Send className="w-3.5 h-3.5" /> Open Challenge ({openDeposit} wei)
          </button>
        </div>

        {/* 2. Crowdfund + Submit Prior Art + Map Element */}
        <div className="space-y-5">
          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" /> 2. Crowdfund an Open Challenge
            </h3>
            <p className="text-[11px] text-slate-400">
              Currently OPEN challenge IDs:{' '}
              {openChallenges.length > 0 ? openChallenges.map((c) => `#${c.id}`).join(', ') : 'None (open one first)'}
            </p>
            <div className="flex gap-2.5">
              <input
                type="number"
                value={fundChallengeId}
                onChange={(e) => setFundChallengeId(e.target.value)}
                className="w-24 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs font-mono text-white"
                placeholder="Ch ID"
              />
              <input
                type="number"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs font-mono text-white"
                placeholder="Amount (wei)"
              />
              <button
                onClick={() =>
                  execWrite(
                    `Crowdfund Challenge #${fundChallengeId} (+${fundAmount} wei)`,
                    'contribute_bounty',
                    [Number(fundChallengeId)],
                    BigInt(fundAmount || '1')
                  )
                }
                disabled={!account || busy}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950"
              >
                Contribute
              </button>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileSearch className="w-4 h-4 text-sky-400" /> 3. Submit Immutable Prior Art & Map Element
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                value={subChallengeId}
                onChange={(e) => setSubChallengeId(e.target.value)}
                className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs font-mono text-white"
                placeholder="Challenge ID"
              />
              <input
                value={subTitle}
                onChange={(e) => setSubTitle(e.target.value)}
                className="col-span-2 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs text-white"
                placeholder="Reference title"
              />
            </div>
            <div className="flex gap-2">
              <input
                value={subUrl}
                onChange={(e) => setSubUrl(e.target.value)}
                className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs font-mono text-white"
                placeholder="Immutable RFC / Wiki revid / Archive id_ / GitHub 40-hex URL"
              />
              <input
                type="number"
                value={subBond}
                onChange={(e) => setSubBond(e.target.value)}
                className="w-20 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs font-mono text-white"
                placeholder="Bond"
              />
              <button
                onClick={() =>
                  execWrite(
                    `Submit Prior Art on Ch #${subChallengeId}`,
                    'submit_prior_art',
                    [Number(subChallengeId), subTitle, subUrl],
                    BigInt(subBond || '20')
                  )
                }
                disabled={!account || busy}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950"
              >
                Submit
              </button>
            </div>

            <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-2">
              <input
                type="number"
                value={mapSubId}
                onChange={(e) => setMapSubId(e.target.value)}
                className="w-20 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                placeholder="Sub ID"
              />
              <input
                type="number"
                value={mapElemIdx}
                onChange={(e) => setMapElemIdx(e.target.value)}
                className="w-16 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                placeholder="E#"
              />
              <input
                value={mapAnchor}
                onChange={(e) => setMapAnchor(e.target.value)}
                className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                placeholder="Anchor phrase in document"
              />
              <button
                onClick={() =>
                  execWrite(`Map Sub #${mapSubId} E${mapElemIdx}`, 'map_claim_element', [
                    Number(mapSubId),
                    Number(mapElemIdx),
                    mapAnchor,
                  ])
                }
                disabled={!account || busy}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white"
              >
                Map Element ({submissions.length} total)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

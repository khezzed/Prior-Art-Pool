import React, { useEffect, useState } from 'react';
import { Wallet, Sparkles, RefreshCw, ArrowDownToLine } from 'lucide-react';
import type { ChallengeRecord, SubmissionRecord } from '../types';
import {
  ensureStudioNetWalletNetwork,
  fetchAccountBalances,
  fetchNativeBalanceWei,
  fundStudioNetAccount,
  getWalletClient,
  shortHash,
} from '../lib/studionet';
import { cn } from '../lib/utils';

export interface WalletWorkbenchProps {
  poolAddress: string;
  challenges: ChallengeRecord[];
  submissions: SubmissionRecord[];
  onTxSubmitted: (hash: string, label: string, method: string) => void;
  onRefreshLive: () => void;
  className?: string;
}

const INPUT_CLASS =
  'w-full rounded-md bg-surface border border-line-strong px-3 py-2 text-body text-ink-primary placeholder:text-ink-muted hover:border-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand disabled:opacity-50 disabled:cursor-not-allowed btn-transition';

const PRIMARY_BTN =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-compact font-semibold whitespace-nowrap bg-brand text-ink-onAccent hover:bg-brand-hover active:bg-brand-active active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none btn-transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand';

const SECONDARY_BTN =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-md text-compact font-medium whitespace-nowrap bg-surface border border-line-strong text-ink-primary hover:bg-subtle active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none btn-transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand';

export const WalletWorkbench: React.FC<WalletWorkbenchProps> = ({
  poolAddress,
  challenges,
  submissions,
  onTxSubmitted,
  onRefreshLive,
  className,
}) => {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [nativeWei, setNativeWei] = useState<string>('0');
  const [claimableWei, setClaimableWei] = useState<number>(0);
  const [refundableWei, setRefundableWei] = useState<number>(0);
  const [notice, setNotice] = useState<string>('');
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

  const refreshBalances = async (addr: `0x${string}`) => {
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
    if (account) refreshBalances(account);
  }, [account, poolAddress]);

  const handleConnect = async () => {
    setErrorMsg('');
    setNotice('');
    setBusy(true);
    try {
      const addr = await ensureStudioNetWalletNetwork();
      setAccount(addr);
      await refreshBalances(addr);
      setNotice(`Connected to GenLayer StudioNet (Chain 61999) as ${shortHash(addr, 8, 6)}.`);
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
      await refreshBalances(account);
      setNotice('Credited 1 testnet GEN on StudioNet via sim_fundAccount.');
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const execWrite = async (label: string, functionName: string, args: unknown[], valueWei: bigint = 0n) => {
    if (!account) {
      setErrorMsg('Connect your browser wallet first to sign StudioNet transactions.');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    setNotice(`Awaiting wallet confirmation for ${functionName}...`);
    try {
      const client = getWalletClient(account);
      const txHash = await client.writeContract({
        address: poolAddress as `0x${string}`,
        functionName,
        args: args as any[],
        value: valueWei,
      });
      setNotice(`Broadcast ${functionName} (${shortHash(String(txHash), 10, 6)}). Tracking finality below.`);
      onTxSubmitted(String(txHash), label, functionName);
      setTimeout(() => {
        refreshBalances(account);
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
    <div className={cn('bg-surface border border-line-subtle rounded-lg shadow-sheet p-5 sm:p-8 space-y-8', className)}>
      {/* Header & Wallet Connection Bar */}
      <header className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-line-subtle">
        <div className="space-y-1">
          <h1 className="font-serif text-dossier font-semibold text-ink-primary">
            StudioNet wallet workbench
          </h1>
          <p className="text-body text-ink-secondary max-w-prose">
            Sign live transactions on GenLayer StudioNet (Chain ID 61999) to open patent challenges, crowdfund open
            bounties, file immutable prior art, map claim elements, and claim finalized payouts or refunds.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {account ? (
            <>
              <div className="rounded-md bg-subtle border border-line-subtle px-3 py-2 text-compact tabular">
                <span className="font-code text-ink-primary font-medium">{shortHash(account, 8, 5)}</span>
                <span className="mx-2 text-line-strong">|</span>
                <span className="text-ink-secondary font-medium">
                  {(Number(nativeWei) / 1e18).toFixed(4)} GEN
                </span>
              </div>
              <button type="button" onClick={handleFaucet} disabled={busy} className={SECONDARY_BTN}>
                <Sparkles className="w-3.5 h-3.5 text-brand" /> Request 1 testnet GEN
              </button>
              <button
                type="button"
                onClick={() => refreshBalances(account)}
                disabled={busy}
                aria-label="Refresh wallet balances"
                className={SECONDARY_BTN}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button type="button" onClick={handleConnect} disabled={busy} className={PRIMARY_BTN}>
              <Wallet className="w-4 h-4" /> Connect browser wallet
            </button>
          )}
        </div>
      </header>

      {notice && (
        <div role="status" className="rounded-md bg-pass-bg border border-pass-border px-4 py-3 text-compact text-pass-ink">
          {notice}
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="rounded-md bg-fail-bg border border-fail-border px-4 py-3 text-compact text-fail-ink">
          {errorMsg}
        </div>
      )}

      {/* Pull-Payment Claim & Refund Row (Hairline-divided, zero nested cards) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-line-subtle">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-compact text-ink-muted">Claimable anticipation payout</p>
            <p className="text-heading font-semibold text-ink-primary tabular mt-0.5">{claimableWei} wei</p>
          </div>
          <button
            type="button"
            onClick={() => execWrite('Claim anticipation payout', 'claim_payout', [])}
            disabled={!account || busy || claimableWei === 0}
            className={SECONDARY_BTN}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" /> Claim
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 md:border-l md:border-line-subtle md:pl-6">
          <div>
            <p className="text-compact text-ink-muted">Refundable deposit balance</p>
            <p className="text-heading font-semibold text-ink-primary tabular mt-0.5">{refundableWei} wei</p>
          </div>
          <button
            type="button"
            onClick={() => execWrite('Withdraw refundable balance', 'withdraw_refund', [])}
            disabled={!account || busy || refundableWei === 0}
            className={SECONDARY_BTN}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" /> Withdraw
          </button>
        </div>

        <div className="space-y-2 md:border-l md:border-line-subtle md:pl-6">
          <label htmlFor="expire-id" className="block text-compact text-ink-muted">
            Expired challenge fallback
          </label>
          <div className="flex items-center gap-2">
            <input
              id="expire-id"
              type="number"
              value={expireChallengeId}
              onChange={(e) => setExpireChallengeId(e.target.value)}
              className={cn(INPUT_CLASS, 'w-20 py-1.5 text-compact tabular')}
              aria-label="Challenge ID for timeout fallback"
            />
            <button
              type="button"
              onClick={() =>
                execWrite(`Expire challenge #${expireChallengeId}`, 'expire_challenge', [Number(expireChallengeId)])
              }
              disabled={!account || busy}
              className={SECONDARY_BTN}
            >
              Expire
            </button>
            <button
              type="button"
              onClick={() =>
                execWrite(`Claim pro-rata refund #${expireChallengeId}`, 'claim_pro_rata_refund', [
                  Number(expireChallengeId),
                ])
              }
              disabled={!account || busy}
              className={SECONDARY_BTN}
            >
              Pro-rata
            </button>
          </div>
        </div>
      </section>

      {/* Main Two-Column Operational Forms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Left Column: Open Challenge */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-heading font-semibold text-ink-primary">Open a patent challenge</h2>
            <p className="text-compact text-ink-muted">
              Triggers up-front RuleGate consensus. Subjective claims are rejected and deposits credited back safely.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label htmlFor="patent-ref" className="block text-compact font-medium text-ink-secondary">
                Patent reference
              </label>
              <input
                id="patent-ref"
                value={patentRef}
                onChange={(e) => setPatentRef(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="priority-date" className="block text-compact font-medium text-ink-secondary">
                Priority date (YYYY-MM-DD)
              </label>
              <input
                id="priority-date"
                value={priorityDate}
                onChange={(e) => setPriorityDate(e.target.value)}
                className={cn(INPUT_CLASS, 'tabular')}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="claim-elem-0" className="block text-compact font-medium text-ink-secondary">
              Claim element 0
            </label>
            <textarea
              id="claim-elem-0"
              rows={2}
              value={elem0}
              onChange={(e) => setElem0(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="claim-elem-1" className="block text-compact font-medium text-ink-secondary">
              Claim element 1
            </label>
            <textarea
              id="claim-elem-1"
              rows={2}
              value={elem1}
              onChange={(e) => setElem1(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label htmlFor="open-deposit" className="block text-compact font-medium text-ink-secondary">
                Initial bounty (wei)
              </label>
              <input
                id="open-deposit"
                type="number"
                value={openDeposit}
                onChange={(e) => setOpenDeposit(e.target.value)}
                className={cn(INPUT_CLASS, 'tabular')}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="open-bond" className="block text-compact font-medium text-ink-secondary">
                Minimum bond (wei)
              </label>
              <input
                id="open-bond"
                type="number"
                value={openMinBond}
                onChange={(e) => setOpenMinBond(e.target.value)}
                className={cn(INPUT_CLASS, 'tabular')}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              execWrite(
                `Open challenge ${patentRef}`,
                'open_challenge',
                [patentRef, priorityDate, JSON.stringify([elem0, elem1]), 3600, 60, Number(openMinBond)],
                BigInt(openDeposit || '1')
              )
            }
            disabled={!account || busy}
            className={PRIMARY_BTN}
          >
            Open challenge ({openDeposit} wei)
          </button>
        </section>

        {/* Right Column: Crowdfund + Prior Art Submission + Element Mapping */}
        <div className="space-y-8 lg:border-l lg:border-line-subtle lg:pl-10">
          {/* Crowdfund */}
          <section className="space-y-3 pb-6 border-b border-line-subtle">
            <div className="space-y-1">
              <h2 className="text-heading font-semibold text-ink-primary">Crowdfund an open pool</h2>
              <p className="text-compact text-ink-muted">
                Open challenges:{' '}
                {openChallenges.length > 0
                  ? openChallenges.map((c) => `#${c.id} (${c.patent_ref})`).join(', ')
                  : 'None currently open'}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2.5">
              <div className="w-24 space-y-1">
                <label htmlFor="fund-id" className="block text-compact font-medium text-ink-secondary">
                  Challenge
                </label>
                <input
                  id="fund-id"
                  type="number"
                  value={fundChallengeId}
                  onChange={(e) => setFundChallengeId(e.target.value)}
                  className={cn(INPUT_CLASS, 'tabular')}
                />
              </div>
              <div className="flex-1 min-w-32 space-y-1">
                <label htmlFor="fund-amt" className="block text-compact font-medium text-ink-secondary">
                  Contribution (wei)
                </label>
                <input
                  id="fund-amt"
                  type="number"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  className={cn(INPUT_CLASS, 'tabular')}
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  execWrite(
                    `Contribute ${fundAmount} wei to challenge #${fundChallengeId}`,
                    'contribute_bounty',
                    [Number(fundChallengeId)],
                    BigInt(fundAmount || '1')
                  )
                }
                disabled={!account || busy}
                className={SECONDARY_BTN}
              >
                Contribute
              </button>
            </div>
          </section>

          {/* Submit Prior Art */}
          <section className="space-y-3 pb-6 border-b border-line-subtle">
            <div className="space-y-1">
              <h2 className="text-heading font-semibold text-ink-primary">Submit immutable prior art</h2>
              <p className="text-compact text-ink-muted">
                Accepts IETF RFCs, Wikipedia permanent revid APIs, Archive.org id_ captures, and 40-hex GitHub commits.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="space-y-1">
                <label htmlFor="sub-cid" className="block text-compact font-medium text-ink-secondary">
                  Challenge ID
                </label>
                <input
                  id="sub-cid"
                  type="number"
                  value={subChallengeId}
                  onChange={(e) => setSubChallengeId(e.target.value)}
                  className={cn(INPUT_CLASS, 'tabular')}
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label htmlFor="sub-title" className="block text-compact font-medium text-ink-secondary">
                  Publication title
                </label>
                <input
                  id="sub-title"
                  value={subTitle}
                  onChange={(e) => setSubTitle(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="sub-url" className="block text-compact font-medium text-ink-secondary">
                Immutable archive URL
              </label>
              <input
                id="sub-url"
                value={subUrl}
                onChange={(e) => setSubUrl(e.target.value)}
                className={cn(INPUT_CLASS, 'font-code text-compact')}
              />
            </div>
            <div className="flex flex-wrap items-end gap-2.5">
              <div className="w-32 space-y-1">
                <label htmlFor="sub-bond" className="block text-compact font-medium text-ink-secondary">
                  Bond (wei)
                </label>
                <input
                  id="sub-bond"
                  type="number"
                  value={subBond}
                  onChange={(e) => setSubBond(e.target.value)}
                  className={cn(INPUT_CLASS, 'tabular')}
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  execWrite(
                    `Submit prior art on challenge #${subChallengeId}`,
                    'submit_prior_art',
                    [Number(subChallengeId), subTitle, subUrl],
                    BigInt(subBond || '20')
                  )
                }
                disabled={!account || busy}
                className={SECONDARY_BTN}
              >
                Submit filing
              </button>
            </div>
          </section>

          {/* Map Element */}
          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-heading font-semibold text-ink-primary">Map single claim element</h2>
              <p className="text-compact text-ink-muted tabular">
                Dispatches one narrow validator judgment ({submissions.length} submissions currently indexed).
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2.5">
              <div className="w-24 space-y-1">
                <label htmlFor="map-sub" className="block text-compact font-medium text-ink-secondary">
                  Submission
                </label>
                <input
                  id="map-sub"
                  type="number"
                  value={mapSubId}
                  onChange={(e) => setMapSubId(e.target.value)}
                  className={cn(INPUT_CLASS, 'tabular')}
                />
              </div>
              <div className="w-24 space-y-1">
                <label htmlFor="map-el" className="block text-compact font-medium text-ink-secondary">
                  Element #
                </label>
                <input
                  id="map-el"
                  type="number"
                  value={mapElemIdx}
                  onChange={(e) => setMapElemIdx(e.target.value)}
                  className={cn(INPUT_CLASS, 'tabular')}
                />
              </div>
              <div className="flex-1 min-w-40 space-y-1">
                <label htmlFor="map-anchor" className="block text-compact font-medium text-ink-secondary">
                  Excerpt anchor phrase
                </label>
                <input
                  id="map-anchor"
                  value={mapAnchor}
                  onChange={(e) => setMapAnchor(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  execWrite(`Map submission #${mapSubId} element ${mapElemIdx}`, 'map_claim_element', [
                    Number(mapSubId),
                    Number(mapElemIdx),
                    mapAnchor,
                  ])
                }
                disabled={!account || busy}
                className={PRIMARY_BTN}
              >
                Judge element
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

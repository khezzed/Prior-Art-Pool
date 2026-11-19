import { createClient, chains } from 'genlayer-js';
import type { AccountingSummary, ChallengeRecord, SubmissionRecord, TxLifecycleState } from '../types';

export const STUDIONET_RPC = 'https://studio.genlayer.com/api';
export const STUDIONET_EXPLORER = 'https://explorer-studio.genlayer.com';
export const STUDIONET_CHAIN_ID = 61999;
export const STUDIONET_CHAIN_HEX = '0xf22f';

export function getReadClient() {
  return createClient({
    chain: {
      ...chains.studionet,
      rpcUrls: { default: { http: [STUDIONET_RPC] } },
    },
  });
}

export function getWalletClient(account: `0x${string}`) {
  return createClient({
    chain: {
      ...chains.studionet,
      rpcUrls: { default: { http: [STUDIONET_RPC] } },
    },
    account,
  });
}

export async function rpcCall(method: string, params: unknown[]) {
  const res = await fetch(STUDIONET_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result;
}

export async function fetchNativeBalanceWei(address: string): Promise<string> {
  const hex = await rpcCall('eth_getBalance', [address, 'latest']);
  return BigInt(hex || '0x0').toString();
}

export async function fundStudioNetAccount(address: string): Promise<string> {
  return await rpcCall('sim_fundAccount', [address, 1000000000000000000]);
}

export async function fetchLiveProtocolSnapshot(poolAddress: string) {
  const client = getReadClient();
  const addr = poolAddress as `0x${string}`;

  const [cfgRaw, accRaw, nativeBal] = await Promise.all([
    client.readContract({ address: addr, functionName: 'get_protocol_config', args: [] }),
    client.readContract({ address: addr, functionName: 'get_accounting_summary', args: [] }),
    fetchNativeBalanceWei(poolAddress),
  ]);

  const config = JSON.parse(String(cfgRaw));
  const accounting: AccountingSummary = JSON.parse(String(accRaw));
  const count = Number(config.challenge_count || 0);
  const subCount = Number(config.submission_count || 0);

  const challenges: ChallengeRecord[] = [];
  for (let i = 1; i <= count; i++) {
    const raw = await client.readContract({ address: addr, functionName: 'get_challenge', args: [i] });
    const parsed = JSON.parse(String(raw));
    if (parsed?.id) challenges.push(parsed);
  }

  const submissions: SubmissionRecord[] = [];
  for (let i = 1; i <= subCount; i++) {
    const raw = await client.readContract({ address: addr, functionName: 'get_submission', args: [i] });
    const parsed = JSON.parse(String(raw));
    if (parsed?.id) submissions.push(parsed);
  }

  return {
    config,
    accounting,
    nativeBalanceWei: nativeBal,
    challenges,
    submissions,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchAccountBalances(poolAddress: string, userAddress: string) {
  const client = getReadClient();
  const raw = await client.readContract({
    address: poolAddress as `0x${string}`,
    functionName: 'get_account_balances',
    args: [userAddress],
  });
  return JSON.parse(String(raw)) as { account: string; claimable_wei: number; refundable_wei: number };
}

export async function inspectTxState(txHash: string): Promise<{
  state: TxLifecycleState;
  consensusResult: string;
  returnReadable: string;
  errorDetail: string;
  childTxHashes: string[];
}> {
  const client = getReadClient();
  const tx: any = await client.getTransaction({ hash: txHash as any });
  const changes: string[] = tx?.consensus_history?.current_status_changes || [];
  const rawStatus: string =
    tx?.statusName || tx?.status_name || (changes.length ? changes[changes.length - 1] : 'PENDING');
  const consensusResult: string = tx?.result_name || tx?.resultName || 'PENDING';
  const lr = tx?.consensus_data?.leader_receipt?.[0];
  const execResult: string = lr?.execution_result || 'PENDING';
  const returnVal = lr?.result?.payload?.readable ?? lr?.result?.payload ?? '';
  const returnReadable = typeof returnVal === 'object' ? JSON.stringify(returnVal) : String(returnVal || '');
  const errorDetail = lr?.genvm_result?.stderr || '';
  const childTxHashes: string[] = Array.isArray(tx?.triggered_transactions) ? tx.triggered_transactions : [];

  const isEoaTransferQuirk =
    lr?.node_config?.address === 'contract_not_found_handler' ||
    tx?.last_leader === 'contract_not_found_handler';

  let state: TxLifecycleState = 'pending';
  if (rawStatus === 'FINALIZED') {
    state = execResult === 'ERROR' && !isEoaTransferQuirk ? 'finalized-error' : 'finalized-success';
  } else if (rawStatus === 'UNDETERMINED' || rawStatus === 'CANCELED') {
    state = 'finalized-error';
  } else if (rawStatus === 'ACCEPTED') {
    state = 'accepted';
  } else {
    state = 'pending';
  }

  return { state, consensusResult, returnReadable, errorDetail, childTxHashes };
}

export async function ensureStudioNetWalletNetwork() {
  const eth = (window as any).ethereum;
  if (!eth) {
    throw new Error('No injected EVM wallet found (install MetaMask or Rabby to test wallet flows).');
  }
  const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: STUDIONET_CHAIN_HEX }],
    });
  } catch (err: any) {
    if (err?.code === 4902 || String(err?.message || '').includes('Unrecognized chain')) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: STUDIONET_CHAIN_HEX,
            chainName: 'GenLayer StudioNet',
            nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
            rpcUrls: [STUDIONET_RPC],
            blockExplorerUrls: [STUDIONET_EXPLORER],
          },
        ],
      });
    } else {
      throw err;
    }
  }
  return accounts[0] as `0x${string}`;
}

export function shortHash(h: string, head = 10, tail = 6) {
  if (!h || h.length <= head + tail + 2) return h;
  return `${h.slice(0, head)}...${h.slice(-tail)}`;
}

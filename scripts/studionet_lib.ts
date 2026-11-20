import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, chains, createAccount, generatePrivateKey } from 'genlayer-js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const origFetch = globalThis.fetch;
globalThis.fetch = (url: any, init: any = {}) => {
  const headers = new Headers(init?.headers || {});
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', BROWSER_UA);
  }
  return origFetch(url, { ...init, headers });
};

export const STUDIONET_RPC = 'https://studio.genlayer.com/api';
export const STUDIONET_EXPLORER = 'https://explorer-studio.genlayer.com';
export const STUDIONET_CHAIN_ID = 61999;

const STATE_FILE = path.resolve('deployments/state_v2.json');

export function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function loadState(): Record<string, any> {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  // Seed probeAddress and actor keys from v1 state if available so we keep our already-probed EvidenceProbe
  const v1Path = path.resolve('deployments/state.json');
  if (fs.existsSync(v1Path)) {
    try {
      const v1 = JSON.parse(fs.readFileSync(v1Path, 'utf-8'));
      return {
        probeAddress: v1.probeAddress,
        probeDeployTx: v1.probeDeployTx,
        probeSourceSha256: v1.probeSourceSha256,
        actors: v1.actors || {},
      };
    } catch {
      return {};
    }
  }
  return {};
}

export function saveState(patch: Record<string, any>): Record<string, any> {
  const current = loadState();
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

export function getOrCreateActor(role: string) {
  const state = loadState();
  const actors = state.actors || {};
  let pk: string = actors[role]?.privateKey;
  if (!pk || typeof pk !== 'string' || pk.length !== 66) {
    pk = generatePrivateKey();
    const acc = createAccount(pk as `0x${string}`);
    actors[role] = { privateKey: pk, address: acc.address };
    saveState({ actors });
  }
  const account = createAccount(pk as `0x${string}`);
  const client = createClient({
    chain: {
      ...chains.studionet,
      rpcUrls: { default: { http: [STUDIONET_RPC] } },
    },
    account,
  });
  return { client, account, privateKey: pk };
}

export async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function rpcJson(method: string, params: unknown[]) {
  const res = await fetch(STUDIONET_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const data: any = await res.json();
  if (data.error) throw new Error(`RPC ${method} error: ${data.error.message || JSON.stringify(data.error)}`);
  return data.result;
}

export async function getBalanceWei(address: string): Promise<bigint> {
  const hex = await rpcJson('eth_getBalance', [address, 'latest']);
  return BigInt(hex || '0x0');
}

export async function getOnChainContractSource(address: string): Promise<string> {
  const b64 = await rpcJson('gen_getContractCode', [address]);
  if (!b64 || typeof b64 !== 'string') {
    throw new Error(`gen_getContractCode returned empty result for ${address}`);
  }
  return Buffer.from(b64, 'base64').toString('utf-8');
}

export async function ensureFunded(address: string, minWei: bigint = 1000000n): Promise<bigint> {
  const bal = await getBalanceWei(address);
  if (bal >= minWei) return bal;
  console.log(`  [FUNDER] Funding StudioNet test account ${address} via sim_fundAccount...`);
  await rpcJson('sim_fundAccount', [address, 1000000000000000000]);
  await sleep(2000);
  return await getBalanceWei(address);
}

export async function callWithRetry<T>(fn: () => Promise<T>, retries = 6, baseDelayMs = 4000): Promise<T> {
  let lastErr: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      console.warn(`  [Retry ${attempt}/${retries}] ${String(err?.message || err).slice(0, 180)}`);
      await sleep(baseDelayMs * attempt);
    }
  }
  throw lastErr;
}

export interface FinalizedReceipt {
  txHash: string;
  statusName: string;
  resultName: string;
  executionResult: string;
  returnReadable: any;
  contractAddress?: string;
  triggeredTransactions: string[];
  statusTransitions: string[];
  appealed: boolean;
  appealWindowTimestamp: number | null;
  rawTx: any;
  stderr?: string;
}

/**
 * Polls a StudioNet transaction every 9 seconds until FINALIZED (never stops early at ACCEPTED).
 * Cleanly recognizes Type-0 native EthSend transfers (which have no GenVM leader_receipt).
 */
export async function waitForFinalized(
  client: any,
  txHash: string,
  options: { maxAttempts?: number; pollMs?: number; allowError?: boolean; isNativeEthTransfer?: boolean } = {}
): Promise<FinalizedReceipt> {
  const maxAttempts = options.maxAttempts ?? 80;
  const pollMs = options.pollMs ?? 9000;
  const allowError = options.allowError ?? false;
  const isNativeEthTransfer = options.isNativeEthTransfer ?? false;

  console.log(`  [POLL] Waiting for FINALIZED: ${txHash} (every ${pollMs / 1000}s)`);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleep(pollMs);
    try {
      const tx = await client.getTransaction({ hash: txHash });
      const historyChanges: string[] = tx?.consensus_history?.current_status_changes || [];
      const statusName: string =
        tx?.statusName ||
        tx?.status_name ||
        (historyChanges.includes('FINALIZED') ? 'FINALIZED' : historyChanges[historyChanges.length - 1] || 'PENDING');
      const resultName: string = tx?.result_name || tx?.resultName || 'UNKNOWN';
      const lr = tx?.consensus_data?.leader_receipt?.[0];
      const isNativeType0 = isNativeEthTransfer && !lr && Number(tx?.value || 0) > 0;
      const execResult: string = isNativeType0 ? 'NATIVE_TRANSFER_OK' : lr?.execution_result || 'PENDING';
      const returnPayload = lr?.result?.payload?.readable ?? lr?.result?.payload ?? '';
      const triggered: string[] = Array.isArray(tx?.triggered_transactions) ? tx.triggered_transactions : [];
      const stderr: string = lr?.genvm_result?.stderr || '';
      const appealed: boolean = Boolean(tx?.appealed);
      const appealTs: number | null = tx?.timestamp_awaiting_finalization
        ? Number(tx.timestamp_awaiting_finalization)
        : null;

      console.log(
        `    [${attempt}/${maxAttempts}] status=${statusName} consensus=${resultName} exec=${execResult} appealed=${appealed} children=${triggered.length}`
      );

      if (statusName === 'FINALIZED' || statusName === 'UNDETERMINED' || statusName === 'CANCELED') {
        const contractAddress = tx?.to_address || tx?.contract_address || tx?.data?.contract_address;
        if ((execResult === 'ERROR' || statusName !== 'FINALIZED') && !allowError) {
          throw new Error(
            `Tx ${txHash} ended with status=${statusName} exec=${execResult} consensus=${resultName}: ${stderr || JSON.stringify(returnPayload)}`
          );
        }
        return {
          txHash,
          statusName,
          resultName,
          executionResult: execResult,
          returnReadable: returnPayload,
          contractAddress,
          triggeredTransactions: triggered,
          statusTransitions: historyChanges.length ? historyChanges : ['PENDING', 'ACCEPTED', statusName],
          appealed,
          appealWindowTimestamp: appealTs,
          rawTx: tx,
          stderr,
        };
      }
    } catch (err: any) {
      if (err?.message?.includes('ended with status=')) {
        throw err;
      }
      console.warn(`    [Poll warning ${attempt}]: ${String(err?.message || err).slice(0, 160)}`);
    }
  }
  throw new Error(`Tx ${txHash} did not reach FINALIZED within ${(maxAttempts * pollMs) / 1000}s`);
}

export async function waitForFinalizedTree(
  client: any,
  txHash: string,
  options: { maxAttempts?: number; pollMs?: number; allowError?: boolean; isNativeEthTransfer?: boolean } = {}
): Promise<{ parent: FinalizedReceipt; children: FinalizedReceipt[] }> {
  const parent = await waitForFinalized(client, txHash, {
    maxAttempts: options.maxAttempts,
    pollMs: options.pollMs,
    allowError: options.allowError,
  });
  const children: FinalizedReceipt[] = [];
  const queue = [...parent.triggeredTransactions];
  const seen = new Set<string>([txHash.toLowerCase()]);

  while (queue.length > 0) {
    const childHash = queue.shift()!;
    if (!childHash || seen.has(childHash.toLowerCase())) continue;
    seen.add(childHash.toLowerCase());
    console.log(`  [CALLBACK] Following emitted finality child tx: ${childHash}`);
    const childReceipt = await waitForFinalized(client, childHash, options);
    children.push(childReceipt);
    for (const grand of childReceipt.triggeredTransactions) {
      if (grand && !seen.has(grand.toLowerCase())) {
        queue.push(grand);
      }
    }
  }
  return { parent, children };
}

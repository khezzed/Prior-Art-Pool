import fs from 'node:fs';
import path from 'node:path';
import { createClient, chains } from 'genlayer-js';
import { sha256, STUDIONET_RPC, getBalanceWei, getOnChainContractSource } from './studionet_lib.ts';

async function main() {
  console.log('===============================================================');
  console.log('   PriorArtPool v2 Read-Only StudioNet Proof Verifier');
  console.log('===============================================================');

  const proofPath = path.resolve('deploy/proof.json');
  if (!fs.existsSync(proofPath)) {
    throw new Error('deploy/proof.json not found');
  }
  const proof = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));

  const client = createClient({
    chain: {
      ...chains.studionet,
      rpcUrls: { default: { http: [STUDIONET_RPC] } },
    },
  });

  let failures = 0;

  // 1. Verify LIVE ON-CHAIN contract source (gen_getContractCode) == local repo file == proof.json!
  console.log('\n[1/4] Verifying live ON-CHAIN contract source (gen_getContractCode) matches local repo byte-for-byte...');
  for (const [name, meta] of Object.entries<any>(proof.contracts)) {
    const localCode = fs.readFileSync(path.resolve(meta.sourcePath), 'utf-8');
    const localSha = sha256(localCode);
    const onChainCode = await getOnChainContractSource(meta.address);
    const onChainSha = sha256(onChainCode);
    const match = localSha === meta.sourceSha256 && onChainSha === localSha;
    console.log(
      `  ${match ? '✓' : '✗'} ${name} (${meta.address}): local==onChain==manifest (${onChainSha.slice(0, 16)}...) match=${match}`
    );
    if (!match) failures++;
  }

  // 2. Verify live on-chain protocol config & accounting conservation invariant
  console.log('\n[2/4] Verifying live on-chain PriorArtPool state & conservation invariant...');
  const poolAddr = proof.contracts.priorArtPool.address as `0x${string}`;
  const judgeAddr = proof.contracts.priorArtJudge.address as `0x${string}`;

  const cfgRaw = await client.readContract({
    address: poolAddr,
    functionName: 'get_protocol_config',
    args: [],
  });
  const cfg = JSON.parse(String(cfgRaw));
  const judgeMatch = cfg.judge_address?.toLowerCase() === judgeAddr.toLowerCase();
  console.log(
    `  ${judgeMatch ? '✓' : '✗'} Protocol config: judge=${cfg.judge_address} challenges=${cfg.challenge_count} submissions=${cfg.submission_count}`
  );
  if (!judgeMatch) failures++;

  const accRaw = await client.readContract({
    address: poolAddr,
    functionName: 'get_accounting_summary',
    args: [],
  });
  const acc = JSON.parse(String(accRaw));
  const liveBal = await getBalanceWei(poolAddr);
  const invOk = acc.invariant_holds === true && BigInt(acc.net_liabilities) === liveBal;
  console.log(
    `  ${invOk ? '✓' : '✗'} Conservation invariant: holds=${acc.invariant_holds} net_liabilities=${acc.net_liabilities} live_contract_balance=${liveBal.toString()} wei`
  );
  if (!invOk) failures++;

  // 3. Verify all challenges & submissions match recorded finalized outcomes
  console.log('\n[3/4] Verifying live on-chain challenges & submissions match deploy/proof.json...');
  for (const ch of proof.challenges) {
    const liveRaw = await client.readContract({
      address: poolAddr,
      functionName: 'get_challenge',
      args: [ch.id],
    });
    const live = JSON.parse(String(liveRaw));
    const ok = live.status === ch.status && live.rules_digest === ch.rules_digest;
    console.log(
      `  ${ok ? '✓' : '✗'} Challenge #${ch.id} (${live.patent_ref}): status=${live.status} winner=${live.winner || 'none'}`
    );
    if (!ok) failures++;
  }

  for (const sub of proof.submissions) {
    const liveRaw = await client.readContract({
      address: poolAddr,
      functionName: 'get_submission',
      args: [sub.id],
    });
    const live = JSON.parse(String(liveRaw));
    const ok = live.status === sub.status && live.reference_url === sub.reference_url;
    console.log(
      `  ${ok ? '✓' : '✗'} Submission #${sub.id} (Ch #${live.challenge_id}): status=${live.status}`
    );
    if (!ok) failures++;
  }

  // 4. Verify all recorded deploy, demo, callback, and EthSend native transfer txs are FINALIZED on StudioNet
  console.log('\n[4/4] Rechecking transaction finality & native transfer receipts on StudioNet RPC...');
  const txChecks: Array<{ label: string; hash: string; isNativeTransferChild?: boolean }> = [
    { label: 'deploy:EvidenceProbe', hash: proof.contracts.evidenceProbe.deployTx },
    { label: 'deploy:PriorArtPool', hash: proof.contracts.priorArtPool.deployTx },
    { label: 'deploy:PriorArtJudge', hash: proof.contracts.priorArtJudge.deployTx },
    { label: 'wire:set_judge', hash: proof.contracts.priorArtPool.wireTx },
  ];
  for (const step of proof.steps) {
    txChecks.push({ label: step.stepId, hash: step.txHash });
    const isTransferMethod =
      step.method === 'withdraw_refund' ||
      step.method === 'claim_payout' ||
      step.method === 'claim_pro_rata_refund';
    for (let i = 0; i < (step.childTxHashes || []).length; i++) {
      txChecks.push({
        label: `${step.stepId}:cb${i + 1}`,
        hash: step.childTxHashes[i],
        isNativeTransferChild: isTransferMethod,
      });
    }
  }

  for (const item of txChecks) {
    if (!item.hash) continue;
    const tx: any = await client.getTransaction({ hash: item.hash as `0x${string}` });
    const history: string[] = tx?.consensus_history?.current_status_changes || [];
    const statusName = tx?.statusName || tx?.status_name || (history.includes('FINALIZED') ? 'FINALIZED' : 'UNKNOWN');
    const lr = tx?.consensus_data?.leader_receipt?.[0];
    const isNativeType0 = item.isNativeTransferChild && !lr && Number(tx?.value || 0) > 0;
    const exec = isNativeType0 ? 'NATIVE_TRANSFER_OK' : lr?.execution_result || 'UNKNOWN';
    const ok = statusName === 'FINALIZED' && (exec === 'SUCCESS' || isNativeType0);
    console.log(
      `  ${ok ? '✓' : '✗'} ${item.label.padEnd(28)} ${item.hash.slice(0, 14)}... status=${statusName} exec=${exec} appealed=${Boolean(tx?.appealed)}`
    );
    if (!ok) failures++;
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log('\n===============================================================');
  if (failures === 0) {
    console.log(
      `✓ ALL PROOF CHECKS PASSED (on-chain source == local source + ${txChecks.length} finalized StudioNet txs + 0 errors!)`
    );
  } else {
    console.error(`✗ PROOF VERIFICATION FAILED with ${failures} issue(s)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('verify:proof failed:', err);
  process.exit(1);
});

import fs from 'node:fs';
import path from 'node:path';
import {
  getOrCreateActor,
  loadState,
  saveState,
  callWithRetry,
  waitForFinalized,
  getOnChainContractSource,
  sleep,
  sha256,
  STUDIONET_EXPLORER,
} from './studionet_lib.ts';

async function main() {
  console.log('===============================================================');
  console.log('   Step 4a (v2 Hardened): Deploying PriorArtPool + PriorArtJudge');
  console.log('===============================================================');

  const { client: deployer, account } = getOrCreateActor('deployer');
  console.log(`Deployer / Owner: ${account.address}`);

  const poolCode = fs.readFileSync(path.resolve('contracts/prior_art_pool.py'), 'utf-8');
  const judgeCode = fs.readFileSync(path.resolve('contracts/prior_art_judge.py'), 'utf-8');
  const poolSha = sha256(poolCode);
  const judgeSha = sha256(judgeCode);

  console.log(`PriorArtPool  SHA-256: ${poolSha} (${poolCode.length} bytes)`);
  console.log(`PriorArtJudge SHA-256: ${judgeSha} (${judgeCode.length} bytes)`);

  let state = loadState();

  // 1. Deploy v2 PriorArtPool (judge="", vetting_timeout=900, element_timeout=600)
  let poolAddr: string | undefined = state.poolAddress;
  if (!poolAddr) {
    let txHash: string | undefined = state.poolDeployTx;
    if (!txHash) {
      console.log('\n[1/3] Deploying PriorArtPool v2...');
      txHash = await callWithRetry(() =>
        deployer.deployContract({
          code: poolCode,
          args: ['', 900, 600],
        })
      );
      saveState({ poolDeployTx: txHash, poolSourceSha256: poolSha });
      console.log(`  Submitted: ${txHash}`);
    }
    const receipt = await waitForFinalized(deployer, txHash!);
    poolAddr = receipt.contractAddress;
    if (!poolAddr) throw new Error('PriorArtPool deployment returned no contractAddress');
    saveState({ poolAddress: poolAddr });
    console.log(`  PriorArtPool v2 FINALIZED at: ${poolAddr}`);
    console.log(`  Explorer: ${STUDIONET_EXPLORER}/address/${poolAddr}`);
    await sleep(5000);
  } else {
    console.log(`Reusing PriorArtPool v2 at: ${poolAddr}`);
  }

  // 2. Deploy v2 PriorArtJudge permanently wired to PriorArtPool
  state = loadState();
  let judgeAddr: string | undefined = state.judgeAddress;
  if (!judgeAddr) {
    let txHash: string | undefined = state.judgeDeployTx;
    if (!txHash) {
      console.log('\n[2/3] Deploying PriorArtJudge v2 (locked to PriorArtPool)...');
      txHash = await callWithRetry(() =>
        deployer.deployContract({
          code: judgeCode,
          args: [poolAddr],
        })
      );
      saveState({ judgeDeployTx: txHash, judgeSourceSha256: judgeSha });
      console.log(`  Submitted: ${txHash}`);
    }
    const receipt = await waitForFinalized(deployer, txHash!);
    judgeAddr = receipt.contractAddress;
    if (!judgeAddr) throw new Error('PriorArtJudge deployment returned no contractAddress');
    saveState({ judgeAddress: judgeAddr });
    console.log(`  PriorArtJudge v2 FINALIZED at: ${judgeAddr}`);
    console.log(`  Explorer: ${STUDIONET_EXPLORER}/address/${judgeAddr}`);
    await sleep(5000);
  } else {
    console.log(`Reusing PriorArtJudge v2 at: ${judgeAddr}`);
  }

  // 3. One-time immutable lock: PriorArtPool.set_judge(PriorArtJudge)
  state = loadState();
  if (!state.wiredFinalized) {
    let txHash: string | undefined = state.wireJudgeTx;
    if (!txHash) {
      console.log('\n[3/3] Permanently locking PriorArtPool.set_judge(PriorArtJudge)...');
      txHash = await callWithRetry(() =>
        deployer.writeContract({
          address: poolAddr as `0x${string}`,
          functionName: 'set_judge',
          args: [judgeAddr],
          value: 0n,
        })
      );
      saveState({ wireJudgeTx: txHash });
      console.log(`  Submitted: ${txHash}`);
    }
    await waitForFinalized(deployer, txHash!);
    saveState({ wiredFinalized: true });
    console.log('  Immutable judge lock FINALIZED!');
  } else {
    console.log('Contracts already locked.');
  }

  // Verify on-chain source via gen_getContractCode matches local disk byte-for-byte!
  const onChainPool = await getOnChainContractSource(poolAddr);
  const onChainJudge = await getOnChainContractSource(judgeAddr);
  if (sha256(onChainPool) !== poolSha) throw new Error('On-chain PriorArtPool source mismatch!');
  if (sha256(onChainJudge) !== judgeSha) throw new Error('On-chain PriorArtJudge source mismatch!');
  console.log('✓ On-chain gen_getContractCode matches local source 100% byte-for-byte!');

  const cfgRaw = await callWithRetry(() =>
    deployer.readContract({
      address: poolAddr as `0x${string}`,
      functionName: 'get_protocol_config',
      args: [],
    })
  );
  console.log('Verified On-Chain Protocol Config:', cfgRaw);
}

main().catch((err) => {
  console.error('Deployment failed:', err);
  process.exit(1);
});

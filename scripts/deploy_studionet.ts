import fs from 'node:fs';
import path from 'node:path';
import {
  getOrCreateActor,
  loadState,
  saveState,
  callWithRetry,
  waitForFinalized,
  sleep,
  sha256,
  STUDIONET_EXPLORER,
} from './studionet_lib.ts';

async function main() {
  console.log('===============================================================');
  console.log('   Step 4a: Deploying PriorArtPool + PriorArtJudge (StudioNet)');
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

  // 1. Deploy PriorArtPool
  let poolAddr: string | undefined = state.poolAddress;
  if (!poolAddr) {
    let txHash: string | undefined = state.poolDeployTx;
    if (!txHash) {
      console.log('\n[1/3] Deploying PriorArtPool...');
      txHash = await callWithRetry(() =>
        deployer.deployContract({
          code: poolCode,
          args: ['', 900],
        })
      );
      saveState({ poolDeployTx: txHash, poolSourceSha256: poolSha });
      console.log(`  Submitted: ${txHash}`);
    }
    const receipt = await waitForFinalized(deployer, txHash!);
    poolAddr = receipt.contractAddress;
    if (!poolAddr) throw new Error('PriorArtPool deployment returned no contractAddress');
    saveState({ poolAddress: poolAddr });
    console.log(`  PriorArtPool FINALIZED at: ${poolAddr}`);
    console.log(`  Explorer: ${STUDIONET_EXPLORER}/address/${poolAddr}`);
    await sleep(5000);
  } else {
    console.log(`Reusing PriorArtPool at: ${poolAddr}`);
  }

  // 2. Deploy PriorArtJudge wired to PriorArtPool
  state = loadState();
  let judgeAddr: string | undefined = state.judgeAddress;
  if (!judgeAddr) {
    let txHash: string | undefined = state.judgeDeployTx;
    if (!txHash) {
      console.log('\n[2/3] Deploying PriorArtJudge (wired to PriorArtPool)...');
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
    console.log(`  PriorArtJudge FINALIZED at: ${judgeAddr}`);
    console.log(`  Explorer: ${STUDIONET_EXPLORER}/address/${judgeAddr}`);
    await sleep(5000);
  } else {
    console.log(`Reusing PriorArtJudge at: ${judgeAddr}`);
  }

  // 3. Wire PriorArtPool -> PriorArtJudge
  state = loadState();
  if (!state.wiredFinalized) {
    let txHash: string | undefined = state.wireJudgeTx;
    if (!txHash) {
      console.log('\n[3/3] Wiring PriorArtPool.set_judge(PriorArtJudge)...');
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
    console.log('  Wiring FINALIZED!');
  } else {
    console.log('Contracts already wired.');
  }

  // Verify config readback
  const cfgRaw = await callWithRetry(() =>
    deployer.readContract({
      address: poolAddr as `0x${string}`,
      functionName: 'get_protocol_config',
      args: [],
    })
  );
  console.log('\nVerified On-Chain Protocol Config:', cfgRaw);
}

main().catch((err) => {
  console.error('Deployment failed:', err);
  process.exit(1);
});

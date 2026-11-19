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

const PROBE_TARGETS: Array<{ label: string; url: string; note: string }> = [
  {
    label: 'rfc_2104',
    url: 'https://www.rfc-editor.org/rfc/rfc2104.txt',
    note: 'IETF RFC 2104 (HMAC, Feb 1997) — Positive prior-art source',
  },
  {
    label: 'rfc_6962',
    url: 'https://www.rfc-editor.org/rfc/rfc6962.txt',
    note: 'IETF RFC 6962 (Certificate Transparency, Jun 2013) — Post-dated chronology test',
  },
  {
    label: 'wiki_merkle_2009',
    url: 'https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=timestamp|content&format=json&revids=333954216',
    note: 'Wikipedia permanent revision 333954216 (Merkle tree, 2009-12-25) — Partial disclosure test',
  },
  {
    label: 'archive_hashcash_2004',
    url: 'https://web.archive.org/web/20040326113623id_/http://www.hashcash.org/faq/',
    note: 'Archive.org raw id_ capture (Hashcash FAQ, 2004-03-26)',
  },
  {
    label: 'archive_hashcash_cdx',
    url: 'https://web.archive.org/cdx/search/cdx?url=http://www.hashcash.org/faq/&output=json&filter=timestamp:20040326113623',
    note: 'Archive.org CDX capture existence proof',
  },
  {
    label: 'github_injection',
    url: 'https://raw.githubusercontent.com/liu00222/Open-Prompt-Injection/fbed5cca347488f88363790ae3ae97c56116da6a/OpenPromptInjection/attackers/IgnoreAttacker.py',
    note: 'Public third-party prompt injection repo pinned to 40-hex commit SHA',
  },
];

async function main() {
  console.log('===============================================================');
  console.log('   Step 2: StudioNet Live Evidence Access Probe (EvidenceProbe)');
  console.log('===============================================================');

  const { client, account } = getOrCreateActor('deployer');
  console.log(`Deployer: ${account.address}`);

  const probeCode = fs.readFileSync(path.resolve('contracts/evidence_probe.py'), 'utf-8');
  const probeSha = sha256(probeCode);
  let state = loadState();

  // 1. Deploy EvidenceProbe (resumable)
  let probeAddr: string | undefined = state.probeAddress;
  if (!probeAddr) {
    let deployTx: string | undefined = state.probeDeployTx;
    if (!deployTx) {
      console.log('\n[1/2] Deploying contracts/evidence_probe.py to StudioNet...');
      deployTx = await callWithRetry(() => client.deployContract({ code: probeCode }));
      console.log(`  Deploy tx: ${deployTx}`);
      saveState({ probeDeployTx: deployTx, probeSourceSha256: probeSha });
    }
    const receipt = await waitForFinalized(client, deployTx!);
    probeAddr = receipt.contractAddress;
    if (!probeAddr) throw new Error('No contractAddress returned for EvidenceProbe');
    saveState({ probeAddress: probeAddr });
    console.log(`  EvidenceProbe FINALIZED at: ${probeAddr}`);
    console.log(`  Explorer: ${STUDIONET_EXPLORER}/address/${probeAddr}`);
    await sleep(5000);
  } else {
    console.log(`Reusing deployed EvidenceProbe at: ${probeAddr}`);
  }

  // 2. Probe each source from StudioNet validators
  console.log('\n[2/2] Probing each evidence source from StudioNet validators...');
  state = loadState();
  const probeResults: Record<string, any> = state.probeResults || {};

  for (const target of PROBE_TARGETS) {
    if (probeResults[target.label]?.finalized) {
      console.log(`  [SKIP] ${target.label}: already probed -> ${JSON.stringify(probeResults[target.label].parsed)}`);
      continue;
    }
    console.log(`\n  Probing [${target.label}]: ${target.url}`);
    let txHash: string | undefined = probeResults[target.label]?.txHash;
    if (!txHash) {
      txHash = await callWithRetry(() =>
        client.writeContract({
          address: probeAddr as `0x${string}`,
          functionName: 'probe_get',
          args: [target.label, target.url],
          value: 0n,
        })
      );
      probeResults[target.label] = { txHash, url: target.url, note: target.note, finalized: false };
      saveState({ probeResults });
      console.log(`    Submitted tx: ${txHash}`);
    }
    try {
      const receipt = await waitForFinalized(client, txHash!, { allowError: true, maxAttempts: 50 });
      let stored = '';
      if (receipt.statusName === 'FINALIZED' && receipt.executionResult === 'SUCCESS') {
        stored = await callWithRetry(() =>
          client.readContract({
            address: probeAddr as `0x${string}`,
            functionName: 'get_result',
            args: [target.label],
          })
        );
      }
      let parsed: any = null;
      try {
        parsed = stored ? JSON.parse(stored) : null;
      } catch {
        parsed = stored;
      }
      probeResults[target.label] = {
        txHash,
        url: target.url,
        note: target.note,
        finalized: receipt.statusName === 'FINALIZED',
        statusName: receipt.statusName,
        resultName: receipt.resultName,
        executionResult: receipt.executionResult,
        parsed,
        stderr: receipt.stderr ? receipt.stderr.slice(0, 300) : '',
      };
      saveState({ probeResults });
      console.log(`    RESULT [${target.label}]: status=${receipt.statusName} exec=${receipt.executionResult}`);
      console.log(`    DATA: ${JSON.stringify(parsed)}`);
    } catch (err: any) {
      console.error(`    FAILED [${target.label}]: ${err.message}`);
      probeResults[target.label] = {
        txHash,
        url: target.url,
        note: target.note,
        finalized: false,
        error: err.message,
      };
      saveState({ probeResults });
    }
    await sleep(5000);
  }

  // Write public non-secret probe summary report
  const report = {
    network: 'studionet',
    chainId: 61999,
    probeAddress: probeAddr,
    probeDeployTx: loadState().probeDeployTx,
    probeSourceSha256: probeSha,
    probedAt: new Date().toISOString(),
    results: probeResults,
  };
  fs.mkdirSync(path.resolve('deploy'), { recursive: true });
  fs.writeFileSync(path.resolve('deploy/probe_report.json'), JSON.stringify(report, null, 2), 'utf-8');
  console.log('\nSaved probe report to deploy/probe_report.json');
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});

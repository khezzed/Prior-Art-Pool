import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  getOrCreateActor,
  loadState,
  saveState,
  callWithRetry,
  waitForFinalized,
  waitForFinalizedTree,
  ensureFunded,
  getBalanceWei,
  sleep,
  sha256,
  STUDIONET_EXPLORER,
  STUDIONET_RPC,
  STUDIONET_CHAIN_ID,
} from './studionet_lib.ts';

const RFC_2104_URL = 'https://www.rfc-editor.org/rfc/rfc2104.txt';
const RFC_6962_URL = 'https://www.rfc-editor.org/rfc/rfc6962.txt';
const WIKI_MERKLE_URL =
  'https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=timestamp|content&format=json&revids=333954216';
const ARCHIVE_HASHCASH_URL =
  'https://web.archive.org/web/20040326113623id_/http://www.hashcash.org/faq/';
const GITHUB_INJECTION_URL =
  'https://raw.githubusercontent.com/liu00222/Open-Prompt-Injection/fbed5cca347488f88363790ae3ae97c56116da6a/OpenPromptInjection/attackers/IgnoreAttacker.py';
const MUTABLE_BAD_URL = 'https://raw.githubusercontent.com/org/repo/main/README.md';

async function readJson(client: any, addr: string, functionName: string, args: any[] = []) {
  const raw = await callWithRetry(() =>
    client.readContract({
      address: addr as `0x${string}`,
      functionName,
      args,
    })
  );
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function pollChallengeUntil(
  client: any,
  poolAddr: string,
  challengeId: number,
  targetStatuses: string[],
  maxAttempts = 40
) {
  console.log(`  [STATE POLL] Waiting for Challenge #${challengeId} -> ${targetStatuses.join(' | ')}`);
  for (let i = 1; i <= maxAttempts; i++) {
    const ch = await readJson(client, poolAddr, 'get_challenge', [challengeId]);
    if (targetStatuses.includes(ch.status)) {
      console.log(`    Challenge #${challengeId} reached ${ch.status}!`);
      return ch;
    }
    console.log(`    [${i}/${maxAttempts}] Challenge #${challengeId} status=${ch.status}`);
    await sleep(9000);
  }
  throw new Error(`Challenge #${challengeId} did not reach ${targetStatuses.join('|')}`);
}

async function pollSubmissionElementUntil(
  client: any,
  poolAddr: string,
  submissionId: number,
  elementIdx: number,
  maxAttempts = 45
) {
  console.log(`  [STATE POLL] Waiting for Submission #${submissionId} E${elementIdx} callback to settle...`);
  for (let i = 1; i <= maxAttempts; i++) {
    const sub = await readJson(client, poolAddr, 'get_submission', [submissionId]);
    const el = sub.elements?.[elementIdx];
    if (el && el.status && el.status !== 'UNMAPPED' && el.status !== 'PENDING') {
      console.log(
        `    Submission #${submissionId} E${elementIdx} settled: verdict=${el.verdict} sub_status=${sub.status}`
      );
      return sub;
    }
    console.log(
      `    [${i}/${maxAttempts}] Submission #${submissionId} status=${sub.status} E${elementIdx}=${el?.status}`
    );
    await sleep(9000);
  }
  throw new Error(`Submission #${submissionId} E${elementIdx} did not settle`);
}

interface StepRecord {
  stepId: string;
  label: string;
  actor: string;
  method: string;
  txHash: string;
  childTxHashes: string[];
  status: string;
  executionResult: string;
  returnValue: any;
  expectedFailure?: boolean;
}

async function runStep(
  stepId: string,
  label: string,
  actorName: string,
  client: any,
  poolAddr: string,
  method: string,
  args: any[],
  value: bigint = 0n,
  options: {
    followCallbacks?: boolean;
    allowError?: boolean;
    expectedFailure?: boolean;
    allowEoaTransferHandler?: boolean;
  } = {}
): Promise<StepRecord> {
  const state = loadState();
  const demoSteps: Record<string, StepRecord> = state.demoSteps || {};
  if (demoSteps[stepId]?.status === 'FINALIZED') {
    console.log(`  [SKIP] ${stepId} (${label}) already FINALIZED: ${demoSteps[stepId].txHash}`);
    return demoSteps[stepId];
  }

  console.log(`\n▶ [${stepId}] ${label} (${actorName} -> ${method}, value=${value} wei)`);
  let txHash: string | undefined = demoSteps[stepId]?.txHash;
  if (!txHash) {
    txHash = await callWithRetry(() =>
      client.writeContract({
        address: poolAddr as `0x${string}`,
        functionName: method,
        args,
        value,
      })
    );
    demoSteps[stepId] = {
      stepId,
      label,
      actor: actorName,
      method,
      txHash: txHash!,
      childTxHashes: [],
      status: 'SUBMITTED',
      executionResult: 'PENDING',
      returnValue: '',
      expectedFailure: options.expectedFailure,
    };
    saveState({ demoSteps });
    console.log(`  Tx saved before wait: ${txHash}`);
  }

  let parent;
  let children: any[] = [];
  if (options.followCallbacks) {
    const tree = await waitForFinalizedTree(client, txHash!, {
      allowError: options.allowError,
      allowEoaTransferHandler: options.allowEoaTransferHandler,
      maxAttempts: 80,
    });
    parent = tree.parent;
    children = tree.children;
  } else {
    parent = await waitForFinalized(client, txHash!, {
      allowError: options.allowError,
      maxAttempts: 70,
    });
  }

  const record: StepRecord = {
    stepId,
    label,
    actor: actorName,
    method,
    txHash: txHash!,
    childTxHashes: children.map((c) => c.txHash),
    status: parent.statusName,
    executionResult: parent.executionResult,
    returnValue: parent.returnReadable,
    expectedFailure: options.expectedFailure,
  };
  demoSteps[stepId] = record;
  saveState({ demoSteps });
  console.log(`  ✓ ${stepId} FINALIZED (${parent.executionResult}): ${JSON.stringify(parent.returnReadable)}`);
  await sleep(4000);
  return record;
}

async function main() {
  console.log('===============================================================');
  console.log('   Step 4b: Live StudioNet 6-Case Proof Runner (PriorArtPool)');
  console.log('===============================================================');

  const state = loadState();
  const poolAddr: string = state.poolAddress;
  const judgeAddr: string = state.judgeAddress;
  if (!poolAddr || !judgeAddr) {
    throw new Error('Run npm run deploy:studionet first!');
  }

  const { client: sponsorA, account: accA } = getOrCreateActor('deployer');
  const { client: sponsorB, account: accB } = getOrCreateActor('sponsorB');
  const { client: researcher1, account: accR1 } = getOrCreateActor('researcher1');
  const { client: researcher2, account: accR2 } = getOrCreateActor('researcher2');

  console.log(`PriorArtPool  : ${poolAddr}`);
  console.log(`PriorArtJudge : ${judgeAddr}`);
  console.log(`Sponsor A     : ${accA.address}`);
  console.log(`Sponsor B     : ${accB.address}`);
  console.log(`Researcher 1  : ${accR1.address}`);
  console.log(`Researcher 2  : ${accR2.address}`);

  // Ensure all 4 StudioNet demo accounts are funded so native payable & transfers execute cleanly
  for (const addr of [accA.address, accB.address, accR1.address, accR2.address]) {
    const b = await ensureFunded(addr);
    console.log(`  Balance ${addr}: ${b.toString()} wei`);
  }

  // =========================================================================
  // CASE 1: Non-stranding payable guard (1 wei) + Up-front RuleGate REJECTED_VAGUE + Refund
  // =========================================================================
  console.log('\n================ CASE 1: RuleGate Rejection + Payable Safety ================');
  await runStep(
    'C1_PAYABLE_GUARD',
    'Non-stranding payable guard: invalid priority date credits 1 wei to refundable_balances',
    'sponsorA',
    sponsorA,
    poolAddr,
    'open_challenge',
    [
      'US-BAD-DATE',
      'not-a-date',
      JSON.stringify([
        'Concrete technical element one using SHA-256 hashing over blocks.',
        'Concrete technical element two verifying Merkle inclusion proofs.',
      ]),
      600,
      60,
      10,
    ],
    1n,
    { expectedFailure: true }
  );

  await runStep(
    'C1_OPEN_VAGUE',
    'Open Challenge #1 with subjective/vague elements (100 wei) -> triggers RuleGate callback',
    'sponsorA',
    sponsorA,
    poolAddr,
    'open_challenge',
    [
      'US-VAGUE-2020-001',
      '2020-01-01',
      JSON.stringify([
        'Provides a revolutionary, intuitive, best-in-class user experience for web authentication.',
        'Delivers superior seamless elegance and good overall quality compared to legacy software.',
      ]),
      1800,
      60,
      20,
    ],
    100n,
    { followCallbacks: true }
  );
  const ch1 = await pollChallengeUntil(sponsorA, poolAddr, 1, ['REJECTED_VAGUE', 'OPEN']);
  if (ch1.status !== 'REJECTED_VAGUE') {
    throw new Error(`Expected Challenge #1 REJECTED_VAGUE, got ${ch1.status}`);
  }

  await runStep(
    'C1_WITHDRAW_REFUND',
    'Sponsor A withdraws 101 wei refund (100 rejected RuleGate + 1 invalid payable guard)',
    'sponsorA',
    sponsorA,
    poolAddr,
    'withdraw_refund',
    [],
    0n,
    { followCallbacks: true, allowEoaTransferHandler: true }
  );

  // =========================================================================
  // CASE 2: Multi-Sponsor Crowdfund + Full 2-Element § 102 Win (IETF RFC 2104, Feb 1997)
  // =========================================================================
  console.log('\n================ CASE 2: Crowdfund + Full § 102 Win (RFC 2104) ================');
  const hmacElements = [
    'Combines a shared secret authentication key with two distinct fixed repeated padding byte strings via bitwise exclusive-OR (XOR) to construct inner and outer keyed blocks.',
    'Computes a message authentication code using a nested two-pass cryptographic hash that hashes the message appended to the inner keyed block and then hashes that output appended to the outer keyed block.',
  ];
  await runStep(
    'C2_OPEN_HMAC',
    'Sponsor A opens Challenge #2 (US-HMAC-2002, priority 2002-01-01, 50 wei) -> RuleGate ACCEPTED',
    'sponsorA',
    sponsorA,
    poolAddr,
    'open_challenge',
    ['US-HMAC-2002-042', '2002-01-01', JSON.stringify(hmacElements), 3600, 60, 20],
    50n,
    { followCallbacks: true }
  );
  const ch2Open = await pollChallengeUntil(sponsorA, poolAddr, 2, ['OPEN', 'REJECTED_VAGUE']);
  if (ch2Open.status !== 'OPEN') {
    throw new Error(`Expected Challenge #2 OPEN, got ${ch2Open.status}: ${JSON.stringify(ch2Open.vetting_result)}`);
  }

  await runStep(
    'C2_CROWDFUND_SPONSOR_B',
    'Sponsor B crowdfunds +50 wei into Challenge #2 (Total pool: 100 wei)',
    'sponsorB',
    sponsorB,
    poolAddr,
    'contribute_bounty',
    [2],
    50n
  );

  // Test mutable /main/ URL rejection safely credits 20 wei to researcher2
  await runStep(
    'C2_MUTABLE_URL_REJECT',
    'Expected failure: Mutable GitHub /main/ URL rejected safely (20 wei credited to refundable)',
    'researcher2',
    researcher2,
    poolAddr,
    'submit_prior_art',
    [2, 'Mutable main branch attempt', MUTABLE_BAD_URL],
    20n,
    { expectedFailure: true }
  );
  await runStep(
    'C2_MUTABLE_URL_REFUND',
    'Researcher 2 withdraws 20 wei refund from blocked mutable URL submission',
    'researcher2',
    researcher2,
    poolAddr,
    'withdraw_refund',
    [],
    0n,
    { followCallbacks: true, allowEoaTransferHandler: true }
  );

  await runStep(
    'C2_SUBMIT_RFC2104',
    'Researcher 1 submits IETF RFC 2104 (Feb 1997) with 20 wei anti-spam bond',
    'researcher1',
    researcher1,
    poolAddr,
    'submit_prior_art',
    [2, 'IETF RFC 2104: HMAC Keyed-Hashing for Message Authentication (Feb 1997)', RFC_2104_URL],
    20n
  );

  await runStep(
    'C2_MAP_E0',
    'Map Element 0 (inner/outer XOR padding bytes) against RFC 2104 -> DISCLOSED',
    'researcher1',
    researcher1,
    poolAddr,
    'map_claim_element',
    [1, 0, 'ipad = the byte 0x36'],
    0n,
    { followCallbacks: true }
  );
  const sub1E0 = await pollSubmissionElementUntil(sponsorA, poolAddr, 1, 0);
  if (sub1E0.elements[0].verdict !== 'DISCLOSED') {
    throw new Error(`Expected Sub #1 E0 DISCLOSED, got ${JSON.stringify(sub1E0.elements[0])}`);
  }

  await runStep(
    'C2_MAP_E1',
    'Map Element 1 (nested two-pass hash H(K XOR opad, H(K XOR ipad, text))) -> DISCLOSED + WIN',
    'researcher1',
    researcher1,
    poolAddr,
    'map_claim_element',
    [1, 1, 'H(K XOR opad'],
    0n,
    { followCallbacks: true }
  );
  const sub1E1 = await pollSubmissionElementUntil(sponsorA, poolAddr, 1, 1);
  if (sub1E1.status !== 'WON') {
    throw new Error(`Expected Sub #1 WON, got ${sub1E1.status}: ${JSON.stringify(sub1E1.elements[1])}`);
  }

  await runStep(
    'C2_CLAIM_WIN',
    'Researcher 1 claims 120 wei finalized payout (100 crowdfunded pool + 20 returned bond)',
    'researcher1',
    researcher1,
    poolAddr,
    'claim_payout',
    [],
    0n,
    { followCallbacks: true, allowEoaTransferHandler: true }
  );

  // =========================================================================
  // CASE 3 & 4: Partial Disclosure (Wikipedia rev 333954216), Archive.org id_ + CDX (Hashcash 2004),
  //             and Deterministic Post-Dated Chronology Gate (RFC 6962, Jun 2013)
  // =========================================================================
  console.log('\n========= CASE 3 & 4: Partial Disclosure, Archive.org CDX & Post-Dated =========');
  const hybridElements = [
    'Constructs a tree of cryptographic hash digests over data blocks so peers in a peer-to-peer network can verify that received data blocks are undamaged and unaltered.',
    'Requires message senders to compute non-interactive partial hash-collisions using the SHA1 hash function as a computationally verifiable anti-spam token.',
  ];
  await runStep(
    'C3_OPEN_HYBRID',
    'Sponsor A opens Challenge #3 (US-HYBRID-2011, priority 2011-01-01, 60 wei) -> RuleGate ACCEPTED',
    'sponsorA',
    sponsorA,
    poolAddr,
    'open_challenge',
    ['US-HYBRID-2011-088', '2011-01-01', JSON.stringify(hybridElements), 3600, 60, 20],
    60n,
    { followCallbacks: true }
  );
  const ch3Open = await pollChallengeUntil(sponsorA, poolAddr, 3, ['OPEN', 'REJECTED_VAGUE']);
  if (ch3Open.status !== 'OPEN') {
    throw new Error(`Expected Challenge #3 OPEN, got ${ch3Open.status}`);
  }

  // Case 3a: Wikipedia Merkle_tree rev 333954216 (2009-12-25) -> E0 DISCLOSED, E1 NOT_DISCLOSED -> DISQUALIFIED
  await runStep(
    'C3_SUBMIT_WIKI',
    'Researcher 1 submits Wikipedia Merkle_tree permanent rev 333954216 (2009-12-25) with 20 wei bond',
    'researcher1',
    researcher1,
    poolAddr,
    'submit_prior_art',
    [3, 'Wikipedia: Merkle tree permanent revision 333954216 (2009-12-25)', WIKI_MERKLE_URL],
    20n
  );
  await runStep(
    'C3_WIKI_E0',
    'Map Element 0 (Merkle hash trees) on Wikipedia rev 333954216 -> DISCLOSED',
    'researcher1',
    researcher1,
    poolAddr,
    'map_claim_element',
    [2, 0, 'peer-to-peer network'],
    0n,
    { followCallbacks: true }
  );
  const sub2E0 = await pollSubmissionElementUntil(sponsorA, poolAddr, 2, 0);
  if (sub2E0.elements[0].verdict !== 'DISCLOSED') {
    throw new Error(`Expected Sub #2 E0 DISCLOSED, got ${JSON.stringify(sub2E0.elements[0])}`);
  }

  await runStep(
    'C3_WIKI_E1',
    'Map Element 1 (SHA1 partial hash-collision stamp) on Wikipedia rev 333954216 -> NOT_DISCLOSED (All-Elements Rule disqualifies!)',
    'researcher1',
    researcher1,
    poolAddr,
    'map_claim_element',
    [2, 1, 'Hash trees'],
    0n,
    { followCallbacks: true }
  );
  const sub2E1 = await pollSubmissionElementUntil(sponsorA, poolAddr, 2, 1);
  if (sub2E1.status !== 'DISQUALIFIED_NOT_DISCLOSED') {
    throw new Error(`Expected Sub #2 DISQUALIFIED_NOT_DISCLOSED, got ${sub2E1.status}`);
  }

  // Case 3b: Archive.org id_ + CDX verification (Hashcash FAQ 2004-03-26) -> E1 DISCLOSED (CDX verified!)
  await runStep(
    'C3_SUBMIT_ARCHIVE',
    'Researcher 2 submits Archive.org raw id_ capture (Hashcash FAQ, 2004-03-26) with 20 wei bond',
    'researcher2',
    researcher2,
    poolAddr,
    'submit_prior_art',
    [3, 'Archive.org (2004-03-26 id_): Adam Back Hashcash FAQ', ARCHIVE_HASHCASH_URL],
    20n
  );
  await runStep(
    'C3_ARCHIVE_E1',
    'Map Element 1 (SHA1 partial hash-collisions) on Archive.org id_ + CDX -> DISCLOSED (cdx_verified=true)',
    'researcher2',
    researcher2,
    poolAddr,
    'map_claim_element',
    [3, 1, 'partial hash-collisions'],
    0n,
    { followCallbacks: true }
  );
  const sub3E1 = await pollSubmissionElementUntil(sponsorA, poolAddr, 3, 1);
  if (sub3E1.elements[1].verdict !== 'DISCLOSED' || !sub3E1.elements[1].cdx_verified) {
    throw new Error(`Expected Sub #3 E1 DISCLOSED + cdx_verified, got ${JSON.stringify(sub3E1.elements[1])}`);
  }

  // Case 4: Deterministic Post-Dated Chronology Gate (RFC 6962, June 2013 >= priority 2011-01-01)
  await runStep(
    'C4_SUBMIT_RFC6962',
    'Researcher 2 submits post-dated IETF RFC 6962 (June 2013 vs priority 2011-01-01) with 20 wei bond',
    'researcher2',
    researcher2,
    poolAddr,
    'submit_prior_art',
    [3, 'IETF RFC 6962: Certificate Transparency (June 2013 — Post-Dated)', RFC_6962_URL],
    20n
  );
  await runStep(
    'C4_MAP_POSTDATED',
    'Map Element 0 on RFC 6962 -> Deterministic POST_DATED rejection in plain Python + bond forfeited',
    'researcher2',
    researcher2,
    poolAddr,
    'map_claim_element',
    [4, 0, 'Certificate Transparency'],
    0n,
    { followCallbacks: true }
  );
  const sub4E0 = await pollSubmissionElementUntil(sponsorA, poolAddr, 4, 0);
  if (sub4E0.status !== 'DISQUALIFIED_POST_DATED') {
    throw new Error(`Expected Sub #4 DISQUALIFIED_POST_DATED, got ${sub4E0.status}`);
  }

  // =========================================================================
  // CASE 5 & 6: Live Prompt Injection Defense + Timeout Fallback & Pro-Rata Refund
  // =========================================================================
  console.log('\n========= CASE 5 & 6: Prompt Injection Defense + Pro-Rata Timeout Refund =========');
  await runStep(
    'C5_OPEN_EXPIRING',
    'Sponsor A opens Challenge #4 (priority 2027-01-01, 240s duration + 20s grace, 60 wei) -> RuleGate ACCEPTED',
    'sponsorA',
    sponsorA,
    poolAddr,
    'open_challenge',
    ['US-INJ-TIMEOUT-2027', '2027-01-01', JSON.stringify(hmacElements), 240, 20, 20],
    60n,
    { followCallbacks: true }
  );
  const ch4Open = await pollChallengeUntil(sponsorA, poolAddr, 4, ['OPEN', 'REJECTED_VAGUE']);
  if (ch4Open.status !== 'OPEN') {
    throw new Error(`Expected Challenge #4 OPEN, got ${ch4Open.status}`);
  }

  await runStep(
    'C5_CROWDFUND_SPONSOR_B',
    'Sponsor B crowdfunds +40 wei into Challenge #4 (60/40 split, 100 wei pool)',
    'sponsorB',
    sponsorB,
    poolAddr,
    'contribute_bounty',
    [4],
    40n
  );

  await runStep(
    'C5_SUBMIT_INJECTION',
    'Attacker (Researcher 2) submits pinned Open-Prompt-Injection IgnoreAttacker.py with 20 wei bond',
    'researcher2',
    researcher2,
    poolAddr,
    'submit_prior_art',
    [4, 'Adversarial Prompt Injection: liu00222/Open-Prompt-Injection IgnoreAttacker.py', GITHUB_INJECTION_URL],
    20n
  );
  await runStep(
    'C5_MAP_INJECTION',
    'Map Element 0 against IgnoreAttacker.py -> Prompt injection neutralized (NOT_DISCLOSED), 20 wei bond forfeited to pool',
    'researcher2',
    researcher2,
    poolAddr,
    'map_claim_element',
    [5, 0, 'Ignore previous instructions'],
    0n,
    { followCallbacks: true }
  );
  const sub5E0 = await pollSubmissionElementUntil(sponsorA, poolAddr, 5, 0);
  if (sub5E0.status !== 'DISQUALIFIED_NOT_DISCLOSED') {
    throw new Error(`Expected Sub #5 DISQUALIFIED_NOT_DISCLOSED (injection defeated), got ${sub5E0.status}`);
  }

  // Wait until Challenge #4 grace_deadline has passed on wall clock before calling expire_challenge
  const ch4Now = await readJson(sponsorA, poolAddr, 'get_challenge', [4]);
  const graceDeadlineSec = Number(ch4Now.grace_deadline);
  const nowSec = Math.floor(Date.now() / 1000);
  const waitSec = graceDeadlineSec - nowSec + 15;
  if (waitSec > 0) {
    console.log(`  [WAIT] Waiting ${waitSec}s for Challenge #4 grace_deadline (${graceDeadlineSec}) to elapse...`);
    await sleep(waitSec * 1000);
  }

  await runStep(
    'C6_EXPIRE_CHALLENGE',
    'Deterministic timeout fallback: expire_challenge(4) distributes 120 wei pro-rata (72 Sponsor A / 48 Sponsor B)',
    'sponsorA',
    sponsorA,
    poolAddr,
    'expire_challenge',
    [4],
    0n
  );

  await runStep(
    'C6_REFUND_SPONSOR_A',
    'Sponsor A claims 60% pro-rata refund (72 wei including forfeited attacker bond share)',
    'sponsorA',
    sponsorA,
    poolAddr,
    'claim_pro_rata_refund',
    [4],
    0n,
    { followCallbacks: true, allowEoaTransferHandler: true }
  );

  await runStep(
    'C6_REFUND_SPONSOR_B',
    'Sponsor B claims 40% pro-rata refund (48 wei including forfeited attacker bond share)',
    'sponsorB',
    sponsorB,
    poolAddr,
    'claim_pro_rata_refund',
    [4],
    0n,
    { followCallbacks: true, allowEoaTransferHandler: true }
  );

  // =========================================================================
  // SNAPSHOT COMPLETE ON-CHAIN STATE & WRITE deploy/proof.json
  // =========================================================================
  console.log('\n================ FINALIZING deploy/proof.json ================');
  const finalState = loadState();
  const accounting = await readJson(sponsorA, poolAddr, 'get_accounting_summary');
  const config = await readJson(sponsorA, poolAddr, 'get_protocol_config');
  const challenges = [
    await readJson(sponsorA, poolAddr, 'get_challenge', [1]),
    await readJson(sponsorA, poolAddr, 'get_challenge', [2]),
    await readJson(sponsorA, poolAddr, 'get_challenge', [3]),
    await readJson(sponsorA, poolAddr, 'get_challenge', [4]),
  ];
  const submissions = [
    await readJson(sponsorA, poolAddr, 'get_submission', [1]),
    await readJson(sponsorA, poolAddr, 'get_submission', [2]),
    await readJson(sponsorA, poolAddr, 'get_submission', [3]),
    await readJson(sponsorA, poolAddr, 'get_submission', [4]),
    await readJson(sponsorA, poolAddr, 'get_submission', [5]),
  ];

  let sourceCommit = 'uncommitted';
  try {
    sourceCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    sourceCommit = 'pending-commit';
  }

  const probeReport = fs.existsSync(path.resolve('deploy/probe_report.json'))
    ? JSON.parse(fs.readFileSync(path.resolve('deploy/probe_report.json'), 'utf-8'))
    : null;

  const proof = {
    project: 'PriorArtPool',
    network: {
      name: 'GenLayer StudioNet',
      chainId: STUDIONET_CHAIN_ID,
      rpcUrl: STUDIONET_RPC,
      explorerBaseUrl: STUDIONET_EXPLORER,
      runner: 'py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6',
    },
    sourceCommit,
    generatedAt: new Date().toISOString(),
    contracts: {
      evidenceProbe: {
        address: finalState.probeAddress,
        deployTx: finalState.probeDeployTx,
        sourcePath: 'contracts/evidence_probe.py',
        sourceSha256: sha256(fs.readFileSync(path.resolve('contracts/evidence_probe.py'), 'utf-8')),
      },
      priorArtPool: {
        address: poolAddr,
        deployTx: finalState.poolDeployTx,
        wireTx: finalState.wireJudgeTx,
        sourcePath: 'contracts/prior_art_pool.py',
        sourceSha256: sha256(fs.readFileSync(path.resolve('contracts/prior_art_pool.py'), 'utf-8')),
      },
      priorArtJudge: {
        address: judgeAddr,
        deployTx: finalState.judgeDeployTx,
        sourcePath: 'contracts/prior_art_judge.py',
        sourceSha256: sha256(fs.readFileSync(path.resolve('contracts/prior_art_judge.py'), 'utf-8')),
      },
    },
    actors: {
      sponsorA: accA.address,
      sponsorB: accB.address,
      researcher1: accR1.address,
      researcher2: accR2.address,
    },
    probeSummary: probeReport?.results || {},
    poolContractBalanceWei: (await getBalanceWei(poolAddr)).toString(),
    accountingSummary: accounting,
    protocolConfig: config,
    challenges,
    submissions,
    steps: Object.values(finalState.demoSteps || {}),
  };

  fs.mkdirSync(path.resolve('deploy'), { recursive: true });
  fs.writeFileSync(path.resolve('deploy/proof.json'), JSON.stringify(proof, null, 2), 'utf-8');
  console.log('✓ Accounting summary:', JSON.stringify(accounting));
  if (!accounting.invariant_holds) {
    throw new Error('CRITICAL: Accounting conservation invariant did NOT hold!');
  }
  console.log('✓ Wrote complete live proof manifest to deploy/proof.json');
}

main().catch((err) => {
  console.error('Demo run failed:', err);
  process.exit(1);
});

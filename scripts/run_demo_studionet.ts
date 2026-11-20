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

// 100% Real Historical Public Archives (zero self-hosted fixtures, zero future dates!)
const RFC_2104_URL = 'https://www.rfc-editor.org/rfc/rfc2104.txt';
const WIKI_HMAC_2005_URL =
  'https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=timestamp|content&format=json&revids=31406215';
const WIKI_MERKLE_2009_URL =
  'https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=timestamp|content&format=json&revids=333954216';
const ARCHIVE_HASHCASH_2004_URL =
  'https://web.archive.org/web/20040326113623id_/http://www.hashcash.org/faq/';
const RFC_9162_2021_URL = 'https://www.rfc-editor.org/rfc/rfc9162.txt';
const WIKI_PROMPT_INJ_2025_URL =
  'https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=timestamp|content&format=json&revids=1289403591';
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
  statusTransitions: string[];
  appealed: boolean;
  appealWindowTimestamp: number | null;
  eoaBalanceDeltaWei?: string;
  expectedFailure?: boolean;
}

async function runStep(
  stepId: string,
  label: string,
  actorName: string,
  actorAddress: string,
  client: any,
  poolAddr: string,
  method: string,
  args: any[],
  value: bigint = 0n,
  options: {
    followCallbacks?: boolean;
    allowError?: boolean;
    expectedFailure?: boolean;
    isNativeEthTransfer?: boolean;
    expectedEoaDeltaWei?: bigint;
  } = {}
): Promise<StepRecord> {
  const state = loadState();
  const demoSteps: Record<string, StepRecord> = state.demoSteps || {};
  if (demoSteps[stepId]?.status === 'FINALIZED') {
    console.log(`  [SKIP] ${stepId} (${label}) already FINALIZED: ${demoSteps[stepId].txHash}`);
    return demoSteps[stepId];
  }

  console.log(`\n▶ [${stepId}] ${label} (${actorName} -> ${method}, value=${value} wei)`);
  const balBefore = options.isNativeEthTransfer ? await getBalanceWei(actorAddress) : null;

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
      statusTransitions: ['SUBMITTED'],
      appealed: false,
      appealWindowTimestamp: null,
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
      isNativeEthTransfer: options.isNativeEthTransfer,
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

  let deltaStr: string | undefined;
  if (options.isNativeEthTransfer && balBefore !== null) {
    const balAfter = await getBalanceWei(actorAddress);
    const delta = balAfter - balBefore;
    deltaStr = delta.toString();
    console.log(`  [EOA BALANCE VERIFIED] ${actorName} delta = +${deltaStr} wei (before=${balBefore}, after=${balAfter})`);
    if (options.expectedEoaDeltaWei !== undefined && delta !== options.expectedEoaDeltaWei) {
      throw new Error(
        `Expected ${actorName} native EOA delta ${options.expectedEoaDeltaWei} wei, got ${delta} wei!`
      );
    }
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
    statusTransitions: parent.statusTransitions,
    appealed: parent.appealed,
    appealWindowTimestamp: parent.appealWindowTimestamp,
    eoaBalanceDeltaWei: deltaStr,
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
  console.log('   Step 4b (v2 Hardened): Live StudioNet 6-Case Proof Runner');
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

  for (const addr of [accA.address, accB.address, accR1.address, accR2.address]) {
    const b = await ensureFunded(addr);
    console.log(`  Funded ${addr}: ${b.toString()} wei`);
  }

  // =========================================================================
  // CASE 1: Non-stranding payable guard (1 wei) + Up-front RuleGate REJECTED_VAGUE + Real EOA Refund
  // =========================================================================
  console.log('\n================ CASE 1: RuleGate Rejection + Payable Safety ================');
  await runStep(
    'C1_PAYABLE_GUARD',
    'Non-stranding payable guard: invalid priority date credits 1 wei to refundable_balances',
    'sponsorA',
    accA.address,
    sponsorA,
    poolAddr,
    'open_challenge',
    [
      'DRAFT-BAD-DATE',
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
    'Open Challenge #1 (DRAFT-VAGUE-REJECT) with subjective elements (100 wei) -> RuleGate REJECTED_VAGUE',
    'sponsorA',
    accA.address,
    sponsorA,
    poolAddr,
    'open_challenge',
    [
      'DRAFT-VAGUE-REJECT',
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
    'Sponsor A withdraws 101 wei refund via EthSend (real EOA balance +101 wei verified)',
    'sponsorA',
    accA.address,
    sponsorA,
    poolAddr,
    'withdraw_refund',
    [],
    0n,
    { followCallbacks: true, isNativeEthTransfer: true, expectedEoaDeltaWei: 101n }
  );

  // =========================================================================
  // CASE 2: REAL USPTO US 10,103,888 B2 (Priority 2015-11-22)
  //         2-Sponsor Crowdfund + LIVE 2-Researcher Competitive Race + Winner Payout + Loser Bond Reclaim!
  // =========================================================================
  console.log('\n========= CASE 2: Real US 10,103,888 B2 + Live 2-Researcher Race =========');
  const hmacElements = [
    'Defines two distinct fixed repeated padding byte constants (inner pad 0x36 and outer pad 0x5C) combined with a block-sized secret key via bitwise exclusive-OR (XOR).',
    'Computes a message authentication code using a nested two-pass cryptographic hash that hashes the message appended to the inner keyed block and then hashes that output appended to the outer keyed block.',
  ];
  await runStep(
    'C2_OPEN_HMAC',
    'Sponsor A opens Challenge #2 (US 10,103,888 B2, Dyadic HMAC priority 2015-11-22, 50 wei) -> RuleGate ACCEPTED',
    'sponsorA',
    accA.address,
    sponsorA,
    poolAddr,
    'open_challenge',
    ['US 10,103,888 B2', '2015-11-22', JSON.stringify(hmacElements), 3600, 60, 20],
    50n,
    { followCallbacks: true }
  );
  const ch2Open = await pollChallengeUntil(sponsorA, poolAddr, 2, ['OPEN', 'REJECTED_VAGUE']);
  if (ch2Open.status !== 'OPEN') {
    throw new Error(`Expected Challenge #2 OPEN, got ${ch2Open.status}`);
  }

  await runStep(
    'C2_CROWDFUND_SPONSOR_B',
    'Sponsor B crowdfunds +50 wei into Challenge #2 (Total pool: 100 wei)',
    'sponsorB',
    accB.address,
    sponsorB,
    poolAddr,
    'contribute_bounty',
    [2],
    50n
  );

  // Mutable URL safety proof (+20 wei real EOA refund)
  await runStep(
    'C2_MUTABLE_URL_REJECT',
    'Expected failure: Mutable GitHub /main/ URL rejected safely (20 wei credited to refundable)',
    'researcher2',
    accR2.address,
    researcher2,
    poolAddr,
    'submit_prior_art',
    [2, 'Mutable main branch attempt', MUTABLE_BAD_URL],
    20n,
    { expectedFailure: true }
  );
  await runStep(
    'C2_MUTABLE_URL_REFUND',
    'Researcher 2 withdraws 20 wei refund via EthSend (real EOA balance +20 wei verified)',
    'researcher2',
    accR2.address,
    researcher2,
    poolAddr,
    'withdraw_refund',
    [],
    0n,
    { followCallbacks: true, isNativeEthTransfer: true, expectedEoaDeltaWei: 20n }
  );

  // COMPETING RESEARCHER 2 enters the race with Wikipedia HMAC permanent rev 31406215 (2005-12-15)!
  await runStep(
    'C2_RACE_SUBMIT_R2_WIKI',
    'Competing Researcher 2 enters race with Wikipedia HMAC permanent rev 31406215 (2005-12-15, 20 wei bond)',
    'researcher2',
    accR2.address,
    researcher2,
    poolAddr,
    'submit_prior_art',
    [2, 'Wikipedia: HMAC permanent revision 31406215 (2005-12-15)', WIKI_HMAC_2005_URL],
    20n
  );

  // RESEARCHER 1 enters concurrently with IETF RFC 2104 (Feb 1997)
  await runStep(
    'C2_RACE_SUBMIT_R1_RFC2104',
    'Researcher 1 enters race concurrently with IETF RFC 2104 (Feb 1997, 20 wei bond)',
    'researcher1',
    accR1.address,
    researcher1,
    poolAddr,
    'submit_prior_art',
    [2, 'IETF RFC 2104: HMAC Keyed-Hashing for Message Authentication (Feb 1997)', RFC_2104_URL],
    20n
  );

  // Researcher 1 maps E0 (explicit ipad 0x36 / opad 0x5C padding definitions!)
  await runStep(
    'C2_R1_MAP_E0',
    'Researcher 1 maps Element 0 (0x36/0x5C XOR padding bytes) on RFC 2104 -> DISCLOSED',
    'researcher1',
    accR1.address,
    researcher1,
    poolAddr,
    'map_claim_element',
    [2, 0, 'We define two fixed and different strings ipad and opad'],
    0n,
    { followCallbacks: true }
  );
  const sub2E0 = await pollSubmissionElementUntil(sponsorA, poolAddr, 2, 0);
  if (sub2E0.elements[0].verdict !== 'DISCLOSED') {
    throw new Error(`Expected Sub #2 E0 DISCLOSED, got ${JSON.stringify(sub2E0.elements[0])}`);
  }

  // Researcher 1 completes E1 first -> WINS THE RACE!
  await runStep(
    'C2_R1_MAP_E1',
    'Researcher 1 maps Element 1 (nested two-pass hash) on RFC 2104 -> DISCLOSED + FIRST-TO-FINALITY WIN',
    'researcher1',
    accR1.address,
    researcher1,
    poolAddr,
    'map_claim_element',
    [2, 1, 'H(K XOR opad'],
    0n,
    { followCallbacks: true }
  );
  const sub2E1 = await pollSubmissionElementUntil(sponsorA, poolAddr, 2, 1);
  if (sub2E1.status !== 'WON') {
    throw new Error(`Expected Sub #2 WON, got ${sub2E1.status}`);
  }

  await runStep(
    'C2_R1_CLAIM_WIN',
    'Winning Researcher 1 claims 120 wei payout via EthSend (real EOA balance +120 wei verified)',
    'researcher1',
    accR1.address,
    researcher1,
    poolAddr,
    'claim_payout',
    [],
    0n,
    { followCallbacks: true, isNativeEthTransfer: true, expectedEoaDeltaWei: 120n }
  );

  // HONEST LOSING RACER (Researcher 2) reclaims their superseded 20 wei bond LIVE on StudioNet!
  await runStep(
    'C2_R2_RECLAIM_BOND',
    'Honest losing racer (Researcher 2) calls reclaim_superseded_bond(1) after Challenge #2 settles',
    'researcher2',
    accR2.address,
    researcher2,
    poolAddr,
    'reclaim_superseded_bond',
    [1],
    0n
  );
  await runStep(
    'C2_R2_WITHDRAW_BOND',
    'Researcher 2 withdraws reclaimed 20 wei bond via EthSend (real EOA balance +20 wei verified)',
    'researcher2',
    accR2.address,
    researcher2,
    poolAddr,
    'withdraw_refund',
    [],
    0n,
    { followCallbacks: true, isNativeEthTransfer: true, expectedEoaDeltaWei: 20n }
  );

  // =========================================================================
  // CASE 3 & 4: REAL USPTO US 10,728,041 B2 (Amazon, Priority 2016-12-23)
  //             Symmetric All-Elements Rejection (Wiki E0 only + Archive.org CDX E1 only)
  //             + Deterministic Post-Dated Chronology Gate (RFC 9162, Dec 2021 >= 2016-12-23)
  // =========================================================================
  console.log('\n========= CASE 3 & 4: Real US 10,728,041 B2 (Amazon) Multi-Archive Stress Test =========');
  const hybridElements = [
    'Constructs a tree of cryptographic hash digests over data blocks so peers in a peer-to-peer network can verify that received data blocks are undamaged and unaltered.',
    'Requires message senders to compute non-interactive partial hash-collisions using the SHA1 hash function as a computationally verifiable anti-spam token.',
  ];
  await runStep(
    'C3_OPEN_AMAZON',
    'Sponsor A opens Challenge #3 (US 10,728,041 B2, Amazon Merkle PoW priority 2016-12-23, 60 wei) -> RuleGate ACCEPTED',
    'sponsorA',
    accA.address,
    sponsorA,
    poolAddr,
    'open_challenge',
    ['US 10,728,041 B2', '2016-12-23', JSON.stringify(hybridElements), 3600, 60, 20],
    60n,
    { followCallbacks: true }
  );
  const ch3Open = await pollChallengeUntil(sponsorA, poolAddr, 3, ['OPEN', 'REJECTED_VAGUE']);
  if (ch3Open.status !== 'OPEN') {
    throw new Error(`Expected Challenge #3 OPEN, got ${ch3Open.status}`);
  }

  // Sub #3: Wikipedia Merkle_tree rev 333954216 (2009-12-25) -> E0 DISCLOSED, E1 NOT_DISCLOSED -> DISQUALIFIED
  await runStep(
    'C3_SUBMIT_WIKI',
    'Researcher 1 submits Wikipedia Merkle_tree permanent rev 333954216 (2009-12-25, 20 wei bond)',
    'researcher1',
    accR1.address,
    researcher1,
    poolAddr,
    'submit_prior_art',
    [3, 'Wikipedia: Merkle tree permanent revision 333954216 (2009-12-25)', WIKI_MERKLE_2009_URL],
    20n
  );
  await runStep(
    'C3_WIKI_E0',
    'Map Element 0 (Merkle hash trees) on Wikipedia rev 333954216 -> DISCLOSED',
    'researcher1',
    accR1.address,
    researcher1,
    poolAddr,
    'map_claim_element',
    [3, 0, 'peer-to-peer network'],
    0n,
    { followCallbacks: true }
  );
  await pollSubmissionElementUntil(sponsorA, poolAddr, 3, 0);

  await runStep(
    'C3_WIKI_E1',
    'Map Element 1 (SHA1 partial hash-collision stamp) on Wikipedia rev 333954216 -> NOT_DISCLOSED (disqualified)',
    'researcher1',
    accR1.address,
    researcher1,
    poolAddr,
    'map_claim_element',
    [3, 1, 'Hash trees'],
    0n,
    { followCallbacks: true }
  );
  const sub3Final = await pollSubmissionElementUntil(sponsorA, poolAddr, 3, 1);
  if (sub3Final.status !== 'DISQUALIFIED_NOT_DISCLOSED') {
    throw new Error(`Expected Sub #3 DISQUALIFIED_NOT_DISCLOSED, got ${sub3Final.status}`);
  }

  // Sub #4: Archive.org id_ + CDX (Hashcash FAQ, 2004-03-26) -> E1 DISCLOSED (CDX verified), THEN E0 NOT_DISCLOSED -> DISQUALIFIED (complete symmetry!)
  await runStep(
    'C3_SUBMIT_ARCHIVE',
    'Researcher 2 submits Archive.org raw id_ capture (Hashcash FAQ, 2004-03-26, 20 wei bond)',
    'researcher2',
    accR2.address,
    researcher2,
    poolAddr,
    'submit_prior_art',
    [3, 'Archive.org (2004-03-26 id_): Adam Back Hashcash FAQ', ARCHIVE_HASHCASH_2004_URL],
    20n
  );
  await runStep(
    'C3_ARCHIVE_E1',
    'Map Element 1 (SHA1 partial hash-collisions) on Archive.org id_ + CDX -> DISCLOSED (cdx_verified=true)',
    'researcher2',
    accR2.address,
    researcher2,
    poolAddr,
    'map_claim_element',
    [4, 1, 'partial hash-collisions'],
    0n,
    { followCallbacks: true }
  );
  const sub4E1 = await pollSubmissionElementUntil(sponsorA, poolAddr, 4, 1);
  if (sub4E1.elements[1].verdict !== 'DISCLOSED' || !sub4E1.elements[1].cdx_verified) {
    throw new Error(`Expected Sub #4 E1 DISCLOSED + cdx_verified, got ${JSON.stringify(sub4E1.elements[1])}`);
  }

  await runStep(
    'C3_ARCHIVE_E0',
    'Map Element 0 (P2P Merkle hash trees) on Hashcash FAQ -> NOT_DISCLOSED (completes All-Elements symmetry!)',
    'researcher2',
    accR2.address,
    researcher2,
    poolAddr,
    'map_claim_element',
    [4, 0, 'partial hash-collisions'],
    0n,
    { followCallbacks: true }
  );
  const sub4Final = await pollSubmissionElementUntil(sponsorA, poolAddr, 4, 0);
  if (sub4Final.status !== 'DISQUALIFIED_NOT_DISCLOSED') {
    throw new Error(`Expected Sub #4 DISQUALIFIED_NOT_DISCLOSED, got ${sub4Final.status}`);
  }

  // Sub #5: Post-Dated IETF RFC 9162 (Dec 2021 >= priority 2016-12-23) -> Deterministic plain-code POST_DATED!
  await runStep(
    'C4_SUBMIT_RFC9162',
    'Researcher 2 submits post-dated IETF RFC 9162 (Dec 2021 vs priority 2016-12-23, 20 wei bond)',
    'researcher2',
    accR2.address,
    researcher2,
    poolAddr,
    'submit_prior_art',
    [3, 'IETF RFC 9162: Certificate Transparency v2.0 (Dec 2021 — Post-Dated)', RFC_9162_2021_URL],
    20n
  );
  await runStep(
    'C4_MAP_POSTDATED',
    'Map Element 0 on RFC 9162 -> Deterministic POST_DATED rejection in plain Python + 20 wei bond forfeited',
    'researcher2',
    accR2.address,
    researcher2,
    poolAddr,
    'map_claim_element',
    [5, 0, 'Certificate Transparency'],
    0n,
    { followCallbacks: true }
  );
  const sub5Final = await pollSubmissionElementUntil(sponsorA, poolAddr, 5, 0);
  if (sub5Final.status !== 'DISQUALIFIED_POST_DATED') {
    throw new Error(`Expected Sub #5 DISQUALIFIED_POST_DATED, got ${sub5Final.status}`);
  }

  // =========================================================================
  // CASE 5 & 6: Historical 2025 Priority Date + Genuine Prompt Injection Defense
  //             (Wikipedia Prompt_injection rev 1289403591, 2025-05-08 < 2025-11-01)
  //             + Deterministic Timeout Fallback & Real EOA Pro-Rata Refunds (+72 / +48 wei!)
  // =========================================================================
  console.log('\n========= CASE 5 & 6: Prompt Injection (2025-05-08) + Pro-Rata Timeout Refund =========');
  await runStep(
    'C5_OPEN_EXPIRING',
    'Sponsor A opens Challenge #4 (US-2025-1101-SEC, priority 2025-11-01, 240s+20s, 60 wei) -> RuleGate ACCEPTED',
    'sponsorA',
    accA.address,
    sponsorA,
    poolAddr,
    'open_challenge',
    ['US-2025-1101-SEC', '2025-11-01', JSON.stringify(hmacElements), 240, 20, 20],
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
    accB.address,
    sponsorB,
    poolAddr,
    'contribute_bounty',
    [4],
    40n
  );

  await runStep(
    'C5_SUBMIT_INJECTION',
    'Attacker submits Wikipedia Prompt_injection rev 1289403591 (2025-05-08, literal "Ignore the above directions...")',
    'researcher2',
    accR2.address,
    researcher2,
    poolAddr,
    'submit_prior_art',
    [
      4,
      'Wikipedia: Prompt injection rev 1289403591 (2025-05-08 — Adversarial Injection Excerpt)',
      WIKI_PROMPT_INJ_2025_URL,
    ],
    20n
  );
  await runStep(
    'C5_MAP_INJECTION',
    'Map Element 0 anchored at "Ignore the above directions" -> Injection defeated (NOT_DISCLOSED), 20 wei bond forfeited',
    'researcher2',
    accR2.address,
    researcher2,
    poolAddr,
    'map_claim_element',
    [6, 0, 'Ignore the above directions'],
    0n,
    { followCallbacks: true }
  );
  const sub6Final = await pollSubmissionElementUntil(sponsorA, poolAddr, 6, 0);
  if (sub6Final.status !== 'DISQUALIFIED_NOT_DISCLOSED') {
    throw new Error(`Expected Sub #6 DISQUALIFIED_NOT_DISCLOSED, got ${sub6Final.status}`);
  }

  const ch4Now = await readJson(sponsorA, poolAddr, 'get_challenge', [4]);
  const graceDeadlineSec = Number(ch4Now.grace_deadline);
  const waitSec = graceDeadlineSec - Math.floor(Date.now() / 1000) + 15;
  if (waitSec > 0) {
    console.log(`  [WAIT] Waiting ${waitSec}s for Challenge #4 grace_deadline (${graceDeadlineSec}) to elapse...`);
    await sleep(waitSec * 1000);
  }

  await runStep(
    'C6_EXPIRE_CHALLENGE',
    'Deterministic timeout fallback: expire_challenge(4) allocates 120 wei pro-rata (72 Sponsor A / 48 Sponsor B)',
    'sponsorA',
    accA.address,
    sponsorA,
    poolAddr,
    'expire_challenge',
    [4],
    0n
  );

  await runStep(
    'C6_REFUND_SPONSOR_A',
    'Sponsor A claims 60% pro-rata refund via EthSend (real EOA balance +72 wei verified)',
    'sponsorA',
    accA.address,
    sponsorA,
    poolAddr,
    'claim_pro_rata_refund',
    [4],
    0n,
    { followCallbacks: true, isNativeEthTransfer: true, expectedEoaDeltaWei: 72n }
  );

  await runStep(
    'C6_REFUND_SPONSOR_B',
    'Sponsor B claims 40% pro-rata refund via EthSend (real EOA balance +48 wei verified)',
    'sponsorB',
    accB.address,
    sponsorB,
    poolAddr,
    'claim_pro_rata_refund',
    [4],
    0n,
    { followCallbacks: true, isNativeEthTransfer: true, expectedEoaDeltaWei: 48n }
  );

  // =========================================================================
  // SNAPSHOT COMPLETE ON-CHAIN STATE & WRITE deploy/proof.json
  // =========================================================================
  console.log('\n================ FINALIZING deploy/proof.json (v2) ================');
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
    await readJson(sponsorA, poolAddr, 'get_submission', [6]),
  ];

  const sourceCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  const probeBlob = execSync('git hash-object contracts/evidence_probe.py', { encoding: 'utf-8' }).trim();
  const poolBlob = execSync('git hash-object contracts/prior_art_pool.py', { encoding: 'utf-8' }).trim();
  const judgeBlob = execSync('git hash-object contracts/prior_art_judge.py', { encoding: 'utf-8' }).trim();

  const probeReport = fs.existsSync(path.resolve('deploy/probe_report.json'))
    ? JSON.parse(fs.readFileSync(path.resolve('deploy/probe_report.json'), 'utf-8'))
    : null;

  const proof = {
    project: 'PriorArtPool',
    version: '2.0.0-hardened',
    network: {
      name: 'GenLayer StudioNet',
      chainId: STUDIONET_CHAIN_ID,
      rpcUrl: STUDIONET_RPC,
      explorerBaseUrl: STUDIONET_EXPLORER,
      runner: 'py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6',
    },
    sourceCommit,
    liveFrontendUrl: 'https://prior-art-pool.vercel.app',
    repositoryUrl: 'https://github.com/khezzed/Prior-Art-Pool',
    generatedAt: new Date().toISOString(),
    contracts: {
      evidenceProbe: {
        address: finalState.probeAddress,
        deployTx: finalState.probeDeployTx,
        sourcePath: 'contracts/evidence_probe.py',
        gitBlobSha1: probeBlob,
        sourceSha256: sha256(fs.readFileSync(path.resolve('contracts/evidence_probe.py'), 'utf-8')),
      },
      priorArtPool: {
        address: poolAddr,
        deployTx: finalState.poolDeployTx,
        wireTx: finalState.wireJudgeTx,
        sourcePath: 'contracts/prior_art_pool.py',
        gitBlobSha1: poolBlob,
        sourceSha256: sha256(fs.readFileSync(path.resolve('contracts/prior_art_pool.py'), 'utf-8')),
      },
      priorArtJudge: {
        address: judgeAddr,
        deployTx: finalState.judgeDeployTx,
        sourcePath: 'contracts/prior_art_judge.py',
        gitBlobSha1: judgeBlob,
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
  console.log('✓ Wrote complete v2 hardened live proof manifest to deploy/proof.json');
}

main().catch((err) => {
  console.error('Demo run failed:', err);
  process.exit(1);
});

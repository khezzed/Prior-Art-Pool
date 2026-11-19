export interface ElementJudgment {
  index: number;
  status: string;
  anchor_text: string;
  verdict: string;
  pub_date_iso: string;
  source_type: string;
  cdx_verified: boolean;
  slice_digest: string;
  verbatim_quote: string;
  reason: string;
}

export interface SubmissionRecord {
  id: number;
  challenge_id: number;
  researcher: string;
  reference_title: string;
  reference_url: string;
  submitted_at: number;
  submitted_date_iso: string;
  bond_wei: number;
  status: string;
  disqualified_reason: string;
  elements: ElementJudgment[];
}

export interface ChallengeRecord {
  id: number;
  creator: string;
  patent_ref: string;
  priority_date_iso: string;
  elements: string[];
  rules_digest: string;
  status: string;
  created_at: number;
  vetting_deadline: number;
  duration_seconds: number;
  grace_period_seconds: number;
  opened_at: number;
  expires_at: number;
  grace_deadline: number;
  min_bond_wei: number;
  pool_wei: number;
  total_contributed_wei: number;
  forfeited_bonds_wei: number;
  contributions: Record<string, number>;
  pro_rata_owed: Record<string, number>;
  pro_rata_claimed: Record<string, boolean>;
  vetting_result: { verdict?: string; reason?: string; rules_digest?: string };
  winner_submission_id: number;
  winner: string;
}

export interface AccountingSummary {
  total_pool_locked: number;
  total_bonds_held: number;
  total_claimable: number;
  total_refundable: number;
  total_inbound: number;
  total_outbound: number;
  net_liabilities: number;
  net_flow: number;
  invariant_holds: boolean;
}

export interface ProofStep {
  stepId: string;
  label: string;
  actor: string;
  method: string;
  txHash: string;
  childTxHashes: string[];
  status: string;
  executionResult: string;
  returnValue: unknown;
  expectedFailure?: boolean;
}

export interface ProofManifest {
  project: string;
  network: {
    name: string;
    chainId: number;
    rpcUrl: string;
    explorerBaseUrl: string;
    runner: string;
  };
  sourceCommit: string;
  generatedAt: string;
  contracts: {
    evidenceProbe: { address: string; deployTx: string; sourcePath: string; sourceSha256: string };
    priorArtPool: { address: string; deployTx: string; wireTx: string; sourcePath: string; sourceSha256: string };
    priorArtJudge: { address: string; deployTx: string; sourcePath: string; sourceSha256: string };
  };
  actors: Record<string, string>;
  probeSummary: Record<string, any>;
  poolContractBalanceWei: string;
  accountingSummary: AccountingSummary;
  protocolConfig: {
    owner: string;
    judge_address: string;
    vetting_timeout_seconds: number;
    challenge_count: number;
    submission_count: number;
  };
  challenges: ChallengeRecord[];
  submissions: SubmissionRecord[];
  steps: ProofStep[];
}

export type TxLifecycleState =
  | 'submitted'
  | 'pending'
  | 'accepted'
  | 'finalized-success'
  | 'finalized-error';

export interface TrackedTx {
  hash: string;
  label: string;
  method: string;
  createdAt: number;
  state: TxLifecycleState;
  consensusResult?: string;
  returnReadable?: string;
  errorDetail?: string;
  childTxHashes: string[];
  childStates: Record<string, TxLifecycleState>;
}

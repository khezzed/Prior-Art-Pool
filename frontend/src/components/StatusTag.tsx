import React from 'react';
import { cn } from '../lib/utils';

// Primitive status marker: skeleton and empty state N/A by design.
export interface StatusTagProps {
  status: string;
  className?: string;
}

const HUMAN_LABELS: Record<string, string> = {
  ANTICIPATED: 'Anticipated',
  WON: 'Won',
  DISCLOSED: 'Disclosed',
  ACCEPTED: 'Accepted',
  OPEN: 'Open',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  PENDING_VETTING: 'Vetting',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
  UNMAPPED: 'Unmapped',
  REJECTED_VAGUE: 'Rejected (vague)',
  SUPERSEDED: 'Superseded',
  SUPERSEDED_REFUNDED: 'Bond reclaimed (losing racer)',
  DISQUALIFIED_NOT_DISCLOSED: 'Disqualified (missing element)',
  DISQUALIFIED_POST_DATED: 'Disqualified (post-dated)',
  NOT_DISCLOSED: 'Not disclosed',
  POST_DATED: 'Post-dated',
  INVALID_EVIDENCE: 'Invalid evidence',
};

type Tone = 'pass' | 'fail' | 'warn' | 'neutral';

function resolveTone(status: string): Tone {
  switch (status) {
    case 'ANTICIPATED':
    case 'WON':
    case 'DISCLOSED':
    case 'ACCEPTED':
      return 'pass';
    case 'REJECTED_VAGUE':
    case 'DISQUALIFIED_NOT_DISCLOSED':
    case 'DISQUALIFIED_POST_DATED':
    case 'NOT_DISCLOSED':
    case 'POST_DATED':
    case 'INVALID_EVIDENCE':
      return 'fail';
    case 'OPEN':
    case 'ACTIVE':
    case 'EXPIRED':
    case 'PENDING_VETTING':
    case 'INSUFFICIENT_EVIDENCE':
      return 'warn';
    default:
      return 'neutral';
  }
}

const TONE_STYLES: Record<Tone, { text: string; bg: string; border: string; dot: string }> = {
  pass: {
    text: 'text-pass-ink',
    bg: 'bg-pass-bg',
    border: 'border-pass-border',
    dot: 'bg-pass-ink',
  },
  fail: {
    text: 'text-fail-ink',
    bg: 'bg-fail-bg',
    border: 'border-fail-border',
    dot: 'bg-fail-ink',
  },
  warn: {
    text: 'text-warn-ink',
    bg: 'bg-warn-bg',
    border: 'border-warn-border',
    dot: 'bg-warn-ink',
  },
  neutral: {
    text: 'text-neutralst-ink',
    bg: 'bg-neutralst-bg',
    border: 'border-neutralst-border',
    dot: 'bg-neutralst-ink',
  },
};

export const StatusTag: React.FC<StatusTagProps> = ({ status, className }) => {
  const tone = resolveTone(status);
  const styles = TONE_STYLES[tone];
  const label = HUMAN_LABELS[status] || status;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-compact font-medium whitespace-nowrap',
        styles.bg,
        styles.text,
        styles.border,
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', styles.dot)} aria-hidden="true" />
      {label}
    </span>
  );
};

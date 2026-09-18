export const DEFAULT_PIPELINE_STAGES = [
  {
    code: 'new',
    name: 'New',
    sortOrder: 10,
    winProbabilityBps: 1000,
    isOpen: true,
    isWon: false,
    isLost: false,
  },
  {
    code: 'contacted',
    name: 'Contacted',
    sortOrder: 20,
    winProbabilityBps: 2500,
    isOpen: true,
    isWon: false,
    isLost: false,
  },
  {
    code: 'qualified',
    name: 'Qualified',
    sortOrder: 30,
    winProbabilityBps: 4000,
    isOpen: true,
    isWon: false,
    isLost: false,
  },
  {
    code: 'site_visit',
    name: 'Site Visit',
    sortOrder: 40,
    winProbabilityBps: 5500,
    isOpen: true,
    isWon: false,
    isLost: false,
  },
  {
    code: 'quotation',
    name: 'Quotation',
    sortOrder: 50,
    winProbabilityBps: 7000,
    isOpen: true,
    isWon: false,
    isLost: false,
  },
  {
    code: 'negotiation',
    name: 'Negotiation',
    sortOrder: 60,
    winProbabilityBps: 8500,
    isOpen: true,
    isWon: false,
    isLost: false,
  },
  {
    code: 'won',
    name: 'Won',
    sortOrder: 70,
    winProbabilityBps: 10000,
    isOpen: false,
    isWon: true,
    isLost: false,
  },
  {
    code: 'lost',
    name: 'Lost',
    sortOrder: 80,
    winProbabilityBps: 0,
    isOpen: false,
    isWon: false,
    isLost: true,
  },
] as const;

export const DEFAULT_LOSS_REASONS = [
  { code: 'price', name: 'Price' },
  { code: 'competitor', name: 'Competitor' },
  { code: 'no_response', name: 'No response' },
  { code: 'not_interested', name: 'Not interested' },
  { code: 'other', name: 'Other' },
] as const;

export type StageFlags = {
  isWon: boolean;
  isLost: boolean;
};

export function lifecycleForStage(stage: StageFlags): 'open' | 'won' | 'lost' {
  if (stage.isWon) {
    return 'won';
  }
  if (stage.isLost) {
    return 'lost';
  }
  return 'open';
}

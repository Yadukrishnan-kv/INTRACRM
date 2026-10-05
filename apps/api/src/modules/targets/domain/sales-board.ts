import type { TargetAchievement } from './target-period';

/**
 * The sales-target board: one gauge for the viewer, a ranking of everyone
 * measured against the same metric, a day-by-day trail, and the nudges that
 * close the gap. Everything here is pure — the service supplies the rows.
 */

export const BOARD_PERIODS = ['this_month', 'last_month', 'this_quarter', 'this_year'] as const;
export type BoardPeriodCode = (typeof BOARD_PERIODS)[number];

export const BOARD_PERIOD_CATALOG: Array<{ code: BoardPeriodCode; title: string }> = [
  { code: 'this_month', title: 'This Month' },
  { code: 'last_month', title: 'Last Month' },
  { code: 'this_quarter', title: 'This Quarter' },
  { code: 'this_year', title: 'This Year' },
];

export function isBoardPeriod(value: string): value is BoardPeriodCode {
  return (BOARD_PERIODS as readonly string[]).includes(value);
}

export const BOARD_SCOPES = ['me', 'team', 'tenant'] as const;
export type BoardScopeCode = (typeof BOARD_SCOPES)[number];

export const BOARD_SCOPE_CATALOG: Array<{ code: BoardScopeCode; title: string }> = [
  { code: 'me', title: 'My target' },
  { code: 'team', title: 'My team' },
  { code: 'tenant', title: 'Company' },
];

export function isBoardScope(value: string): value is BoardScopeCode {
  return (BOARD_SCOPES as readonly string[]).includes(value);
}

export type StandingInput = {
  membershipId: string;
  name: string;
  designation: string | null;
  teamName: string | null;
  targetValue: number;
  achievedValue: number;
  achievementBps: number | null;
  onTrack: boolean;
};

export type Standing = StandingInput & { rank: number };

/**
 * Competition ranking (1, 2, 2, 4) on achieved value, because that is what the
 * board is scored on. Attainment breaks a tie so a smaller quota that is
 * further along wins, and the name breaks the rest so the order is stable
 * across requests.
 */
export function rankStandings(rows: StandingInput[]): Standing[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.achievedValue !== a.achievedValue) {
      return b.achievedValue - a.achievedValue;
    }
    const aBps = a.achievementBps ?? -1;
    const bBps = b.achievementBps ?? -1;
    if (bBps !== aBps) {
      return bBps - aBps;
    }
    return a.name.localeCompare(b.name);
  });

  const ranked: Standing[] = [];
  let rank = 0;
  sorted.forEach((row, index) => {
    const previous = sorted[index - 1];
    const tied =
      previous != null &&
      previous.achievedValue === row.achievedValue &&
      (previous.achievementBps ?? -1) === (row.achievementBps ?? -1);
    rank = tied ? rank : index + 1;
    ranked.push({ ...row, rank });
  });
  return ranked;
}

/** Top three, in podium order: second, first, third — the order they are drawn. */
export function podium(standings: Standing[]): Standing[] {
  const [first, second, third] = standings;
  return [second, first, third].filter((row): row is Standing => row != null);
}

export type DailyPoint = { date: string; value: number };

export type InsightRow = {
  date: string;
  value: number;
  cumulative: number;
  /** Mean per elapsed day up to and including this one. */
  runningAverage: number;
};

export function round2(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

/**
 * The Insights table: one row per day with the value booked, the running total
 * and the average per day so far. Days are expected in ascending order.
 */
export function buildInsights(points: DailyPoint[]): InsightRow[] {
  let cumulative = 0;
  return points.map((point, index) => {
    cumulative = round2(cumulative + point.value);
    return {
      date: point.date,
      value: round2(point.value),
      cumulative,
      runningAverage: round2(cumulative / (index + 1)),
    };
  });
}

/** Mean per elapsed day. Before the period opens there is nothing to average. */
export function dailyAverage(achievedValue: number, daysElapsed: number): number {
  if (daysElapsed <= 0) {
    return 0;
  }
  return round2(achievedValue / daysElapsed);
}

export type Suggestion = {
  code: string;
  title: string;
  detail: string;
};

export type SuggestionInput = {
  achievement: TargetAchievement;
  dailyAverage: number;
  followUpCompletionBps: number | null;
  visitCompletionBps: number | null;
};

const HEALTHY_RATE_BPS = 9000;
const CLOSING_DAYS = 3;

function pct(bps: number): string {
  return `${Math.round(bps / 100)}%`;
}

/**
 * Concrete nudges, worst gap first, capped at three so the card stays readable.
 * Every suggestion names the number to move and where to move it to — a
 * suggestion the rep cannot act on is noise.
 */
export function suggestionsFor(input: SuggestionInput): Suggestion[] {
  const { achievement } = input;
  const out: Suggestion[] = [];

  const required = achievement.dailyRequired;
  if (required != null && required > input.dailyAverage && achievement.remaining > 0) {
    out.push({
      code: 'raise_daily_average',
      title: 'Lift the daily average',
      detail: `Move daily average from ${input.dailyAverage} to ${required} to land the target in ${achievement.daysRemaining} day(s).`,
    });
  }

  if (input.visitCompletionBps != null && input.visitCompletionBps < HEALTHY_RATE_BPS) {
    out.push({
      code: 'raise_visit_rate',
      title: 'Close out scheduled visits',
      detail: `Increase daily visit completion from ${pct(input.visitCompletionBps)} to ${pct(HEALTHY_RATE_BPS)}.`,
    });
  }

  if (input.followUpCompletionBps != null && input.followUpCompletionBps < HEALTHY_RATE_BPS) {
    out.push({
      code: 'raise_follow_up_rate',
      title: 'Clear the follow-up queue',
      detail: `Increase follow-up completion from ${pct(input.followUpCompletionBps)} to ${pct(HEALTHY_RATE_BPS)}.`,
    });
  }

  if (
    achievement.daysRemaining > 0 &&
    achievement.daysRemaining <= CLOSING_DAYS &&
    achievement.remaining > 0
  ) {
    out.push({
      code: 'period_closing',
      title: 'Period is closing',
      detail: `${achievement.remaining} left with ${achievement.daysRemaining} day(s) to run — prioritise deals already in negotiation.`,
    });
  }

  if (out.length === 0) {
    out.push({
      code: 'hold_pace',
      title: 'Hold the pace',
      detail:
        achievement.remaining > 0
          ? `On pace at ${input.dailyAverage} per day. Keep it steady to finish the period.`
          : 'Target met. Banked work above target carries the team score.',
    });
  }

  return out.slice(0, 3);
}

export type PaceNote = { status: 'on_track' | 'trailing'; title: string; detail: string };

/** The banner under the gauge: one line on whether the pace still lands the target. */
export function paceNote(achievement: TargetAchievement): PaceNote {
  if (achievement.onTrack) {
    const ahead = achievement.variance > 0;
    return {
      status: 'on_track',
      title: 'ON TRACK',
      detail: ahead
        ? `You are exceeding your target with a projected score above your goal.`
        : 'You are on track and meeting your target.',
    };
  }
  return {
    status: 'trailing',
    title: 'TRAILING',
    detail:
      achievement.dailyRequired == null
        ? 'The period has closed below target.'
        : `Behind pace by ${round2(Math.abs(achievement.variance))}. ${achievement.dailyRequired} per day clears the balance.`,
  };
}

/** Tradable symbols with sizing and spread assumptions for the risk calculator and journal. */
export const INSTRUMENTS = {
  XAUUSD: {
    symbol: 'XAUUSD',
    name: 'Gold',
    contractSize: 100,
    pointValue: 1,
    typicalSpread: 0.3,
    sessions: ['LONDON', 'NEW_YORK'] as const,
  },
  NAS100: {
    symbol: 'NAS100',
    name: 'Nasdaq 100',
    contractSize: 1,
    pointValue: 1,
    typicalSpread: 1,
    sessions: ['NEW_YORK'] as const,
  },
  US30: {
    symbol: 'US30',
    name: 'Dow Jones',
    contractSize: 1,
    pointValue: 1,
    typicalSpread: 3,
    sessions: ['NEW_YORK'] as const,
  },
} as const;

/** Session windows for calculator session highlighting (hours in UTC). */
export const SESSIONS = {
  ASIAN: {
    startHour: 0,
    endHour: 8,
    timezone: 'UTC',
    color: '#4A90D9',
  },
  LONDON: {
    startHour: 8,
    endHour: 16,
    timezone: 'UTC',
    color: '#7ED321',
  },
  NEW_YORK: {
    startHour: 13,
    endHour: 21,
    timezone: 'UTC',
    color: '#F5A623',
  },
  OFF_SESSION: {
    color: '#9B9B9B',
  },
} as const;

export interface InstrumentSpec {
  symbol: string;
  contractSize: number;
  pipValue: number;
  pipDecimalPlaces: number;
  description: string;
}

export const INSTRUMENT_SPECS: Record<string, InstrumentSpec> = {
  EURUSD: {
    symbol: 'EURUSD',
    contractSize: 100_000,
    pipValue: 10,
    pipDecimalPlaces: 4,
    description: 'Euro / US Dollar',
  },
  GBPUSD: {
    symbol: 'GBPUSD',
    contractSize: 100_000,
    pipValue: 10,
    pipDecimalPlaces: 4,
    description: 'British Pound / US Dollar',
  },
  AUDUSD: {
    symbol: 'AUDUSD',
    contractSize: 100_000,
    pipValue: 10,
    pipDecimalPlaces: 4,
    description: 'Australian Dollar / US Dollar',
  },
  NZDUSD: {
    symbol: 'NZDUSD',
    contractSize: 100_000,
    pipValue: 10,
    pipDecimalPlaces: 4,
    description: 'New Zealand Dollar / US Dollar',
  },
  USDCAD: {
    symbol: 'USDCAD',
    contractSize: 100_000,
    pipValue: 10,
    pipDecimalPlaces: 4,
    description: 'US Dollar / Canadian Dollar',
  },
  USDCHF: {
    symbol: 'USDCHF',
    contractSize: 100_000,
    pipValue: 10,
    pipDecimalPlaces: 4,
    description: 'US Dollar / Swiss Franc',
  },
  USDJPY: {
    symbol: 'USDJPY',
    contractSize: 100_000,
    pipValue: 1000,
    pipDecimalPlaces: 2,
    description: 'US Dollar / Japanese Yen',
  },
  XAUUSD: {
    symbol: 'XAUUSD',
    contractSize: 100,
    pipValue: 1,
    pipDecimalPlaces: 2,
    description: 'Gold / US Dollar',
  },
  XAGUSD: {
    symbol: 'XAGUSD',
    contractSize: 5000,
    pipValue: 50,
    pipDecimalPlaces: 3,
    description: 'Silver / US Dollar',
  },
  NAS100: {
    symbol: 'NAS100',
    contractSize: 1,
    pipValue: 1,
    pipDecimalPlaces: 1,
    description: 'Nasdaq 100 Index',
  },
  US30: {
    symbol: 'US30',
    contractSize: 1,
    pipValue: 1,
    pipDecimalPlaces: 1,
    description: 'Dow Jones 30 Index',
  },
  US500: {
    symbol: 'US500',
    contractSize: 1,
    pipValue: 1,
    pipDecimalPlaces: 2,
    description: 'S&P 500 Index',
  },
  UK100: {
    symbol: 'UK100',
    contractSize: 1,
    pipValue: 1,
    pipDecimalPlaces: 1,
    description: 'FTSE 100 Index',
  },
  GER40: {
    symbol: 'GER40',
    contractSize: 1,
    pipValue: 1,
    pipDecimalPlaces: 1,
    description: 'DAX 40 Index',
  },
  JP225: {
    symbol: 'JP225',
    contractSize: 1,
    pipValue: 1,
    pipDecimalPlaces: 0,
    description: 'Nikkei 225 Index',
  },
  USOIL: {
    symbol: 'USOIL',
    contractSize: 1000,
    pipValue: 10,
    pipDecimalPlaces: 2,
    description: 'WTI Crude Oil',
  },
  UKOIL: {
    symbol: 'UKOIL',
    contractSize: 1000,
    pipValue: 10,
    pipDecimalPlaces: 2,
    description: 'Brent Crude Oil',
  },
  BTCUSD: {
    symbol: 'BTCUSD',
    contractSize: 1,
    pipValue: 1,
    pipDecimalPlaces: 2,
    description: 'Bitcoin / US Dollar',
  },
  ETHUSD: {
    symbol: 'ETHUSD',
    contractSize: 1,
    pipValue: 1,
    pipDecimalPlaces: 2,
    description: 'Ethereum / US Dollar',
  },
};

export const INSTRUMENT_SYMBOL_LIST = Object.keys(INSTRUMENT_SPECS);

export function resolveInstrumentSpec(symbol: string): InstrumentSpec | null {
  const key = symbol.trim().toUpperCase();
  return INSTRUMENT_SPECS[key] ?? null;
}

export function pipSizeFromDecimalPlaces(pipDecimalPlaces: number): number {
  return 1 / 10 ** pipDecimalPlaces;
}

export function calculateUniversalLotSize(params: {
  accountSize: number;
  riskPercentage: number;
  entryPrice: number;
  stopLossPrice: number;
  pipValue: number;
  pipDecimalPlaces: number;
}): {
  lotSize: number;
  pipDistance: number;
  riskAmount: number;
  potentialLoss: number;
} | null {
  const { accountSize, riskPercentage, entryPrice, stopLossPrice, pipValue, pipDecimalPlaces } =
    params;

  if (
    accountSize <= 0 ||
    riskPercentage <= 0 ||
    pipValue <= 0 ||
    entryPrice <= 0 ||
    stopLossPrice <= 0
  ) {
    return null;
  }

  const pipSize = pipSizeFromDecimalPlaces(pipDecimalPlaces);
  const pipDistance = Math.abs(entryPrice - stopLossPrice) / pipSize;
  if (pipDistance <= 0) return null;

  const riskAmount = (accountSize * riskPercentage) / 100;
  const lotSize = Math.round((riskAmount / (pipDistance * pipValue)) * 100) / 100;
  const potentialLoss = lotSize * pipDistance * pipValue;

  return { lotSize, pipDistance, riskAmount, potentialLoss };
}

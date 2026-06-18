/**
 * Recurring high-impact USD economic events.
 * These are fixed-schedule releases that prop firm traders must monitor.
 */

export interface RecurringNewsEvent {
  id: string;
  name: string;
  currency: 'USD';
  impact: 'HIGH';
  recurring: true;
  /** Fixed day of month for monthly releases (e.g. 1st Friday uses weekOfMonth + dayOfWeek). */
  dayOfMonth?: number;
  /** Week number within the month (1 = first week, etc.). */
  weekOfMonth?: number;
  /** Day of the week (0 = Sunday, 6 = Saturday). */
  dayOfWeek?: number;
  /** Typical release time in Eastern Time. */
  typicalTime: string;
  description: string;
}

export const RECURRING_NEWS_EVENTS: RecurringNewsEvent[] = [
  {
    id: 'nfp',
    name: 'Non-Farm Payrolls',
    currency: 'USD',
    impact: 'HIGH',
    recurring: true,
    weekOfMonth: 1,
    dayOfWeek: 5,
    typicalTime: '08:30 ET',
    description:
      'Monthly report on the number of jobs added or lost in the US economy, excluding farm workers. The single most market-moving US data release.',
  },
  {
    id: 'cpi',
    name: 'CPI (Consumer Price Index)',
    currency: 'USD',
    impact: 'HIGH',
    recurring: true,
    dayOfMonth: 13,
    typicalTime: '08:30 ET',
    description:
      'Measures the average change in prices paid by consumers for a basket of goods and services. Key gauge of inflation that drives Fed policy expectations.',
  },
  {
    id: 'fomc',
    name: 'FOMC Rate Decision',
    currency: 'USD',
    impact: 'HIGH',
    recurring: true,
    weekOfMonth: 3,
    dayOfWeek: 3,
    typicalTime: '14:00 ET',
    description:
      'Federal Open Market Committee interest rate decision and policy statement. Released 8 times per year; the most impactful central bank event for USD.',
  },
  {
    id: 'gdp',
    name: 'GDP (Gross Domestic Product)',
    currency: 'USD',
    impact: 'HIGH',
    recurring: true,
    dayOfMonth: 28,
    typicalTime: '08:30 ET',
    description:
      'Quarterly measure of the total value of goods and services produced in the US. Released in advance, preliminary, and final readings.',
  },
  {
    id: 'jobless-claims',
    name: 'Initial Jobless Claims',
    currency: 'USD',
    impact: 'HIGH',
    recurring: true,
    dayOfWeek: 4,
    typicalTime: '08:30 ET',
    description:
      'Weekly count of new unemployment insurance claims. A leading indicator of labor market health released every Thursday.',
  },
  {
    id: 'pce',
    name: 'PCE Price Index',
    currency: 'USD',
    impact: 'HIGH',
    recurring: true,
    dayOfMonth: 28,
    typicalTime: '08:30 ET',
    description:
      "The Federal Reserve's preferred inflation gauge. Measures price changes for personal consumption expenditures, excluding volatile food and energy.",
  },
  {
    id: 'retail-sales',
    name: 'Retail Sales',
    currency: 'USD',
    impact: 'HIGH',
    recurring: true,
    dayOfMonth: 15,
    typicalTime: '08:30 ET',
    description:
      'Monthly measure of total receipts at retail stores. Reflects consumer spending which accounts for roughly two-thirds of US GDP.',
  },
  {
    id: 'ism-manufacturing',
    name: 'ISM Manufacturing PMI',
    currency: 'USD',
    impact: 'HIGH',
    recurring: true,
    dayOfMonth: 1,
    typicalTime: '10:00 ET',
    description:
      'Purchasing Managers Index for the manufacturing sector. A reading above 50 signals expansion; one of the earliest monthly indicators of economic health.',
  },
];

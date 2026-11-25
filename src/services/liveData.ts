import type { FinancialMetricYear, PricePoint } from '../types/terminal';
import { marketEngine, type FundamentalsPatch } from './marketEngine';
import { INITIAL_SECURITIES, WORLD_EQUITY_INDICES } from '../data/securities';
import { FX_RATES, CRYPTO_RATES, type FxRow } from '../data/fx';

// In production the app calls its own /api/market serverless function (same
// origin). During `npm run dev` there is no local serverless runtime, so fall
// back to the deployed API via env override. If both are unreachable the
// terminal keeps the built-in simulated tape, so the UI never breaks.
// Set VITE_API_BASE to pin a specific backend (e.g. staging); otherwise dev
// uses the last-known production deploy and prod uses same-origin.
const ENV_API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';
const DEV_API_BASE = 'https://bloomberg-terminal-chi-pied.vercel.app';
const API_BASE = ENV_API_BASE || (import.meta.env.DEV ? DEV_API_BASE : '');

export const SECURITY_YAHOO: Record<string, string> = {
  NVDA: 'NVDA',
  AAPL: 'AAPL',
  MSFT: 'MSFT',
  TSLA: 'TSLA',
  GS: 'GS',
  // ---- US large-cap breadth (same-symbol Yahoo mapping) ----
  AMZN: 'AMZN',
  GOOGL: 'GOOGL',
  META: 'META',
  AVGO: 'AVGO',
  ORCL: 'ORCL',
  CRM: 'CRM',
  AMD: 'AMD',
  NFLX: 'NFLX',
  ADBE: 'ADBE',
  QCOM: 'QCOM',
  INTC: 'INTC',
  JPM: 'JPM',
  V: 'V',
  MA: 'MA',
  BAC: 'BAC',
  JNJ: 'JNJ',
  LLY: 'LLY',
  UNH: 'UNH',
  MRK: 'MRK',
  ABBV: 'ABBV',
  WMT: 'WMT',
  COST: 'COST',
  HD: 'HD',
  PG: 'PG',
  KO: 'KO',
  DIS: 'DIS',
  XOM: 'XOM',
  CVX: 'CVX',
  NKE: 'NKE',
  CAT: 'CAT',
  SPY: 'SPY',
  QQQ: 'QQQ',
  RELIANCE: 'RELIANCE.NS',
  TCS: 'TCS.NS',
  INFY: 'INFY.NS',
  HDFCBANK: 'HDFCBANK.NS',
  ICICIBANK: 'ICICIBANK.NS',
  SBIN: 'SBIN.NS',
  ITC: 'ITC.NS',
  BHARTIARTL: 'BHARTIARTL.NS',
  LT: 'LT.NS',
  // ---- Additional verified NSE listings (quotes + rotating fundamentals) ----
  MCX: 'MCX.NS',
  WELCORP: 'WELCORP.NS',
  KSCL: 'KSCL.NS',
  OLAELEC: 'OLAELEC.NS',
  MEESHO: 'MEESHO.NS',
  MFSL: 'MFSL.NS',
  TCI: 'TCI.NS',
  KAYNES: 'KAYNES.NS',
  HBLENGINE: 'HBLENGINE.NS',
  POWERINDIA: 'POWERINDIA.NS',
  DIXON: 'DIXON.NS',
  CUPID: 'CUPID.NS',
  HYUNDAI: 'HYUNDAI.NS',
  NETWEB: 'NETWEB.NS',
  PINELABS: 'PINELABS.NS',
  BALRAMCHIN: 'BALRAMCHIN.NS',
  AETHER: 'AETHER.NS',
  LAURUSLABS: 'LAURUSLABS.NS',
  IFCI: 'IFCI.NS',
  CASTROLIND: 'CASTROLIND.NS',
  GROWW: 'GROWW.NS',
  HEROMOTORS: 'HEROMOTORS.NS',
  ABDL: 'ABDL.NS',
  FCL: 'FCL.NS',
  // ---- Mining consumables, EV/new-age IPOs, autos, defence/rail, renewables,
  // PSU banks, NBFCs, FMCG and pharma breadth (all Yahoo-verified .NS) ----
  TEGA: 'TEGA.NS',
  AIAENG: 'AIAENG.NS',
  ATHERENERG: 'ATHERENERG.NS',
  TVSMOTOR: 'TVSMOTOR.NS',
  ASHOKLEY: 'ASHOKLEY.NS',
  BHARATFORG: 'BHARATFORG.NS',
  UNOMINDA: 'UNOMINDA.NS',
  SONACOMS: 'SONACOMS.NS',
  TATATECH: 'TATATECH.NS',
  TATACAP: 'TATACAP.NS',
  LGEINDIA: 'LGEINDIA.NS',
  LENSKART: 'LENSKART.NS',
  KALYANKJIL: 'KALYANKJIL.NS',
  SUZLON: 'SUZLON.NS',
  COCHINSHIP: 'COCHINSHIP.NS',
  GRSE: 'GRSE.NS',
  DATAPATTNS: 'DATAPATTNS.NS',
  ZENTEC: 'ZENTEC.NS',
  PARAS: 'PARAS.NS',
  NTPCGREEN: 'NTPCGREEN.NS',
  WAAREEENER: 'WAAREEENER.NS',
  BANKBARODA: 'BANKBARODA.NS',
  UNIONBANK: 'UNIONBANK.NS',
  INDIANB: 'INDIANB.NS',
  BANKINDIA: 'BANKINDIA.NS',
  IDFCFIRSTB: 'IDFCFIRSTB.NS',
  BAJAJHFL: 'BAJAJHFL.NS',
  MMFIN: 'M&MFIN.NS',
  LTF: 'LTF.NS',
  NESTLEIND: 'NESTLEIND.NS',
  MANKIND: 'MANKIND.NS',
  SYNGENE: 'SYNGENE.NS',
  IPCALAB: 'IPCALAB.NS',
  ALKEM: 'ALKEM.NS',
  GLENMARK: 'GLENMARK.NS',
  FIRSTCRY: 'FIRSTCRY.NS',
  // ---- Extended NSE coverage (Yahoo Finance .NS suffix) ----
  MARUTI: 'MARUTI.NS',
  SUNPHARMA: 'SUNPHARMA.NS',
  BAJAJFINSV: 'BAJAJFINSV.NS',
  // Yahoo does not currently list LTIMindtree under an .NS symbol, so LTIM
  // intentionally has no live mapping and keeps its curated static values.
  TITAN: 'TITAN.NS',
  HAL: 'HAL.NS',
  TATASTEEL: 'TATASTEEL.NS',
  JSWSTEEL: 'JSWSTEEL.NS',
  BAJAJFIN: 'BAJFINANCE.NS',
  MAHINDRA: 'M&M.NS',
  ULTRACEMCO: 'ULTRACEMCO.NS',
  TRENT: 'TRENT.NS',
  ADANIENT: 'ADANIENT.NS',
  SBILIFE: 'SBILIFE.NS',
  NTPC: 'NTPC.NS',
  AXISBANK: 'AXISBANK.NS',
  KOTAKBANK: 'KOTAKBANK.NS',
  HINDUNILVR: 'HINDUNILVR.NS',
  // Yahoo uses the hyphenated NSE symbol for Bajaj Auto.
  BAJAJAUTO: 'BAJAJ-AUTO.NS',
  EICHERMOT: 'EICHERMOT.NS',
  HEROMOTOCO: 'HEROMOTOCO.NS',
  // Yahoo's NSE symbols differ from the NSE ticker for these names.
  TATAMOTORS: 'TMCV.NS',
  CANKBANK: 'CANBK.NS',
  GRASIM: 'GRASIM.NS',
  HINDALCO: 'HINDALCO.NS',
  ONGC: 'ONGC.NS',
  POWERGRID: 'POWERGRID.NS',
  HCLTECH: 'HCLTECH.NS',
  TECHM: 'TECHM.NS',
  WIPRO: 'WIPRO.NS',
  APOLLOHOSP: 'APOLLOHOSP.NS',
  DRREDDY: 'DRREDDY.NS',
  CIPLA: 'CIPLA.NS',
  DIVISLAB: 'DIVISLAB.NS',
  HDFCLIFE: 'HDFCLIFE.NS',
  ICICIGI: 'ICICIGI.NS',
  SHRIRAMFIN: 'SHRIRAMFIN.NS',
  INDUSINDBK: 'INDUSINDBK.NS',
  JIOFIN: 'JIOFIN.NS',
  DMART: 'DMART.NS',
  GODREJCP: 'GODREJCP.NS',
  BRITANNIA: 'BRITANNIA.NS',
  TATACONSUM: 'TATACONSUM.NS',
  ADANIPORTS: 'ADANIPORTS.NS',
  BHEL: 'BHEL.NS',
  ZOMATO: 'ETERNAL.NS',
  NYKAA: 'NYKAA.NS',
  PAYTM: 'PAYTM.NS',
  PIDILITIND: 'PIDILITIND.NS',
  SIEMENS: 'SIEMENS.NS',
  CUMMINSIND: 'CUMMINSIND.NS',
  HAVELLS: 'HAVELLS.NS',
  POLYCAB: 'POLYCAB.NS',
  KEI: 'KEI.NS',
  BEL: 'BEL.NS',
  AMBUJACEM: 'AMBUJACEM.NS',
  ASTRAL: 'ASTRAL.NS',
  SUPERIND: 'SUPREMEIND.NS',
  JINDALSTEL: 'JINDALSTEL.NS',
  APLAPOLLO: 'APLAPOLLO.NS',
  TIINDIA: 'TIINDIA.NS',
  INDIGO: 'INDIGO.NS',
  COALINDIA: 'COALINDIA.NS',
  BPCL: 'BPCL.NS',
  GAIL: 'GAIL.NS',
  TATAPOWER: 'TATAPOWER.NS',
  NHPC: 'NHPC.NS',
  LICI: 'LICI.NS',
  FEDERALBNK: 'FEDERALBNK.NS',
  AUBANK: 'AUBANK.NS',
  EQUITASBNK: 'EQUITASBNK.NS',
  BANDHANBNK: 'BANDHANBNK.NS',
  PNB: 'PNB.NS',
  IOB: 'IOB.NS',
  YESBANK: 'YESBANK.NS',
  PFC: 'PFC.NS',
  RECLTD: 'RECLTD.NS',
  IRFC: 'IRFC.NS',
  DLF: 'DLF.NS',
  GODREJPRO: 'GODREJPROP.NS',
  LODHA: 'LODHA.NS',
  OBEROIRLTY: 'OBEROIRLTY.NS',
  PHOENIXLTD: 'PHOENIXLTD.NS',
  MINDACORP: 'MINDSPACE.NS',
  // PARKHI (Phoenix Business Parks REIT) has no dedicated Yahoo NSE symbol;
  // it keeps curated static values instead of mirroring PHOENIXLTD.
  VRLLOG: 'VRLLOG.NS',
  TCIEXP: 'TCIEXP.NS',
  BLUEDART: 'BLUEDART.NS',
  ESCORTS: 'ESCORTS.NS',
  THERMAX: 'THERMAX.NS',
  VOLTAS: 'VOLTAS.NS',
  WHIRLPOOL: 'WHIRLPOOL.NS',
  // Yahoo does not currently list SpiceJet under an .NS symbol, so SPICEJET
  // intentionally has no live mapping and keeps its curated static values.
  SANSERA: 'SANSERA.NS',
  VMART: 'VMART.NS',
  // ---- Expanded NSE coverage: financials, IT, autos, PSU energy, defence, cement,
  // consumer, healthcare, chemicals, media, new-age listings and telecom ----
  HDFCAMC: 'HDFCAMC.NS',
  SBICARD: 'SBICARD.NS',
  ICICIPRULI: 'ICICIPRULI.NS',
  CHOLAFIN: 'CHOLAFIN.NS',
  MUTHOOTFIN: 'MUTHOOTFIN.NS',
  MANAPPURAM: 'MANAPPURAM.NS',
  PNBHOUSING: 'PNBHOUSING.NS',
  LICHSGFIN: 'LICHSGFIN.NS',
  IEX: 'IEX.NS',
  CDSL: 'CDSL.NS',
  BSE: 'BSE.NS',
  ANGELONE: 'ANGELONE.NS',
  PERSISTENT: 'PERSISTENT.NS',
  COFORGE: 'COFORGE.NS',
  MPHASIS: 'MPHASIS.NS',
  LTTS: 'LTTS.NS',
  TATAELXSI: 'TATAELXSI.NS',
  OFSS: 'OFSS.NS',
  MOTHERSON: 'MOTHERSON.NS',
  BOSCHLTD: 'BOSCHLTD.NS',
  MRF: 'MRF.NS',
  BALKRISIND: 'BALKRISIND.NS',
  EXIDEIND: 'EXIDEIND.NS',
  IOC: 'IOC.NS',
  OIL: 'OIL.NS',
  HINDPETRO: 'HINDPETRO.NS',
  PETRONET: 'PETRONET.NS',
  IGL: 'IGL.NS',
  TORNTPOWER: 'TORNTPOWER.NS',
  ADANIPOWER: 'ADANIPOWER.NS',
  JSWENERGY: 'JSWENERGY.NS',
  RVNL: 'RVNL.NS',
  IRCTC: 'IRCTC.NS',
  MAZDOCK: 'MAZDOCK.NS',
  BDL: 'BDL.NS',
  SHREECEM: 'SHREECEM.NS',
  DALBHARAT: 'DALBHARAT.NS',
  CONCOR: 'CONCOR.NS',
  PRESTIGE: 'PRESTIGE.NS',
  DABUR: 'DABUR.NS',
  MARICO: 'MARICO.NS',
  COLPAL: 'COLPAL.NS',
  EMAMILTD: 'EMAMILTD.NS',
  VBL: 'VBL.NS',
  PAGEIND: 'PAGEIND.NS',
  LUPIN: 'LUPIN.NS',
  TORNTPHARM: 'TORNTPHARM.NS',
  ZYDUSLIFE: 'ZYDUSLIFE.NS',
  BIOCON: 'BIOCON.NS',
  MAXHEALTH: 'MAXHEALTH.NS',
  VEDL: 'VEDL.NS',
  SAIL: 'SAIL.NS',
  NMDC: 'NMDC.NS',
  SRF: 'SRF.NS',
  PIIND: 'PIIND.NS',
  UPL: 'UPL.NS',
  SUNTV: 'SUNTV.NS',
  NAUKRI: 'NAUKRI.NS',
  SWIGGY: 'SWIGGY.NS',
  POLICYBZR: 'POLICYBZR.NS',
  ABFRL: 'ABFRL.NS',
  CROMPTON: 'CROMPTON.NS',
  INDHOTEL: 'INDHOTEL.NS',
  JUBLFOOD: 'JUBLFOOD.NS',
  IDEA: 'IDEA.NS',
  INDUSTOWER: 'INDUSTOWER.NS',
  // ---- Indian sector & thematic indices ----
  NIFTY50: '^NSEI',
  NIFTYBANK: '^NSEBANK',
  NIFTYIT: '^CNXIT',
  NIFTYAUTO: '^CNXAUTO',
  NIFTYPHARMA: '^CNXPHARMA',
  NIFTYFMCG: '^CNXFMCG',
  NIFTYMETAL: '^CNXMETAL',
  NIFTYENERGY: '^CNXENERGY',
  NIFTYREALTY: '^CNXREALTY',
  NIFTYPSUBANK: '^CNXPSUBANK',
  INDIAVIX: '^INDIAVIX',
  NIFTYMIDCAP: '^NSEMDCP50',
  // Yahoo has no NIFTY Smallcap 100 series, so NIFTYSMALLCAP keeps static values.
  SENSEX30: '^BSESN',
  SPX: '^GSPC',
  NDX: '^NDX',
  GOLD: 'GC=F',
  SILVER: 'SI=F',
  COPPER: 'HG=F',
  PLATINUM: 'PL=F',
  PALLADIUM: 'PA=F',
  WTI: 'CL=F',
  NATGAS: 'NG=F',
  BRENT: 'BZ=F',
  'BTC/USD': 'BTC-USD',
};

export interface AnalystAction {
  firm: string;
  fromGrade: string;
  toGrade: string;
  action: string;
  date: number | null;
}

const WORLD_YAHOO: Record<string, string> = {
  SPX: '^GSPC',
  NDX: '^NDX',
  INDU: '^DJI',
  RTY: '^RUT',
  FTSE: '^FTSE',
  DAX: '^GDAXI',
  CAC: '^FCHI',
  SX5E: '^STOXX50E',
  NIFTY: '^NSEI',
  SENSEX: '^BSESN',
  N225: '^N225',
  HSI: '^HSI',
  SHCOMP: '000001.SS',
};

const FX_YAHOO: Record<string, string> = {
  'EUR/USD': 'EURUSD=X',
  'USD/JPY': 'JPY=X',
  'GBP/USD': 'GBPUSD=X',
  'USD/INR': 'INR=X',
  'USD/CHF': 'CHF=X',
  'AUD/USD': 'AUDUSD=X',
  'USD/CAD': 'CAD=X',
  'USD/CNY': 'CNY=X',
};

const CRYPTO_YAHOO: Record<string, string> = {
  'BTC/USD': 'BTC-USD',
  'ETH/USD': 'ETH-USD',
  'SOL/USD': 'SOL-USD',
};

type Timeframe = '1D' | '5D' | '1M' | '6M' | '1Y' | '5Y';

interface RawQuote {
  price: number;
  prevClose?: number;
  change?: number;
  changePercent?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  currency?: string;
  name?: string;
  marketTime?: number;
  series?: number[];
  ytd?: number;
}

async function apiGet(params: string, timeoutMs = 9000): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}/api/market?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

// ---- subscription bus for panels holding their own data rows (WEI, FX) ----
const listeners = new Set<() => void>();
let dataVersion = 0;

export function subscribeLiveData(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLiveDataVersion(): number {
  return dataVersion;
}

function notifyChanged(): void {
  dataVersion += 1;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.warn('[liveData] listener failed:', error);
    }
  });
}

let started = false;
let quotesBusy = false;
let worldBusy = false;
let fundamentalsBusy = false;
let liveDataActive = false;
let lastQuotesAt = 0;
let lastWorldAt = 0;
let lastFundamentalsAt = 0;
let quoteFailures = 0;
let lastQuoteError: string | null = null;
// Fundamentals rotate through the universe in windows of this size (see pollFundamentals).
const FUNDAMENTALS_WINDOW = 150;
let fundamentalsOffset = 0;
let stopLiveDataImpl: () => void = () => undefined;

export interface FeedStatus {
  live: boolean;
  lastQuotesAt: number;
  lastWorldAt: number;
  lastFundamentalsAt: number;
  quoteFailures: number;
  lastQuoteError: string | null;
  quotesAgeSec: number;
  stale: boolean;
}

export function getFeedStatus(): FeedStatus {
  const now = Date.now();
  const ageSec = lastQuotesAt ? (now - lastQuotesAt) / 1000 : Infinity;
  return {
    live: liveDataActive,
    lastQuotesAt,
    lastWorldAt,
    lastFundamentalsAt,
    quoteFailures,
    lastQuoteError,
    quotesAgeSec: ageSec,
    stale: !lastQuotesAt || ageSec > 90,
  };
}

function venueOpen(timeZone: string, open: number, close: number, now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const weekday = get('weekday');
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const minutes = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
  return minutes >= open && minutes < close;
}

/**
 * Session label for the chart status strip. Uses each venue's own time zone
 * (so US daylight-saving shifts are handled) and only says "SIMULATED" when the
 * quote feed really is simulated — a closed market with a live feed shows the
 * last real close, not simulated data.
 */
export function marketSessionLabel(now = new Date(), live = liveDataActive): string {
  const usOpen = venueOpen('America/New_York', 9 * 60 + 30, 16 * 60, now);
  const nseOpen = venueOpen('Asia/Kolkata', 9 * 60 + 15, 15 * 60 + 30, now);
  if (usOpen && nseOpen) return 'US + NSE OPEN';
  if (usOpen) return 'US OPEN · NSE CLOSED';
  if (nseOpen) return 'NSE OPEN · US CLOSED';
  return live ? 'BOTH CLOSED · LAST CLOSE' : 'BOTH CLOSED · SIMULATED';
}

export function isLiveDataActive(): boolean {
  return liveDataActive;
}
function applyFxRows(
  rows: FxRow[],
  map: Record<string, string>,
  quotes: Record<string, RawQuote | undefined>
): boolean {
  let touched = false;
  for (const row of rows) {
    const yahooSymbol = map[row.pair];
    const q = yahooSymbol ? quotes[yahooSymbol] : undefined;
    if (!q || typeof q.price !== 'number' || !Number.isFinite(q.price)) continue;
    row.rate = q.price;
    if (typeof q.change === 'number' && Number.isFinite(q.change)) row.chg = q.change;
    if (typeof q.changePercent === 'number' && Number.isFinite(q.changePercent)) row.pctChg = q.changePercent;
    if (typeof q.high === 'number' && Number.isFinite(q.high)) row.high = q.high;
    if (typeof q.low === 'number' && Number.isFinite(q.low)) row.low = q.low;
    touched = true;
  }
  return touched;
}

async function pollQuotes(): Promise<void> {
  if (quotesBusy) return;
  quotesBusy = true;
  try {
    const yahooSymbols = [
      ...new Set([
        ...Object.values(SECURITY_YAHOO),
        ...Object.values(FX_YAHOO),
        ...Object.values(CRYPTO_YAHOO),
      ]),
    ];
    const data = await apiGet(`action=quotes&symbols=${encodeURIComponent(yahooSymbols.join(','))}`);
    const quotes = (data.quotes || {}) as Record<string, RawQuote | undefined>;
    let applied = 0;
    for (const [ticker, yahooSymbol] of Object.entries(SECURITY_YAHOO)) {
      const q = quotes[yahooSymbol];
      if (q && typeof q.price === 'number' && Number.isFinite(q.price)) {
        marketEngine.applyLiveQuote(ticker, q);
        applied += 1;
      }
    }
    if (applied > 0 && !liveDataActive) {
      liveDataActive = true;
      marketEngine.setLiveMode(true);
    }
    const fxTouched = applyFxRows(FX_RATES, FX_YAHOO, quotes);
    const cryptoTouched = applyFxRows(CRYPTO_RATES, CRYPTO_YAHOO, quotes);
    if (applied > 0 || fxTouched || cryptoTouched) {
      lastQuotesAt = Date.now();
      quoteFailures = 0;
      lastQuoteError = null;
      notifyChanged();
    }
  } catch (error) {
    quoteFailures += 1;
    lastQuoteError = String((error as Error)?.message ?? error);
    // If the feed is down for a sustained period, drop back to simulation so
    // the tape keeps moving instead of freezing on the last live price.
    if (quoteFailures >= 10 && liveDataActive) {
      liveDataActive = false;
      marketEngine.setLiveMode(false);
    }
    // Exponential backoff hint: skip notify; next interval still fires.
    console.warn('[liveData] quote poll failed — keeping previous values:', error);
  } finally {
    quotesBusy = false;
  }
}

async function pollWorldIndices(): Promise<void> {
  if (worldBusy) return;
  worldBusy = true;
  try {
    const data = await apiGet(
      `action=quotes&ytd=1&symbols=${encodeURIComponent(Object.values(WORLD_YAHOO).join(','))}`
    );
    const quotes = (data.quotes || {}) as Record<string, RawQuote | undefined>;
    let touched = false;
    for (const row of WORLD_EQUITY_INDICES) {
      const yahooSymbol = WORLD_YAHOO[row.ticker];
      const q = yahooSymbol ? quotes[yahooSymbol] : undefined;
      if (!q || typeof q.price !== 'number' || !Number.isFinite(q.price)) continue;
      row.value = q.price;
      if (typeof q.change === 'number' && Number.isFinite(q.change)) row.chg = q.change;
      if (typeof q.changePercent === 'number' && Number.isFinite(q.changePercent)) row.pctChg = q.changePercent;
      if (typeof q.ytd === 'number' && Number.isFinite(q.ytd)) row.ytd = q.ytd;
      // A 0 range bound means "unknown" upstream — never overwrite a real seed with it.
      if (typeof q.fiftyTwoWeekHigh === 'number' && Number.isFinite(q.fiftyTwoWeekHigh) && q.fiftyTwoWeekHigh > 0) row.high = q.fiftyTwoWeekHigh;
      if (typeof q.fiftyTwoWeekLow === 'number' && Number.isFinite(q.fiftyTwoWeekLow) && q.fiftyTwoWeekLow > 0) row.low = q.fiftyTwoWeekLow;
      touched = true;
    }
    if (touched) {
      lastWorldAt = Date.now();
      notifyChanged();
    }
  } catch (error) {
    console.warn('[liveData] world index poll failed:', error);
  } finally {
    worldBusy = false;
  }
}
async function pollFundamentals(): Promise<void> {
  if (fundamentalsBusy) return;
  fundamentalsBusy = true;
  try {
    const tickers = Object.keys(SECURITY_YAHOO);
    // The fundamentals endpoint walks symbols in small sequential chunks upstream,
    // so poll a rotating window instead of the whole universe in one request. The
    // window matches the server's MAX_FUNDAMENTAL_SYMBOLS, keeping each call at the
    // same cost as before while every name still refreshes within a cycle or two.
    const windowSize = Math.min(FUNDAMENTALS_WINDOW, tickers.length);
    const start = fundamentalsOffset % tickers.length;
    const windowTickers: string[] = [];
    for (let i = 0; i < windowSize; i++) {
      windowTickers.push(tickers[(start + i) % tickers.length]);
    }
    fundamentalsOffset = (start + windowSize) % tickers.length;

    const yahooSymbols = windowTickers.map((t) => SECURITY_YAHOO[t]);
    const data = await apiGet(
      `action=fundamentals&symbols=${encodeURIComponent(yahooSymbols.join(','))}`
    );
    const records = (data.fundamentals || {}) as Record<
      string,
      Record<string, unknown> | undefined
    >;
    let applied = 0;
    for (const ticker of windowTickers) {
      const record = records[SECURITY_YAHOO[ticker]];
      if (record && !record.error) {
        marketEngine.applyFundamentals(ticker, record as FundamentalsPatch);
        applied += 1;
      }
    }
    if (applied > 0) {
      lastFundamentalsAt = Date.now();
      notifyChanged();
    }
  } catch (error) {
    console.warn('[liveData] fundamentals poll failed — keeping curated values:', error);
  } finally {
    fundamentalsBusy = false;
  }
}

/** Fetches actual broker rating changes from Yahoo Finance's analyst history. */
export async function fetchAnalystActions(ticker: string): Promise<AnalystAction[]> {
  try {
    const yahooSymbol = SECURITY_YAHOO[ticker];
    if (!yahooSymbol) return [];
    const data = await apiGet(`action=analyst-actions&symbol=${encodeURIComponent(yahooSymbol)}`);
    return Array.isArray(data.actions) ? (data.actions as AnalystAction[]) : [];
  } catch (error) {
    console.warn('[liveData] analyst actions fetch failed:', error);
    return [];
  }
}

export interface FinancialStatementResult {
  rows: FinancialMetricYear[];
  source: 'nse' | 'yahoo';
}

/** Annual statements in millions; null signals a request failure, [] means no history. */
export async function fetchFinancialStatements(
  ticker: string
): Promise<FinancialStatementResult | null> {
  const yahooSymbol = SECURITY_YAHOO[ticker];
  const isIndianListing =
    yahooSymbol?.endsWith('.NS') ||
    INITIAL_SECURITIES.some((security) => security.ticker === ticker && security.currency === 'INR');
  if (!yahooSymbol && !isIndianListing) return { rows: [], source: 'yahoo' };
  try {
    const params = new URLSearchParams({ action: 'financials' });
    if (yahooSymbol) params.set('symbol', yahooSymbol);
    if (isIndianListing) params.set('nseSymbol', ticker);
    const data = await apiGet(
      params.toString(),
      18_000
    );
    return {
      rows: Array.isArray(data.financials) ? (data.financials as FinancialMetricYear[]) : [],
      source: data.source === 'nse-xbrl' ? 'nse' : 'yahoo',
    };
  } catch (error) {
    console.warn('[liveData] financial statement fetch failed:', error);
    return null;
  }
}

/** Real OHLCV series for the GP chart; null when unavailable (caller falls back). */
export async function fetchChartSeries(
  ticker: string,
  timeframe: Timeframe
): Promise<PricePoint[] | null> {
  const yahooSymbol = SECURITY_YAHOO[ticker];
  if (!yahooSymbol) return null;
  try {
    const data = await apiGet(`action=chart&symbol=${encodeURIComponent(yahooSymbol)}&tf=${timeframe}`);
    const points = data.points;
    if (!Array.isArray(points) || points.length < 2) return null;
    const series = points as PricePoint[];
    // Yahoo often appends a final closing-print bar (e.g. 16:00) with
    // open = high = low = close and zero volume. It made the OHLC header read
    // "O=H=L=C, VOL 0k" by default, so drop that empty trailing bar.
    const last = series[series.length - 1];
    if (
      series.length > 2 &&
      last &&
      !last.volume &&
      last.open === last.high &&
      last.high === last.low &&
      last.low === last.close
    ) {
      return series.slice(0, -1);
    }
    return series;
  } catch (error) {
    console.warn('[liveData] chart fetch failed:', error);
    return null;
  }
}

/** Live ticker headlines via our /api/market proxy (Google News RSS upstream).
 * Returns null when unavailable — callers fall back to seeded wire content.
 * Results are cached 5 min per ticker so remounts and quadrant clones share one fetch.
 */
export interface TickerNewsItem {
  headline: string;
  summary: string;
  source: string;
  timestamp: string;
  link: string;
}

const newsCache = new Map<string, { items: TickerNewsItem[]; exp: number }>();

/** Defensive clean-up of RSS summaries: removes any HTML that slipped through
 * (encoded or not) and drops summaries that only repeat the headline. */
function cleanSummary(summary: unknown, headline: string): string {
  if (typeof summary !== 'string' || !summary) return '';
  const decode = (t: string) =>
    t
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
  let text = decode(summary).replace(/<[^>]*>/g, ' ');
  // Truncated feeds can leave a dangling, unclosed tag such as '<a href="...'.
  text = text.replace(/<[^>]*$/, ' ').replace(/\s+/g, ' ').trim();
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const s = norm(text);
  const h = norm(headline);
  if (!s || s === h || s.startsWith(h) || h.startsWith(s)) return '';
  return text;
}

export async function fetchTickerNews(ticker: string, companyName?: string): Promise<TickerNewsItem[] | null> {
  const key = ticker.toUpperCase();
  const hit = newsCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.items;
  try {
    const params = new URLSearchParams({ action: 'news', ticker: key });
    if (companyName) params.set('name', companyName);
    const data = await apiGet(params.toString(), 12_000);
    const items = Array.isArray(data.news) ? (data.news as TickerNewsItem[]) : null;
    if (!items) return null;
    const clean = items
      .filter((n) => n && typeof n.headline === 'string' && typeof n.link === 'string')
      .slice(0, 15)
      .map((n) => ({ ...n, summary: cleanSummary(n.summary, n.headline) }));
    newsCache.set(key, { items: clean, exp: Date.now() + 5 * 60 * 1000 });
    // Bound the cache so a long session cycling tickers can't grow it forever.
    if (newsCache.size > 200) {
      const oldest = newsCache.keys().next();
      if (!oldest.done) newsCache.delete(oldest.value);
    }
    return clean;
  } catch (error) {
    console.warn('[liveData] ticker news fetch failed:', error);
    return null;
  }
}

/** Start polling real market data. Idempotent — safe to call from effects.
 * Returns a stop function that clears all intervals (prevents timer leaks in
 * StrictMode remounts / HMR). Polling pauses when the tab is hidden and
 * resumes on visibilitychange to save quota for 1000-client fleets.
 */
export function startLiveData(): () => void {
  if (started) return stopLiveData;
  started = true;
  const timers: Array<ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>> = [];
  let quoteTimer: ReturnType<typeof setTimeout> | null = null;
  const jitter = (base: number) => base + Math.floor(Math.random() * 2000);

  const scheduleQuotes = () => {
    void pollQuotes().finally(() => {
      if (!started) return;
      // Back off when the feed is failing: 30s → up to 5min.
      const delay = Math.min(300_000, 30_000 * Math.pow(1.5, Math.min(quoteFailures, 6)));
      quoteTimer = setTimeout(scheduleQuotes, jitter(delay));
    });
  };

  void pollWorldIndices();
  void pollFundamentals();
  scheduleQuotes();
  const hasDocument = typeof document !== 'undefined' && typeof document.addEventListener === 'function';
  const docHidden = (): boolean => {
    try {
      return typeof document !== 'undefined' && (document as Document).hidden;
    } catch {
      return false;
    }
  };
  timers.push(setInterval(() => { if (!docHidden()) void pollWorldIndices(); }, 60_000));
  timers.push(setInterval(() => { if (!docHidden()) void pollFundamentals(); }, 30 * 60_000));

  const onVisibility = () => {
    if (!docHidden()) {
      // If quotes are stale (>90s) refresh immediately on tab focus.
      if (Date.now() - lastQuotesAt > 90_000) void pollQuotes();
    }
  };
  if (hasDocument) document.addEventListener('visibilitychange', onVisibility);

  stopLiveDataImpl = () => {
    timers.forEach((t) => { clearInterval(t); clearTimeout(t as unknown as ReturnType<typeof setInterval>); });
    timers.length = 0;
    if (quoteTimer) clearTimeout(quoteTimer);
    quoteTimer = null;
    if (hasDocument) document.removeEventListener('visibilitychange', onVisibility);
  };
  return stopLiveData;
}

function stopLiveData(): void {
  started = false;
  stopLiveDataImpl();
}

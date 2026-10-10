/**
 * /api/market — Yahoo Finance proxy for the Alpha Nova terminal.
 * Actions:
 *   ?action=quotes&symbols=A,B&ytd=1   → live batch quotes (spark endpoint)
 *   ?action=chart&symbol=A&tf=1D       → OHLCV candles (chart endpoint, cached)
 *   ?action=fundamentals&symbols=A,B   → P/E, targets, ratings (quoteSummary + crumb)
 *   ?action=financials&symbol=A        → annual statements (quoteSummary + crumb)
 *   ?action=news&ticker=TCS&name=...   → ticker headlines (Google News RSS, cached)
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const YQ = 'https://query1.finance.yahoo.com';
const NSE = 'https://www.nseindia.com';
const NSE_SESSION = (globalThis.__nseSession = globalThis.__nseSession || {
  cookie: '',
  exp: 0,
});
// Allows letters, digits and the punctuation Yahoo uses in real symbols
// (^NSEI, GC=F, BRK-B, M&M.NS, BTC-USD) while still rejecting separators and
// whitespace that would let a caller smuggle extra query parameters.
const SYMBOL_RE = /^[A-Za-z0-9.^=&_-]{1,32}$/;
// Symbol batch caps. The client polls the full security universe, which now spans
// US names, ~220 NSE names and global benchmarks, so these must stay above the
// largest request it makes. Quotes are cheap (chunked 15-per-call, in parallel);
// fundamentals walk symbols sequentially upstream, so the client polls those in a
// rotating window that stays within MAX_FUNDAMENTAL_SYMBOLS.
const MAX_QUOTE_SYMBOLS = 350;
const MAX_FUNDAMENTAL_SYMBOLS = 160;
// If a quote sweep leaves at most this many symbols empty, re-request just those
// once before responding (see actionQuotes).
const RETRY_BUDGET_SYMBOLS = 80;

function baseHeaders(res) {
  // Same-origin by default; allow the configured frontend origins for
  // cross-deploy calls (dev → prod API). '*' is kept as a fallback so the
  // public demo stays reachable, but write paths don't exist (GET only).
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  res.setHeader('Access-Control-Allow-Origin', allowed.length === 1 ? allowed[0] : '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Vary', 'Origin');
}

// ---- minimal in-memory rate limit (per serverless instance) ----
// 1000 clients × 30s quote polls ≈ 33 rps fleet-wide; Vercel scales instances
// horizontally, so this is a per-instance abuse brake, not a global quota.
const RATE = (globalThis.__apiRate = globalThis.__apiRate || new Map());
function rateLimited(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anon').toString().split(',')[0].trim();
  const now = Date.now();
  const windowMs = 60_000;
  const maxHits = 120; // 2 rps avg per IP per instance
  // Evict stale windows so rotating IPs / spoofed X-Forwarded-For values can't
  // grow the map unbounded and OOM a warm instance.
  if (RATE.size > 2000) {
    for (const [key, entry] of RATE) {
      if (now - entry.start > windowMs) RATE.delete(key);
      if (RATE.size <= 1000) break;
    }
  }
  const entry = RATE.get(ip);
  if (!entry || now - entry.start > windowMs) {
    RATE.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > maxHits;
}
function send(res, status, body, cache) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cache) res.setHeader('Cache-Control', cache);
  res.status(status).send(JSON.stringify(body));
}
function parseSymbols(raw, max) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && SYMBOL_RE.test(s))
    .slice(0, max);
}
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
async function yGet(url, cookie, timeoutMs = 10000) {
  const headers = { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*' };
  if (cookie) headers.Cookie = cookie;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers, redirect: 'manual', signal: controller.signal });
    if (!r.ok) throw new Error('yahoo_http_' + r.status);
    return r.json();
  } finally {
    clearTimeout(timer);
  }
}
const r4 = (v) => (typeof v === 'number' && isFinite(v) ? +v.toFixed(4) : v);

// ---- action=quotes (batched spark endpoint, chunked upstream) ----
// Yahoo's spark endpoint rejects requests with too many symbols (~20 max),
// so we chunk at 15 and retry transient failures once.
async function fetchChunk(symbols, range, interval, attempt) {
  try {
    // Encode each symbol: the '&' in M&M.NS (and '^' in ^NSEI) must not be able to
    // terminate the query string, which silently dropped that symbol plus everything
    // after it in the same chunk.
    return await yGet(
      `${YQ}/v7/finance/spark?range=${range}&interval=${interval}&symbols=${symbols
        .map(encodeURIComponent)
        .join(',')}`
    );
  } catch (err) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 600));
      return fetchChunk(symbols, range, interval, attempt + 1);
    }
    throw err;
  }
}
async function sparkBatch(symbols, range, interval) {
  const found = {};
  const settled = await Promise.allSettled(
    chunk(symbols, 15).map((b) => fetchChunk(b, range, interval, 1))
  );
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    const items = (s.value && s.value.spark && s.value.spark.result) || [];
    for (const item of items) {
      const first = item.response && item.response[0];
      if (item.symbol && first && first.meta) found[item.symbol] = first;
    }
  }
  return found;
}
function closeSeries(item) {
  const quote = (item.indicators && item.indicators.quote && item.indicators.quote[0]) || {};
  return (quote.close || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
}
function toQuote(item, ytdItem) {
  const m = item.meta;
  const closes = closeSeries(item);
  const price = m.regularMarketPrice;
  const prev = m.chartPreviousClose ?? m.previousClose;
  const change =
    typeof price === 'number' && typeof prev === 'number' ? +(price - prev).toFixed(4) : undefined;
  const pct =
    typeof change === 'number' && prev ? +((change / prev) * 100).toFixed(4) : undefined;
  let ytd;
  if (ytdItem) {
    const ym = ytdItem.meta;
    const base = ym.chartPreviousClose ?? closeSeries(ytdItem)[0];
    if (typeof price === 'number' && typeof base === 'number' && base > 0) {
      ytd = +((price / base - 1) * 100).toFixed(2);
    }
  }
  return {
    price,
    prevClose: prev,
    change,
    changePercent: typeof pct === 'number' ? pct : m.regularMarketChangePercent,
    open: closes[0],
    high: m.regularMarketDayHigh,
    low: m.regularMarketDayLow,
    volume: m.regularMarketVolume,
    fiftyTwoWeekHigh: m.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: m.fiftyTwoWeekLow,
    currency: m.currency,
    name: m.longName || m.shortName,
    marketTime: m.regularMarketTime,
    series: closes.slice(-40),
    ytd,
  };
}
async function actionQuotes(query) {
  const symbols = parseSymbols(query.symbols, MAX_QUOTE_SYMBOLS);
  if (!symbols.length) return { status: 400, body: { error: 'no valid symbols' } };
  const wantYtd = query.ytd === '1';
  const [today, ytd] = await Promise.all([
    sparkBatch(symbols, '1d', '5m'),
    wantYtd ? sparkBatch(symbols, 'ytd', '3mo') : Promise.resolve(null),
  ]);
  // Yahoo throttles or partially fails individual parallel chunks, which would
  // otherwise cache holes at the edge for the whole s-maxage window. Re-request
  // just the symbols that came back empty. The retry is bounded by a fixed budget
  // so a total upstream outage cannot double the work for every request.
  const missing = symbols.filter((s) => !today[s]);
  if (missing.length > 0 && missing.length <= RETRY_BUDGET_SYMBOLS) {
    await new Promise((r) => setTimeout(r, 400));
    const dayRetry = await sparkBatch(missing, '1d', '5m');
    Object.assign(today, dayRetry);
    if (ytd) {
      Object.assign(ytd, await sparkBatch(missing, 'ytd', '3mo'));
    }
  }
  const quotes = {};
  for (const sym of symbols) {
    if (today[sym]) quotes[sym] = toQuote(today[sym], ytd ? ytd[sym] : null);
  }
  return {
    status: 200,
    body: { quotes, generatedAt: Date.now(), source: 'yahoo-finance' },
    cache: 's-maxage=30, stale-while-revalidate=60',
  };
}
// ---- action=chart (OHLCV candles for the GP chart, in-memory cache) ----
const TF = {
  '1D': { range: '1d', interval: '5m' },
  '5D': { range: '5d', interval: '15m' },
  '1M': { range: '1mo', interval: '1d' },
  '6M': { range: '6mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '5Y': { range: '5y', interval: '1wk' },
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const chartCache = (globalThis.__chartCache = globalThis.__chartCache || new Map());

async function actionChart(query) {
  const symbol = String(query.symbol || '');
  const tf = Object.prototype.hasOwnProperty.call(TF, query.tf) ? query.tf : '1D';
  if (!SYMBOL_RE.test(symbol)) return { status: 400, body: { error: 'bad symbol' } };
  const key = `${symbol}|${tf}`;
  const hit = chartCache.get(key);
  if (hit && hit.exp > Date.now()) {
    return { status: 200, body: hit.data, cache: 's-maxage=60' };
  }
  const { range, interval } = TF[tf];
  const json = await yGet(`${YQ}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`);
  const r0 = (json.chart && json.chart.result && json.chart.result[0]) || null;
  if (!r0) return { status: 404, body: { error: 'no data for symbol' } };
  const m = r0.meta;
  const q = (r0.indicators && r0.indicators.quote && r0.indicators.quote[0]) || {};
  const ts = r0.timestamp || [];
  const off = m.gmtoffset || 0;
  const intraday = interval.indexOf('m') !== -1 || interval.indexOf('h') !== -1;
  const points = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close ? q.close[i] : null;
    if (typeof c !== 'number' || !Number.isFinite(c)) continue;
    const o = q.open ? q.open[i] : c;
    const h = q.high ? q.high[i] : c;
    const l = q.low ? q.low[i] : c;
    const v = (q.volume && q.volume[i]) || 0;
    if (
      (o != null && (typeof o !== 'number' || !Number.isFinite(o))) ||
      (h != null && (typeof h !== 'number' || !Number.isFinite(h))) ||
      (l != null && (typeof l !== 'number' || !Number.isFinite(l))) ||
      (typeof v !== 'number' || !Number.isFinite(v))
    ) continue;
    const d = new Date((ts[i] + off) * 1000);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const time = intraday ? `${hh}:${mm}` : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
    points.push({
      time,
      open: r4(q.open ? q.open[i] : c),
      high: r4(q.high ? q.high[i] : c),
      low: r4(q.low ? q.low[i] : c),
      close: r4(c),
      volume: (q.volume && q.volume[i]) || 0,
    });
  }
  const body = {
    points,
    meta: {
      price: m.regularMarketPrice,
      currency: m.currency,
      marketTime: m.regularMarketTime,
      granularity: interval,
    },
  };
  chartCache.set(key, { data: body, exp: Date.now() + 4 * 60 * 1000 });
  // LRU-ish eviction: drop the oldest-inserted entries instead of wiping the
  // whole cache (which would thundering-herd Yahoo on the next sweep).
  if (chartCache.size > 200) {
    const excess = chartCache.size - 200;
    const keys = chartCache.keys();
    for (let i = 0; i < excess; i++) {
      const oldest = keys.next();
      if (oldest.done) break;
      chartCache.delete(oldest.value);
    }
  }
  return { status: 200, body, cache: 's-maxage=60, stale-while-revalidate=300' };
}

// ---- action=fundamentals (quoteSummary behind Yahoo crumb session) ----
const SESSION = (globalThis.__ySession = globalThis.__ySession || { cookie: '', crumb: '', exp: 0 });

async function getCrumb() {
  if (SESSION.crumb && Date.now() < SESSION.exp) return SESSION.crumb;
  const r = await fetchWithTimeout('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' }, 10000);
  const setCookies = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error('cookie_fail');
  const cr = await fetchWithTimeout(`${YQ}/v1/test/getcrumb`, { headers: { 'User-Agent': UA, Cookie: cookie } }, 10000);
  const crumb = (await cr.text()).trim();
  if (!cr.ok || !crumb || /[<>]/.test(crumb)) throw new Error('crumb_fail');
  SESSION.cookie = cookie;
  SESSION.crumb = crumb;
  SESSION.exp = Date.now() + 25 * 60 * 1000;
  return crumb;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function quoteSummary(sym, crumb, modules = 'price,summaryDetail,defaultKeyStatistics,financialData,assetProfile') {
  const url = `${YQ}/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${encodeURIComponent(modules)}&crumb=${encodeURIComponent(crumb)}`;
  const headers = { 'User-Agent': UA, Cookie: SESSION.cookie, Accept: 'application/json' };
  let r = await fetchWithTimeout(url, { headers, redirect: 'manual' }, 10000);
  if (r.status === 401 || r.status === 403) {
    SESSION.exp = 0;
    const fresh = await getCrumb();
    r = await fetchWithTimeout(url.replace(/crumb=[^&]*/, `crumb=${encodeURIComponent(fresh)}`), {
      headers: { 'User-Agent': UA, Cookie: SESSION.cookie, Accept: 'application/json' },
      redirect: 'manual',
    }, 10000);
  }
  if (!r.ok) throw new Error('summary_http_' + r.status);
  const j = await r.json();
  return (j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0]) || null;
}

const raw = (x) => (x && typeof x === 'object' && 'raw' in x ? x.raw : x);
const REC = { strong_buy: 'STRONG_BUY', buy: 'BUY', hold: 'HOLD', underperform: 'UNDERPERFORM', sell: 'SELL' };
function fmtCap(n, currency) {
  const s = currency === 'INR' ? '₹' : '$';
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return s + 'N/A';
  if (n >= 1e12) return s + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return s + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return s + (n / 1e6).toFixed(1) + 'M';
  return s + Math.round(n);
}
function mapFund(d) {
  if (!d) return null;
  const sd = d.summaryDetail || {};
  const dks = d.defaultKeyStatistics || {};
  const fd = d.financialData || {};
  const ap = d.assetProfile || {};
  const pr = d.price || {};
  const f = {};
  const setNum = (k, v) => {
    if (typeof v === 'number' && isFinite(v)) f[k] = v;
  };
  setNum('peRatio', raw(sd.trailingPE));
  setNum('fwdPe', raw(sd.forwardPE));
  setNum('eps', raw(dks.trailingEps));
  setNum('beta', raw(sd.beta));
  const dy = raw(sd.dividendYield);
  if (typeof dy === 'number') f.divYield = +(dy * 100).toFixed(2);
  const cap = raw(pr.marketCap);
  if (typeof cap === 'number' && Number.isFinite(cap) && cap >= 0) f.marketCap = fmtCap(cap, pr.currency);
  setNum('targetPrice', raw(fd.targetMeanPrice));
  setNum('targetHigh', raw(fd.targetHighPrice));
  setNum('targetLow', raw(fd.targetLowPrice));
  setNum('analystCount', raw(fd.numberOfAnalystOpinions));
  if (fd.recommendationKey && REC[fd.recommendationKey]) f.consensusRating = REC[fd.recommendationKey];
  setNum('fiftyTwoWeekHigh', raw(sd.fiftyTwoWeekHigh));
  setNum('fiftyTwoWeekLow', raw(sd.fiftyTwoWeekLow));
  if (typeof ap.sector === 'string' && ap.sector) f.sector = ap.sector;
  if (typeof ap.industry === 'string' && ap.industry) f.industry = ap.industry;
  if (typeof ap.businessSummary === 'string' && ap.businessSummary.trim().length > 60) {
    f.description = ap.businessSummary.trim();
  }
  return f;
}
async function actionFundamentals(query) {
  const symbols = parseSymbols(query.symbols, MAX_FUNDAMENTAL_SYMBOLS);
  if (!symbols.length) return { status: 400, body: { error: 'no valid symbols' } };
  const crumb = await getCrumb();
  const fundamentals = {};
  // quoteSummary is rate limited upstream, so walk the batch in small chunks
  // instead of firing every request at once. A failed symbol is recorded as an
  // error and the client simply keeps its curated fallback values for it.
  const FUND_CHUNK = 6;
  for (let i = 0; i < symbols.length; i += FUND_CHUNK) {
    const batch = symbols.slice(i, i + FUND_CHUNK);
    const settled = await Promise.allSettled(batch.map((s) => quoteSummary(s, crumb)));
    settled.forEach((r, j) => {
      fundamentals[batch[j]] =
        r.status === 'fulfilled' ? mapFund(r.value) || { error: 'empty' } : { error: String((r.reason && r.reason.message) || r.reason) };
    });
  }
  return {
    status: 200,
    body: { fundamentals, generatedAt: Date.now(), source: 'yahoo-finance' },
    cache: 's-maxage=600',
  };
}

function statementRows(container, ...keys) {
  for (const key of keys) {
    if (container && Array.isArray(container[key])) return container[key];
  }
  return [];
}
function statementValue(row, ...keys) {
  for (const key of keys) {
    const field = row && row[key];
    const value = raw(field);
    if (field && typeof field === 'object' && field.fmt === null && value === 0) continue;
    if (typeof value === 'number' && isFinite(value)) return value;
  }
  return null;
}
function statementYear(row) {
  const endDate = raw(row && row.endDate);
  // Guard null/undefined: new Date(null) is 1970, which fabricated FY1970 rows.
  if (endDate == null) return null;
  const date = typeof endDate === 'number' ? new Date(endDate * 1000) : new Date(endDate);
  return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear();
}
function toMillions(value) {
  return typeof value === 'number' ? Math.round((value / 1e6) * 100) / 100 : null;
}
function mapFinancialStatements(summary) {
  if (!summary) return [];
  const incomeRows = statementRows(
    summary.incomeStatementHistory,
    'incomeStatementHistory',
    'incomeStatementHistoryRaw'
  );
  const balanceRows = statementRows(
    summary.balanceSheetHistory,
    'balanceSheetStatements',
    'balanceSheetHistory'
  );
  const cashRows = statementRows(
    summary.cashflowStatementHistory,
    'cashflowStatements',
    'cashflowStatementHistory'
  );
  const byYear = (rows) => new Map(rows.map((row) => [statementYear(row), row]));
  const balances = byYear(balanceRows);
  const cashflows = byYear(cashRows);

  return incomeRows
    .map((row) => {
      const year = statementYear(row);
      if (!year) return null;
      const balance = balances.get(year) || {};
      const cashflow = cashflows.get(year) || {};
      const revenue = statementValue(row, 'totalRevenue', 'revenue');
      const grossProfit = statementValue(row, 'grossProfit');
      const operatingIncome = statementValue(row, 'operatingIncome', 'ebit');
      const netIncome = statementValue(row, 'netIncome', 'netIncomeCommonStockholders');
      const equity = statementValue(balance, 'totalStockholderEquity', 'stockholdersEquity', 'totalEquity');
      const operatingCashFlow = statementValue(
        cashflow,
        'totalCashFromOperatingActivities',
        'operatingCashFlow'
      );
      const capex = statementValue(cashflow, 'capitalExpenditures');
      const reportedFcf = statementValue(cashflow, 'freeCashFlow');
      const freeCashFlow = reportedFcf !== null
        ? reportedFcf
        : operatingCashFlow !== null && capex !== null
          ? capex <= 0 ? operatingCashFlow + capex : operatingCashFlow - capex
          : null;
      let totalDebt = statementValue(balance, 'totalDebt');
      if (totalDebt === null) {
        const shortLongDebt = statementValue(balance, 'shortLongTermDebt');
        const longTermDebt = statementValue(balance, 'longTermDebt');
        const shortTermDebt = statementValue(balance, 'shortTermDebt');
        totalDebt = shortLongDebt !== null
          ? shortLongDebt
          : longTermDebt !== null || shortTermDebt !== null
            ? (longTermDebt || 0) + (shortTermDebt || 0)
            : null;
      }

      return {
        year,
        period: `FY${year}`,
        revenue: toMillions(revenue),
        revenueRaw: revenue,
        netIncomeRaw: netIncome,
        revenueGrowth: null,
        grossProfit: toMillions(grossProfit),
        grossMargin: grossProfit !== null && revenue ? (grossProfit / revenue) * 100 : null,
        operatingIncome: toMillions(operatingIncome),
        operatingMargin: operatingIncome !== null && revenue ? (operatingIncome / revenue) * 100 : null,
        netIncome: toMillions(netIncome),
        netMargin: netIncome !== null && revenue ? (netIncome / revenue) * 100 : null,
        eps: statementValue(row, 'dilutedEPS', 'basicEPS'),
        freeCashFlow: toMillions(freeCashFlow),
        totalAssets: toMillions(statementValue(balance, 'totalAssets')),
        totalDebt: toMillions(totalDebt),
        equity: toMillions(equity),
        roe: equity && netIncome !== null ? (netIncome / equity) * 100 : null,
      };
    })
    .filter((row) => row && (row.revenueRaw !== null || row.netIncomeRaw !== null))
    .sort((a, b) => b.year - a.year)
    .slice(0, 5)
    .map((row, index, rows) => {
      const prior = rows[index + 1];
      const { revenueRaw, netIncomeRaw: _netIncomeRaw, ...metric } = row;
      return {
        ...metric,
        revenueGrowth: prior && prior.revenueRaw !== null && revenueRaw !== null && prior.revenueRaw !== 0
          ? ((revenueRaw / prior.revenueRaw) - 1) * 100
          : null,
      };
    });
}

async function getNseCookie() {
  if (NSE_SESSION.cookie && Date.now() < NSE_SESSION.exp) return NSE_SESSION.cookie;
  const response = await fetchWithTimeout(
    `${NSE}/companies-listing/corporate-integrated-filing?integratedType=integratedfilingfinancials`,
    {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'manual',
    },
    10000
  );
  if (!response.ok) throw new Error(`nse_session_http_${response.status}`);
  const cookieHeaders = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') || '').split(/,\s*(?=[^;,]+=)/);
  const cookie = cookieHeaders.map((value) => value.split(';')[0]).filter(Boolean).join('; ');
  if (!cookie) throw new Error('nse_session_cookie_missing');
  NSE_SESSION.cookie = cookie;
  NSE_SESSION.exp = Date.now() + 45 * 60 * 1000;
  return cookie;
}

async function nseJson(path, cookie, referer) {
  const response = await fetchWithTimeout(`${NSE}${path}`, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json, text/plain, */*',
      Referer: referer,
      Cookie: cookie,
    },
    redirect: 'manual',
  }, 10000);
  if (!response.ok) throw new Error(`nse_api_http_${response.status}`);
  return response.json();
}

function nseDate(value) {
  if (typeof value !== 'string') return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const nse = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!nse) return null;
  const months = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
  const month = months[nse[2].toUpperCase()];
  return month ? `${nse[3]}-${month}-${nse[1].padStart(2, '0')}` : null;
}

function xmlAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match ? match[1] : null;
}

function xmlChildText(xml, localName) {
  const match = xml.match(new RegExp(`<([\\w.-]+:)?${localName}\\b[^>]*>([^<]*)<`, 'i'));
  return match ? match[2].trim() : null;
}

function parseNseXbrl(xml) {
  const contexts = new Map();
  const contextPattern = /<(?:[A-Za-z_][\w.-]*:)?context\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?context\s*>/gi;
  for (const match of xml.matchAll(contextPattern)) {
    const id = xmlAttribute(match[1], 'id');
    if (!id) continue;
    const body = match[2];
    contexts.set(id, {
      start: xmlChildText(body, 'startDate'),
      end: xmlChildText(body, 'endDate'),
      instant: xmlChildText(body, 'instant'),
      dimensional: /<(?:[A-Za-z_][\w.-]*:)?(?:scenario|segment)\b/i.test(body),
    });
  }

  const facts = new Map();
  const factPattern = /<([A-Za-z_][\w.:-]*)\b([^>]*)>([^<]*)<\/\1\s*>/g;
  for (const match of xml.matchAll(factPattern)) {
    const contextId = xmlAttribute(match[2], 'contextRef');
    if (!contextId || !contexts.has(contextId) || contexts.get(contextId).dimensional) continue;
    const rawValue = match[3].trim();
    if (!rawValue || /\bxsi:nil\s*=\s*["']true["']/i.test(match[2])) continue;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    const name = match[1].split(':').pop();
    let contextFacts = facts.get(contextId);
    if (!contextFacts) {
      contextFacts = new Map();
      facts.set(contextId, contextFacts);
    }
    if (!contextFacts.has(name)) contextFacts.set(name, value);
  }
  return { contexts, facts };
}

function nseAnnualRow(xml, filingDate) {
  const { contexts, facts } = parseNseXbrl(xml);
  const yearContexts = Array.from(contexts.entries())
    .filter(([, context]) => {
      if (context.dimensional || context.end !== filingDate || !context.start) return false;
      const duration = (Date.parse(context.end) - Date.parse(context.start)) / 86_400_000;
      return duration >= 300 && duration <= 400;
    })
    .sort((a, b) => {
      const durationA = Date.parse(a[1].end) - Date.parse(a[1].start);
      const durationB = Date.parse(b[1].end) - Date.parse(b[1].start);
      return Math.abs(durationA - 365 * 86_400_000) - Math.abs(durationB - 365 * 86_400_000);
    });
  const durationContext = yearContexts[0]?.[0];
  if (!durationContext) return null;

  const endInstantContext = Array.from(contexts.entries()).find(
    ([, context]) => !context.dimensional && context.instant === filingDate
  )?.[0];
  const value = (contextId, ...names) => {
    const data = contextId ? facts.get(contextId) : null;
    if (!data) return null;
    for (const name of names) {
      if (data.has(name)) return data.get(name);
    }
    return null;
  };
  const durationValue = (...names) => value(durationContext, ...names);
  const instantValue = (...names) => value(endInstantContext, ...names);

  const revenue = durationValue('RevenueFromOperations', 'Revenue', 'Income');
  const netIncome = durationValue(
    'ProfitOrLossAttributableToOwnersOfParent',
    'ProfitLossAfterTaxesMinorityInterestAndShareOfProfitLossOfAssociates',
    'ProfitLossForPeriod',
    'ProfitLossForThePeriod',
    'ProfitLossFromOrdinaryActivitiesAfterTax',
    'ProfitLossForPeriodFromContinuingOperations'
  );
  const financeCosts = durationValue('FinanceCosts', 'FinanceCost');
  let operatingIncome = durationValue(
    'ProfitBeforeFinanceCostsAndTax',
    'OperatingProfit',
    'ProfitFromOperations',
    'OperatingProfitBeforeProvisionAndContingencies'
  );
  if (operatingIncome == null) {
    const profitBeforeTax = durationValue(
      'ProfitBeforeExceptionalItemsAndTax',
      'ProfitBeforeExtraordinaryItemsAndTax',
      'ProfitLossFromOrdinaryActivitiesBeforeTax',
      'ProfitBeforeTax'
    );
    if (profitBeforeTax != null) operatingIncome = profitBeforeTax + (financeCosts || 0);
  }

  let grossProfit = durationValue('GrossProfit', 'GrossProfitLoss');
  if (grossProfit == null && revenue != null) {
    const costNames = [
      'CostOfMaterialsConsumed',
      'PurchasesOfStockInTrade',
      'ChangesInInventoriesOfFinishedGoodsWorkInProgressAndStockInTrade',
    ];
    const costValues = costNames.map((name) => durationValue(name));
    if (costValues.some((amount) => amount != null && amount !== 0)) {
      grossProfit = revenue - costValues.reduce((sum, amount) => sum + (amount || 0), 0);
    }
  }

  const totalAssets = instantValue('Assets', 'TotalAssets');
  let totalDebt = instantValue('TotalBorrowings', 'Borrowings');
  if (totalDebt == null) {
    const currentDebt = instantValue('BorrowingsCurrent', 'CurrentBorrowings', 'ShortTermBorrowings');
    const longDebt = instantValue('BorrowingsNoncurrent', 'NoncurrentBorrowings', 'LongTermBorrowings');
    if (currentDebt != null || longDebt != null) totalDebt = (currentDebt || 0) + (longDebt || 0);
  }
  let equity = instantValue(
    'Equity',
    'EquityAttributableToOwnersOfParent',
    'TotalEquity',
    'TotalStockholdersEquity'
  );
  if (equity == null) {
    const shareCapital = instantValue('EquityShareCapital', 'PaidUpValueOfEquityShareCapital', 'Capital');
    const reserves = instantValue('OtherEquity', 'ReservesAndSurplus', 'ReservesSurplus');
    if (shareCapital != null || reserves != null) equity = (shareCapital || 0) + (reserves || 0);
  }

  const operatingCashFlow = durationValue(
    'CashFlowsFromUsedInOperatingActivities',
    'CashFlowsFromUsedInOperatingActivitiesBeforeExtraordinaryItems'
  );
  const capexItems = [
    'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities',
    'PurchaseOfTangibleAssetsClassifiedAsInvestingActivities',
    'PurchaseOfPropertyPlantAndEquipment',
    'PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities',
    'PurchaseOfIntangibleAssets',
  ].map((name) => durationValue(name));
  const hasCapex = capexItems.some((amount) => amount != null);
  const freeCashFlow = operatingCashFlow != null && hasCapex
    ? operatingCashFlow - capexItems.reduce((sum, amount) => sum + Math.abs(amount || 0), 0)
    : null;
  const eps = durationValue(
    'DilutedEarningsLossPerShareFromContinuingAndDiscontinuedOperations',
    'DilutedEarningsLossPerShareFromContinuingOperations',
    'DilutedEarningsPerShareAfterExtraordinaryItems',
    'DilutedEarningsPerShareBeforeExtraordinaryItems',
    'BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations',
    'BasicEarningsLossPerShareFromContinuingOperations',
    'BasicEarningsPerShareAfterExtraordinaryItems',
    'BasicEarningsPerShareBeforeExtraordinaryItems'
  );

  const toMillions = (amount) => amount == null ? null : Math.round((amount / 1e6) * 100) / 100;
  const year = Number(filingDate.slice(0, 4));
  if (revenue == null && netIncome == null && eps == null) return null;
  return {
    period: `FY${year}`,
    revenue: toMillions(revenue),
    revenueGrowth: null,
    grossProfit: toMillions(grossProfit),
    grossMargin: grossProfit != null && revenue ? (grossProfit / revenue) * 100 : null,
    operatingIncome: toMillions(operatingIncome),
    operatingMargin: operatingIncome != null && revenue ? (operatingIncome / revenue) * 100 : null,
    netIncome: toMillions(netIncome),
    netMargin: netIncome != null && revenue ? (netIncome / revenue) * 100 : null,
    eps,
    freeCashFlow: toMillions(freeCashFlow),
    totalAssets: toMillions(totalAssets),
    totalDebt: toMillions(totalDebt),
    equity: toMillions(equity),
    roe: equity && netIncome != null ? (netIncome / equity) * 100 : null,
  };
}

async function fetchNseFinancialStatements(symbol) {
  const cookie = await getNseCookie();
  const referer = `${NSE}/companies-listing/corporate-integrated-filing?integratedType=integratedfilingfinancials`;
  const integratedPath = `/api/integrated-filing-results?type=${encodeURIComponent('Integrated Filing- Financials')}&index=equities&symbol=${encodeURIComponent(symbol)}&page=1&size=100`;
  const annualPath = `/api/corporates-financial-results?index=equities&symbol=${encodeURIComponent(symbol)}&period=Annual`;
  const [integratedResult, annualResult] = await Promise.allSettled([
    nseJson(integratedPath, cookie, referer),
    nseJson(annualPath, cookie, `${NSE}/companies-listing/corporate-filings-financial-results`),
  ]);
  const integrated = integratedResult.status === 'fulfilled' ? integratedResult.value : {};
  const annual = annualResult.status === 'fulfilled' ? annualResult.value : [];
  const filings = [];
  for (const row of Array.isArray(integrated.data) ? integrated.data : []) {
    if (String(row.consolidated || '').toLowerCase() !== 'consolidated') continue;
    const date = nseDate(row.qe_Date);
    if (date && date.endsWith('-03-31')) filings.push({ date, xbrl: row.xbrl });
  }
  for (const row of Array.isArray(annual) ? annual : []) {
    if (String(row.consolidated || '').toLowerCase() !== 'consolidated') continue;
    if (String(row.period || '').toLowerCase() !== 'annual') continue;
    const date = nseDate(row.toDate);
    if (date && date.endsWith('-03-31')) filings.push({ date, xbrl: row.xbrl });
  }

  const byYear = new Map();
  filings.sort((a, b) => b.date.localeCompare(a.date));
  for (const filing of filings) {
    let url;
    try {
      url = new URL(filing.xbrl);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' || url.hostname !== 'nsearchives.nseindia.com' || !url.pathname.endsWith('.xml')) continue;
    const year = filing.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, { ...filing, xbrl: url.toString() });
  }

  const selected = Array.from(byYear.values()).slice(0, 4);
  const settledXml = await Promise.allSettled(
    selected.map(async (filing) => {
      const response = await fetch(filing.xbrl, {
        headers: { 'User-Agent': UA, Referer: NSE },
        redirect: 'manual',
      });
      if (!response.ok) throw new Error(`nse_xbrl_http_${response.status}`);
      const xml = await response.text();
      if (xml.length > 15_000_000) throw new Error('nse_xbrl_too_large');
      return nseAnnualRow(xml, filing.date);
    })
  );
  const rows = settledXml
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value)
    .sort((a, b) => b.period.localeCompare(a.period));
  return rows.map((row, index) => {
    const prior = rows[index + 1];
    return {
      ...row,
      revenueGrowth:
        prior?.revenue != null && prior.revenue !== 0 && row.revenue != null
          ? ((row.revenue / prior.revenue) - 1) * 100
          : null,
    };
  });
}

async function actionFinancialStatements(query) {
  const symbol = parseSymbols(query.symbol, 1)[0];
  const nseSymbol = String(query.nseSymbol || '').trim().toUpperCase();
  if (nseSymbol && /^[A-Z0-9&.-]{1,24}$/.test(nseSymbol)) {
    try {
      const rows = await fetchNseFinancialStatements(nseSymbol);
      if (rows.length) {
        return {
          status: 200,
          body: {
            symbol: nseSymbol,
            financials: rows,
            generatedAt: Date.now(),
            source: 'nse-xbrl',
            unit: 'millions',
          },
          cache: 's-maxage=21600, stale-while-revalidate=86400',
        };
      }
    } catch (error) {
      console.warn('[market] NSE annual filings unavailable; trying Yahoo fallback:', error);
    }
  }
  if (!symbol) return { status: 400, body: { error: 'no valid symbol' } };
  const crumb = await getCrumb();
  const summary = await quoteSummary(
    symbol,
    crumb,
    'incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory'
  );
  return {
    status: 200,
    body: {
      symbol,
      financials: mapFinancialStatements(summary),
      generatedAt: Date.now(),
      source: 'yahoo-finance',
      unit: 'millions',
    },
    cache: 's-maxage=3600, stale-while-revalidate=21600',
  };
}

async function actionAnalystActions(query) {
  const symbol = parseSymbols(query.symbol, 1)[0];
  if (!symbol) return { status: 400, body: { error: 'no valid symbol' } };
  const crumb = await getCrumb();
  const summary = await quoteSummary(symbol, crumb, 'upgradeDowngradeHistory');
  const history = summary?.upgradeDowngradeHistory?.history;
  const actions = Array.isArray(history)
    ? history
        .filter((item) => item && typeof item.firm === 'string' && typeof item.toGrade === 'string')
        .map((item) => ({
          firm: item.firm,
          fromGrade: typeof item.fromGrade === 'string' ? item.fromGrade : '',
          toGrade: item.toGrade,
          action: typeof item.action === 'string' ? item.action : '',
          date: typeof item.epochGradeDate === 'number' ? item.epochGradeDate * 1000 : null,
        }))
        .slice(0, 100)
    : [];
  return {
    status: 200,
    body: { symbol, actions, generatedAt: Date.now(), source: 'yahoo-finance' },
    cache: 's-maxage=300, stale-while-revalidate=900',
  };
}

// ---- action=news (ticker headlines via Google News RSS, in-memory cache) ----
// Why Google News RSS and not Yahoo/Investing: Yahoo Finance exposes no free
// news endpoint (yfinance is a Python scraping library, not a web API), and
// Investing.com has no public API and blocks scraping. Google News RSS is
// keyless, rate-friendly, and designed for syndication, so the server fetches
// and trims it while the client never touches Google directly (no CORS pain).
const newsCache = (globalThis.__newsCache = globalThis.__newsCache || new Map());

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRssItems(xml) {
  const items = [];
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi;
  for (const match of xml.matchAll(itemPattern)) {
    const body = match[1];
    const tag = (name) => {
      const m = body.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, 'i'));
      return m ? m[1].trim() : '';
    };
    // <source name="...">Outlet</source> or <source url="...">Outlet</source>
    const sourceMatch = body.match(/<source\b([^>]*)>([\s\S]*?)<\/source\s*>/i);
    const sourceAttrs = sourceMatch ? sourceMatch[1] : '';
    const sourceName = sourceMatch
      ? (xmlAttribute(sourceAttrs, 'name') || stripHtml(sourceMatch[2]))
      : '';
    const rawTitle = stripHtml(tag('title'));
    // Google appends " - Publisher" to titles; prefer the <source> outlet name.
    const headline = sourceName && rawTitle.endsWith(` - ${sourceName}`)
      ? rawTitle.slice(0, -(sourceName.length + 3))
      : rawTitle;
    const link = tag('link');
    const pubDate = tag('pubDate');
    const summary = stripHtml(tag('description')).slice(0, 280);
    if (!headline || !link) continue;
    let timestamp = pubDate;
    let sortKey = Date.parse(pubDate);
    if (Number.isNaN(sortKey)) sortKey = 0;
    else timestamp = new Date(sortKey).toUTCString().slice(5, 22);
    items.push({
      headline,
      summary: summary || headline,
      source: sourceName || 'Google News',
      timestamp,
      link,
      _t: sortKey,
    });
  }
  // Feeds are usually newest-first, but sort explicitly so the wire is always
  // chronological (latest first) regardless of upstream order.
  items.sort((a, b) => b._t - a._t);
  return items.slice(0, 15).map(({ _t, ...rest }) => rest);
}

async function actionNews(query) {
  const ticker = String(query.ticker || '').trim().toUpperCase();
  if (!/^[A-Z0-9/&.-]{1,24}$/.test(ticker)) return { status: 400, body: { error: 'bad ticker' } };
  // Company name is free text from our own universe file; strict-allowlist it so
  // it can only ever become a search string, never a URL or query smuggle.
  const name = String(query.name || '')
    .replace(/[^A-Za-z0-9\s&.,'-]/g, '')
    .trim()
    .slice(0, 80);
  const key = `${ticker}|${name}`;
  const hit = newsCache.get(key);
  if (hit && hit.exp > Date.now()) {
    return { status: 200, body: hit.data, cache: 's-maxage=300, stale-while-revalidate=600' };
  }
  // Quote the company name for precision, add the ticker + market terms so
  // "LT" doesn't return every story containing "lt" and crypto pairs stay scoped.
  const q = name ? `"${name}" ${ticker} stock` : `${ticker} stock market`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!r.ok) throw new Error('gnews_http_' + r.status);
    const xml = await r.text();
    if (xml.length > 2_000_000) throw new Error('gnews_too_large');
    const items = parseRssItems(xml);
    const body = { ticker, news: items, generatedAt: Date.now(), source: 'google-news-rss' };
    newsCache.set(key, { data: body, exp: Date.now() + 5 * 60 * 1000 });
    if (newsCache.size > 200) {
      const oldest = newsCache.keys().next();
      if (!oldest.done) newsCache.delete(oldest.value);
    }
    return { status: 200, body, cache: 's-maxage=300, stale-while-revalidate=600' };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  baseHeaders(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    send(res, 405, { error: 'method not allowed' });
    return;
  }
  if (rateLimited(req)) {
    send(res, 429, { error: 'rate limit exceeded, retry shortly' }, 's-maxage=5');
    return;
  }
  try {
    const action = String(req.query.action || 'quotes');
    let out;
    if (action === 'chart') out = await actionChart(req.query);
    else if (action === 'fundamentals') out = await actionFundamentals(req.query);
    else if (action === 'financials') out = await actionFinancialStatements(req.query);
    else if (action === 'analyst-actions') out = await actionAnalystActions(req.query);
    else if (action === 'news') out = await actionNews(req.query);
    else out = await actionQuotes(req.query);
    send(res, out.status, out.body, out.cache);
  } catch (err) {
    // Never leak upstream internals (crumb/cookie/Yahoo internals) to clients.
    console.warn('[market] upstream failure:', String((err && err.message) || err).slice(0, 200));
    send(res, 502, { error: 'market data temporarily unavailable', upstream: 'yahoo-finance' });
  }
}

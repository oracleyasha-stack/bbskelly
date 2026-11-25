import assert from 'node:assert/strict';
import test from 'node:test';
import { alignedDailyReturns, computePortfolioRisk, usdHoldings } from '../src/services/riskEngine.ts';

function lot(ticker, currency, entryPrice, currentPrice, quantity = 1) {
  return { ticker, currency, quantity, entryPrice, currentPrice, marketValue: quantity * currentPrice,
    dayPnL: quantity * (currentPrice - entryPrice), assetClass: 'EQUITY' };
}

test('mixed currencies and duplicate lots reconcile in USD', () => {
  const positions = [lot('US', 'USD', 90, 100), lot('IN', 'INR', 3600, 4000, 2)];
  const holdings = usdHoldings([...positions, positions[0]], 80);
  const risk = computePortfolioRisk({ positions: holdings });
  assert.equal(holdings.length, 2);
  assert.equal(risk.totalValue, 300);
  assert.equal(risk.totalCost, 270);
  assert.equal(risk.totalPnL, 30);
  assert.equal(risk.dayPnL, 30);
  assert.ok(Math.abs(risk.weights[1].weight - 100 / 3) < 1e-9);
});

test('historical returns match both dates and translate daily INR closes', () => {
  const holdings = usdHoldings([lot('US', 'USD', 100, 100), lot('IN', 'INR', 8000, 8000)], 80);
  const closes = {
    US: { '2026-01-05': 100, '2026-01-06': 110, '2026-01-07': 105, '2026-01-08': 120 },
    IN: { '2026-01-05': 8000, '2026-01-06': 8800, '2026-01-08': 9000 },
    'USD/INR': { '2026-01-05': 80, '2026-01-06': 88, '2026-01-08': 90 },
  };
  const returns = alignedDailyReturns(holdings, closes);
  assert.equal(returns.length, 1);
  assert.ok(Math.abs(returns[0] - 0.05) < 1e-9);
  assert.deepEqual(alignedDailyReturns(holdings, { ...closes, IN: {} }), []);
  assert.deepEqual(alignedDailyReturns(holdings, { ...closes, 'USD/INR': {} }), []);
});

test('historical VaR requires observations and uses the daily loss directly', () => {
  const positions = [lot('US', 'USD', 100, 100)];
  const returns = [-0.1, ...Array(19).fill(0.01)];
  assert.equal(computePortfolioRisk({ positions, portfolioReturns: returns.slice(1) }).var95Hist, null);
  assert.equal(computePortfolioRisk({ positions, portfolioReturns: returns }).var95Hist, 10);
});

test('chart API preserves observed dates and adjusted closes from the provider', async t => {
  const { default: handler } = await import('../api/market.js');
  const timestamp = Date.parse('2026-01-06T14:30:00Z') / 1000;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ chart: { result: [{
    meta: { gmtoffset: -18000 }, timestamp: [timestamp],
    indicators: { quote: [{ close: [100] }], adjclose: [{ adjclose: [98] }] },
  }] } }));
  let body;
  const response = {
    setHeader() {},
    status(code) { assert.equal(code, 200); return this; },
    send(json) { body = JSON.parse(json); },
  };
  await handler({ method: 'GET', headers: {}, query: { action: 'chart', symbol: 'AAPL', tf: '6M' } }, response);
  assert.equal(body.points[0].date, '2026-01-06');
  assert.equal(body.points[0].close, 100);
  assert.equal(body.points[0].adjustedClose, 98);
});

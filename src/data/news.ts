import type { NewsStory } from '../types/terminal';

export const INITIAL_NEWS: NewsStory[] = [
  {
    id: 'n-001',
    headline: 'TREASURY YIELDS HIT HIGHEST SINCE 2007 AS MARKETS PRICE ANOTHER FED HIKE; FED FUNDS AT 3.75%-4.00%',
    summary: 'The 10-year note traded at 5.16% and the 30-year at 5.49% — levels last seen in 2007 and 2004 — two weeks after the FOMC raised the target range to 3.75%-4.00% with inflation still running above goal.',
    body: `WASHINGTON (Alpha Nova) -- The Federal Open Market Committee voted 12-0 on September 16 to raise the target range for the federal funds rate by 25 basis points to 3-3/4 to 4 percent, stating that the action "will support a timelier return to the Committee's 2 percent goal" while acknowledging that "inflation remains elevated."

In its statement, the Committee described economic activity as "expanding at a solid pace," with domestic spending resilient, productivity growth strong and job gains keeping pace with the workforce.

Federal Reserve Governor Michael Barr reinforced the hawkish mid-week tone, remarking that "further policy adjustments" can be expected to bring inflation down to target. CME FedWatch currently prices roughly a 64 percent probability of another increase at the October meeting.

The bond market responded sharply: the benchmark 10-year Treasury yield rose to 5.163 percent — its highest since June 2007 — while the 30-year climbed more than 2 basis points to 5.488 percent, a level last seen in 2004. The 2-year note eased 3 basis points to 4.856 percent. Global sovereign yields followed, with Japanese government bonds, U.K. gilts and German bunds all selling off to fresh highs.

August durable goods orders came in roughly unchanged against expectations for a 0.3 percent decline, the September PMI report hit its highest reading in more than four years, and University of Michigan consumer sentiment plunged. The S&P 500 closed up 0.5 percent at 7,743.41.`,
    source: 'ALPHA NOVA',
    timestamp: '14:32:10 UTC',
    category: 'MACRO',
    urgency: 'BREAKING',
    tickers: ['SPX', 'NDX', 'US10Y', 'USD/INR'],
  },
  {
    id: 'n-002',
    headline: 'ALPHA NOVA MARKETS RAISES NVIDIA TARGET TO $345 ON RECORD $215.9B FY2026 REVENUE; BACKLOG STRETCHES INTO 2027',
    summary: 'Street consensus 12-month targets now sit near $345 — about 53% above Friday\'s $225.07 close — after NVIDIA grew full-year revenue 65% to $215.9 billion at a 71% gross margin.',
    body: `SANTA CLARA, Calif. (Alpha Nova Markets, simulated research) -- NVIDIA Corporation's fiscal 2026 (ended January 2026) delivered record revenue of $215.9 billion, up 65 percent year over year, with net income of $120.1 billion and a 71.1 percent gross margin as hyperscaler demand from Microsoft, Meta and Amazon Web Services kept advanced packaging capacity at TSMC fully booked.

Management said inferencing workloads continue to displace traditional CPU instances across tier-1 cloud providers, and supply chain checks indicate CoWoS capacity remains reserved through the next fiscal year, stretching enterprise backlog into 2027.

Alpha Nova simulated research reiterated its Conviction Buy rating and raised the 12-month price target to $345.00 from $300.00 — roughly 53 percent upside to Friday's $225.07 close — citing the enduring CUDA software moat and NVLink optical interconnects, with the average Street target now near $345.`,
    source: 'ALPHA NOVA',
    timestamp: '13:45:02 UTC',
    category: 'EQUITIES',
    urgency: 'URGENT',
    tickers: ['NVDA', 'MSFT', 'AMZN', 'AAPL'],
  },
  {
    id: 'n-003',
    headline: 'INDIA RALLY: NIFTY 50 SETTLES AT 23,140 AND SENSEX AT 73,896 AS DOMESTIC SIP FLOWS OFFSET FPI SELLING',
    summary: 'Benchmarks closed higher with the NIFTY 50 at 23,140.50 (+0.34%) and the SENSEX at 73,895.74 (+0.43%) as record monthly mutual fund inflows cushioned foreign selling driven by the global bond rout.',
    body: `MUMBAI (Alpha Nova demo) -- Indian equities finished higher, with the NIFTY 50 advancing 77.40 points to 23,140.50 and the SENSEX adding 315.20 points to 73,895.74, as Reliance Industries led heavyweight gains with the scrip up more than half a percent at Rs1,226.

Foreign portfolio investors continued to trim exposure as escalating U.S. Treasury yields — the 10-year now above 5.15 percent — diminished the allure of risk assets, but domestic mutual fund systematic investment plans, running at more than Rs23,000 crore a month, provided a persistent demand floor.

The rupee held firm at about 95.82 to the dollar, supported by resilient inflows and macro stability, while traders positioned ahead of Tata Consultancy Services' quarterly results next Thursday.`,
    source: 'ALPHA NOVA',
    timestamp: '12:15:40 UTC',
    category: 'EQUITIES',
    urgency: 'ROUTINE',
    tickers: ['NIFTY50', 'RELIANCE', 'SENSEX'],
  },
  {
    id: 'n-004',
    headline: 'GOLD DEFENDS $4,280/oz AS CENTRAL BANK BUYING OFFSETS A FIFTH STRAIGHT WEEK OF LOSSES',
    summary: 'Spot gold steadied near $4,280 after touching a record above $4,300 earlier this week, with sovereign reserve accumulation cushioning the pullback driven by surging yields and a firm dollar.',
    body: `LONDON (Alpha Nova demo) -- Spot gold held ground at approximately $4,280 per troy ounce during European trading, stabilizing after the metal's fifth consecutive weekly decline — its longest losing streak in over a year — even as it remains up sharply over the trailing twelve months.

Bullion printed a fresh all-time high above $4,300 earlier this week before profit-taking set in. World Gold Council data show sovereign central banks have remained consistent net buyers, continuing structural reserve diversification away from traditional G10 fiat holdings.

The pullback has come alongside the global bond rout, with the U.S. 10-year yield at 5.16 percent lifting the opportunity cost of holding non-yielding metal, while the dollar index firms on expectations of further Federal Reserve tightening.`,
    source: 'ALPHA NOVA',
    timestamp: '11:08:22 UTC',
    category: 'COMMODITIES',
    urgency: 'URGENT',
    tickers: ['GOLD', 'SPX', 'BRENT'],
  },
  {
    id: 'n-005',
    headline: 'BRENT HOLDS NEAR $99 AS SUPPLY DISCIPLINE OFFSETS RATE-HIKE DEMAND FEARS',
    summary: 'Crude held near $99 with Brent stabilizing after a choppy week as traders weighed demand risks from hawkish monetary policy against OPEC+ supply restraint.',
    body: `GENEVA (Alpha Nova demo) -- Brent crude futures held near $99 per barrel, stabilizing after a volatile week, as the global bond rout and the prospect of additional Federal Reserve rate hikes weighed on the outlook for fuel demand growth.

Persistent supply discipline has kept the benchmark anchored near $100 for much of the quarter, with OPEC+ ministers signalling that voluntary output restraints will remain in place through year-end even as non-OPEC production rises.

Analysts noted the feedback loop between crude and policy: "stubbornly high oil prices" are a key input keeping core inflation elevated, which in turn keeps the door open for further tightening — a dynamic that ultimately threatens consumption in the world's largest economy.`,
    source: 'ALPHA NOVA',
    timestamp: '09:50:15 UTC',
    category: 'COMMODITIES',
    urgency: 'ROUTINE',
    tickers: ['BRENT', 'GS'],
  },
  {
    id: 'n-006',
    headline: 'BITCOIN STEADIES NEAR $83,900 AS SPOT ETF INFLOWS ABSORB RATE-HIKE SELLING',
    summary: 'Digital assets traded a tight range with Bitcoin around $83,900 (-0.1%) as exchange-traded product demand from institutions offset outflows tied to the global bond sell-off.',
    body: `NEW YORK (Alpha Nova) -- Bitcoin traded close to $83,900 on Coinbase, little changed on the day after a volatile week that saw the largest digital asset absorb selling pressure tied to rising sovereign yields and a stronger dollar.

Net creations in U.S. spot Bitcoin exchange-traded funds resumed mid-week, with institutional allocations through regulated wrappers helping to offset redemptions earlier in the month. Derivatives desks reported firm open interest on CME Bitcoin futures with annualized basis in the high single digits — indicative of steady cash-and-carry demand from systematic funds.`,
    source: 'ALPHA NOVA',
    timestamp: '08:30:00 UTC',
    category: 'CRYPTO',
    urgency: 'ROUTINE',
    tickers: ['BTC/USD'],
  }
];

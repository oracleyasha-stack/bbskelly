# Alpha Nova — Market Data Workspace

A Bloomberg-style multi-asset market terminal built with React 19, Vite, TypeScript, and Tailwind CSS.

> Educational demo with simulated + live-assisted market data. Not investment advice.

## Features

- 14 terminal functions: `GP` charts, `DES` profile, `WEI` world indices, `TOP` news wire, `YCRV` yield curve, `FA` financials, `ANR` analyst targets, `OPTS` Black-Scholes pricer, `PORT` portfolio risk, `FX` currency matrix, `ECO` calendar, `MOST` movers, `IB` quant copilot, `HELP` directory
- Live quotes/charts/fundamentals/news via Yahoo Finance + Google News RSS through `/api/market`, with simulated fallback when offline
- Quadrant workspace with draggable dividers, maximize, single/split layouts, themes, ticker autocomplete, and F1–F12 shortcuts
- Portfolio persistence, chart timeframe memory, layout-size memory, and theme memory via localStorage

## Quickstart

```bash
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

## Scripts

```bash
npm run dev        # local dev server
npm run build      # typecheck + production build
npm run typecheck  # TypeScript only
npm run lint       # oxlint
npm run preview    # preview dist/ locally
```

## Deploy (Vercel)

```bash
npm run build
vercel --prod
```

`vercel.json` builds with `npm run build` and serves `dist/`. `/api/market` and `/api/health` deploy as serverless functions. Set `ALLOWED_ORIGINS` if calling the API cross-origin.

## Project layout

```text
api/                 # /api/market (Yahoo/NSE proxy) + /api/health
src/components/      # header, layout, panels, footer, error boundary
src/data/            # securities universe, news seeds, FX, curves, calendars
src/services/        # market engine, live data, quant, options, risk, audio
src/types/           # FunctionCode, Security, portfolio/news/options types
src/utils/           # money formatting (finance sign convention)
```

## Data & disclaimers

- Live data is best-effort and cached; the terminal always renders the local simulated tape when the API is unreachable.
- Chart `SIMULATED` banners mean illustrative synthetic OHLCV, not market data.
- Nothing here is investment advice.


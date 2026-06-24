# NEXUS — Adaptive Multi-Signal Trading Intelligence

**Built for Bitget AI Base Camp Hackathon S1 (Track 1 — Trading Agent)**

NEXUS is an autonomous trading agent that fuses five independent market signals — macro, sentiment, on-chain, news, and technical — into a single regime classification, routes that classification to a matching strategy, manages risk automatically, and explains every decision it makes in plain English.

🔗 **Live Demo:** https://nexus-orcin-eight.vercel.app
🔗 **Live Backend / API:** https://nexus-production-4013.up.railway.app/api/health

---

## What NEXUS Actually Does

Every 60 seconds, NEXUS runs a complete perception → decision → execution → risk loop:

1. **Perceives** — pulls a live BTCUSDT price and 5-minute candles from Bitget, plus macro, sentiment, on-chain, and news readings from Bitget Agent Hub's market-data MCP server
2. **Fuses** — combines all 5 signals into one confidence-weighted score and classifies the market as `bullish_trend`, `bearish_trend`, `ranging`, or `uncertain`
3. **Decides** — routes the regime to a matching strategy: momentum (long *or* short), mean-reversion, or capital protection
4. **Manages risk** — checks position size limits, daily trade limits, drawdown circuit-breakers, and a news-volatility guard before allowing any trade
5. **Executes** — opens/closes simulated positions with trailing stops on trending trades and realistic trading fees deducted from every result
6. **Explains** — asks Qwen (via the hackathon's sponsored endpoint) to translate the decision into a short, plain-English explanation anyone can read, with a template-based fallback if the API is unavailable

No real capital is used anywhere — this runs entirely in simulation mode, as permitted by the hackathon rules.

---

## Bitget Tools Used

| Tool | How it's used |
|---|---|
| **Bitget REST API** | Live price ticker, historical/live candles, simulated order logging |
| **Bitget WebSocket API** | Real-time price stream |
| **Bitget Agent Hub — Skill Hub** | All 4 non-technical signals (macro, sentiment, on-chain, news) via Agent Hub's official market-data MCP server (`datahub.noxiaohao.com` — confirmed in Bitget's own `agent_hub` repo as the Skill Hub's required backing server) |
| **Qwen (via `hackathon.bitgetops.com`)** | Primary natural-language trade explainer, using the hackathon's sponsored Qwen proxy |

Technical analysis (RSI, MACD, Bollinger Bands, EMA, ADX) is computed locally from real Bitget candle data rather than through Agent Hub's `technical_analysis` MCP tool, since the two are computationally equivalent and keeping it local avoids an extra network round-trip every cycle.

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│  5 Signals  │ ──▶ │ Regime Fusion │ ──▶ │ Strategy Router │ ──▶ │ Risk Manager │
│ (Agent Hub  │     │  (confidence- │     │  (long/short/   │     │ (size caps,  │
│  + local TA)│     │  weighted)    │     │  mean-reversion/│     │  drawdown,   │
└─────────────┘     └──────────────┘     │  capital protect)│     │  daily limit)│
                                          └────────────────┘     └──────┬───────┘
                                                                         ▼
                                          ┌──────────────┐     ┌──────────────────┐
                                          │  NL Explainer │ ◀── │ Execution Engine │
                                          │ (Qwen→Gemini  │     │ (trailing stops, │
                                          │  →template)   │     │  fees, PnL)      │
                                          └──────────────┘     └──────────────────┘
```

**Backend:** Node.js, TypeScript, Express, SQLite (via `sql.js`), Server-Sent Events for live updates
**Frontend:** React, TypeScript, Vite, Tailwind, Zustand, Recharts, Framer Motion
**Deployment:** Backend on Railway, frontend on Vercel

---

## Running NEXUS Locally

### Prerequisites
- Node.js 18+
- A Bitget account with an API key (Settings → API Management)
- A free Qwen key from the hackathon (sent by email after registration) or your own Qwen-compatible key
- A free Gemini API key from [aistudio.google.com](https://aistudio.google.com) (used as a backup explainer only)

### 1. Clone and install

```bash
git clone https://github.com/adeyemib05/Nexus.git
cd Nexus

cd backend
npm install

cd ../frontend
npm install
```

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

Fill in `.env` with your real values:

| Variable | Description |
|---|---|
| `BITGET_API_KEY` / `BITGET_SECRET_KEY` / `BITGET_PASSPHRASE` | Your Bitget API credentials (Read permissions are enough) |
| `BITGET_BASE_URL` | `https://api.bitget.com` |
| `QWEN_API_KEY` | Your hackathon-issued Qwen key |
| `QWEN_BASE_URL` | `https://hackathon.bitgetops.com/v1` |
| `QWEN_MODEL` | `qwen3.6-plus` |
| `GEMINI_API_KEY` | Backup explainer key |
| `GEMINI_MODEL` | `gemini-2.0-flash` |
| `ALLOWED_ORIGINS` | `http://localhost:5173` for local dev |
| `AGENT_SYMBOL` | `BTCUSDT` |
| `AGENT_MODE` | `simulation` |
| `AGENT_LOOP_INTERVAL_SECONDS` | `60` |
| `INITIAL_PORTFOLIO_USD` | `10000` |
| `MAX_POSITION_SIZE_PCT` | `0.02` |
| `MAX_DRAWDOWN_LIMIT` | `0.10` |
| `TRAILING_STOP_ACTIVATION_PCT` | `0.015` |
| `TRAILING_STOP_DISTANCE_PCT` | `0.01` |
| `TAKE_PROFIT_EXTENSION_PCT` | `0.02` |
| `TRADING_FEE_PCT` | `0.001` |

### 3. Run the backend

```bash
npm run dev
```

You should see the agent connect to Bitget's WebSocket and start logging cycles every 60 seconds. Verify it's alive:

```bash
curl http://localhost:3001/api/health
```

### 4. Run the frontend

In a separate terminal:

```bash
cd frontend
echo "VITE_API_URL=http://localhost:3001" > .env.local
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

---

## Project Structure

```
backend/src/
  agents/        — agentCycle (orchestrator), strategyRouter, riskManager,
                   executionEngine, nlExplainer, database
  signals/       — technicalSignal (local), mcpSignals (Agent Hub),
                   signalFusion (regime classification)
  services/      — bitgetREST, bitgetWS, agentHubClient, marketDataMcp, mockData
  backtest/      — backtestEngine (real historical replay)
  routes/        — REST API (agent, signals, regime, trades, performance, backtest, stream)

frontend/src/
  pages/         — Dashboard, Intelligence, Performance, Settings
  components/    — layout, dashboard widgets, shared UI primitives
  store/         — Zustand global state
  lib/           — API client, formatting utilities
```

---

## Known Limitations & Honest Future Work

We'd rather disclose these than have them discovered:

- **Decision logic is rule-based, not model-driven.** Qwen explains decisions in plain English; it doesn't currently make them. A clear next step is giving the LLM actual influence over entry confirmation or position sizing, not just narration.
- **Settings page sliders are a configuration preview, not live controls** — changing them doesn't reconfigure the running agent. Wiring this up safely (most config is read once at startup) is a defined next step.
- **Trailing stops apply to trend trades only** — mean-reversion and short positions use fixed stop-loss/take-profit; extending trailing logic symmetrically to all strategies is straightforward future work.
- **Single symbol, single open position at a time** by design, to keep risk contained within the contest window.
- **No real capital, ever** — this is a simulation-mode agent, per the hackathon's accepted submission format.

---

## License

Built solo for Bitget AI Base Camp Hackathon S1, June 2026.

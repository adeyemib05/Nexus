# NEXUS — Adaptive Multi-Signal Trading Intelligence

**Built for Bitget Hackathon S2 (Track 2 — Agentic Trading / Trading Agent)**

NEXUS is an autonomous trading agent where Alibaba Cloud Qwen 3.8 Max serves as the primary trading decision-maker, supported by real-time multi-signal market perception (macro, sentiment, on-chain, news, and technical) and governed by strict deterministic risk guardrails.

🔗 **Live Demo:** https://nexus-orcin-eight.vercel.app
🔗 **Live API Health:** https://nexus-orcin-eight.vercel.app/api/health
🔗 **Live Autonomous Agent Cycle:** https://nexus-orcin-eight.vercel.app/api/agent/cycle

---

## What NEXUS Actually Does

Every 60 seconds, NEXUS runs an autonomous perception → fusion → LLM decision → safety guardrail → simulated execution loop:

1. **Perceives** — Ingests live BTCUSDT spot ticker and 1-hour candles directly from Bitget, plus derivatives funding rates, Alternative.me Fear & Greed, Mempool recommended transaction fees, DefiLlama TVL momentum, and CryptoCompare institutional news flow.
2. **Fuses** — Synthesizes all 5 signals into confidence-weighted telemetry and classifies the market into a reference regime (`bullish_trend`, `bearish_trend`, `ranging`, `uncertain`) as input evidence.
3. **Decides (Qwen Autonomous Decision-Maker)** — Supplies structured market context and signal evidence to **Qwen 3.8 Max** (with Groq `qwen3-32b` secondary failover). Qwen possesses sole decision authority to issue an autonomous `BUY`, `SELL`, or `HOLD` verdict, select the strategy, and provide a concise decision rationale.
4. **Governs (Deterministic Safety Guardrails)** — Before any order is placed, deterministic code validates market price integrity, single-position constraints, a 15-minute directional re-entry cooldown, and calculates position sizing (1–2%), Stop Loss (2.5%), and Take Profit (6.0%).
5. **Executes & Persists** — Executes simulated paper trades with exchange fee deduction (0.1%), commits the trade and full AI decision log to a Turso Cloud SQLite ledger, and updates portfolio accounting.

No real capital is risked — the system operates strictly in simulated paper-trading mode on live Bitget market data, per hackathon guidelines.

---

## Bitget & Sponsor Tools Used

| Tool | How it's used |
|---|---|
| **Bitget Spot REST API** | Live BTCUSDT ticker, real-time hourly candles, 24h volume telemetry |
| **Bitget Derivatives REST API** | BTC perpetual futures funding rates for derivatives sentiment |
| **Qwen 3.8 Max (`hackathon.bitgetops.com`)** | **Primary Autonomous Trading Decision-Maker**: Evaluates multi-signal market evidence and issues `BUY`, `SELL`, or `HOLD` commands with confidence and concise rationale |
| **Groq LPU Engine** | Secondary high-speed failover provider for Qwen (`qwen/qwen3-32b`) |
| **Turso Cloud SQLite** | Production serverless persistence for simulated trade ledger, regime history, and agent state |

---

## Architecture: Decision-Maker vs. Safety Guardrail

```
┌──────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│  5 Market Signals│ ──▶ │ Multi-Signal Fusion  │ ──▶ │  QWEN 3.8 MAX LLM    │
│  (Technical,     │     │ & Regime Context     │     │  TRADING DECISION    │
│   Sentiment,     │     │ (Input Evidence)     │     │ (Autonomous BUY/     │
│   On-Chain,      │     └──────────────────────┘     │  SELL/HOLD + Rationale│
│   Macro, News)   │                                  └──────────┬───────────┘
└──────────────────┘                                             ▼
                                                      ┌──────────────────────┐
                                                      │ DETERMINISTIC SAFETY │
                                                      │ GUARDRAIL LAYER      │
                                                      │ (1-2% sizing, 2.5% SL│
                                                      │  6% TP, 15m cooldown,│
                                                      │  fail-closed gates)  │
                                                      └──────────┬───────────┘
                                                                 ▼
                                                      ┌──────────────────────┐
                                                      │ SIMULATED EXECUTION  │
                                                      │ & TURSO CLOUD LEDGER │
                                                      └──────────────────────┘
```

### Separation of Concerns

* **Qwen (The Decision Authority)**:
  * Analyzes comprehensive market context and conflicting indicators.
  * Autonomously decides `BUY`, `SELL`, or `HOLD`.
  * Selects the strategy (`momentum_long`, `defensive_short`, `mean_reversion`, `capital_protection`).
  * Formulates a concise decision rationale for transparent auditing.

* **Deterministic Code (The Safety Guardrail)**:
  * Sizing calculation strictly capped at 1.0%–2.0% of live portfolio value.
  * Non-negotiable risk brackets: 2.5% Stop Loss, 6.0% Take Profit, 48-hour timeout.
  * Maximum 1 live long and 1 live short position simultaneously.
  * 15-minute re-entry cooldown prevents over-trading.
  * Fail-closed price checks: cycle halts if market data is invalid or missing.
  * Fail-safe `HOLD`: any LLM timeout (>3.5s), parse error, or provider outage defaults strictly to `HOLD` (never falls back to unguided algorithmic buying).
  * Strict ledger provenance: historical seed trades are immutable; all newly executed positions carry `source: "live_simulated"`.

**Stack:** Node.js, TypeScript, Vercel Serverless Functions, Turso Cloud SQLite, React, Tailwind, Zustand.

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

## Honest Disclosures & Scope

- **LLM Decision Authority with Deterministic Guardrails:** Alibaba Cloud Qwen 3.8 Max acts as the primary trading decision-maker with sole authority over `BUY`, `SELL`, and `HOLD` actions based on real-time multi-signal evidence. Deterministic code acts as an unbreachable safety guardrail enforcing sizing limits (1–2%), stop-loss (-2.5%), take-profit (+6%), directional cooldowns, and fail-safe holds.
- **Simulation Mode Only (No Real Capital):** The platform operates strictly in paper-trading simulation mode on live Bitget spot market data. No live exchange orders or real capital are deployed, adhering to hackathon submission requirements.
- **Single Symbol Risk Scope:** Operating exclusively on `BTCUSDT` spot pairs with a maximum of one open long and one open short position to maintain strict risk containment.
- **Settings Page Preview:** The frontend settings sliders currently act as an interactive configuration preview; dynamic runtime parameter reconfiguration is planned for post-hackathon deployment.

---

## License & Attribution

Developed for Bitget Hackathon S2 — Track 2: Agentic Trading / Trading Agent.
All code and architecture are publicly auditable and reproducible.

# NEXUS — Live Trading Record & Paper Trading Audit

**Live Ledger API:** `/api/trades`  
**Environment:** Paper Trading (Live Bitget Market Data)  
**Exchange:** Bitget Spot  
**Trading Pair:** BTCUSDT  
**Primary Decision Engine:** Alibaba Cloud Qwen 3.8 Max (`hackathon.bitgetops.com`)  
**Safety & Execution Guardrails:** Deterministic Risk Architecture (1–2% sizing, 2.5% SL, 6% TP, 15m cooldown)  

---

> **Audit Notice & Provenance Transparency:**
> 
> * **Historical Benchmark Records:** The 7 closed trades listed below represent the initial paper-trading calibration dataset recorded during the S1 benchmarking phase. In the production database, these are immutably archived with `source: "seed_historical"` and are strictly isolated from the live portfolio accounting.
> * **Live S2 Track 2 Execution:** All newly executed trades by the autonomous agent are tagged `source: "live_simulated"`. Before any position is opened, Qwen 3.8 Max independently decides `BUY`, `SELL`, or `HOLD` from real-time multi-signal evidence, and deterministic safety guardrails verify risk limits before writing to the Turso Cloud SQLite ledger.
> * **No Fabricated Trades:** Zero synthetic trades are generated. If market conditions do not provide a favorable risk-reward setup, Qwen's autonomous decision is `HOLD`, preserving capital.

---

# Trading Activity Summary

| Metric                | Value          |
| --------------------- | -------------- |
| Total Trades          | 7              |
| Winning Trades        | 1              |
| Losing Trades         | 6              |
| Win Rate              | 14.29%         |
| Net PnL               | -$1.05         |
| Average Position Size | ~$100          |
| Market Regime         | Ranging        |
| Dominant Strategy     | Mean Reversion |

---

# Live Trading Log

| Timestamp            | Pair    | Direction | Entry Price | Quantity     | Balance Change |
| -------------------- | ------- | --------- | ----------- | ------------ | -------------- |
| 2026-06-24 03:11 UTC | BTCUSDT | LONG      | 60,875.02   | 0.001642 BTC | -$0.3040       |
| 2026-06-24 04:06 UTC | BTCUSDT | LONG      | 60,901.13   | 0.001642 BTC | -$0.2886       |
| 2026-06-24 11:21 UTC | BTCUSDT | LONG      | 61,731.65   | 0.001620 BTC | -$0.1881       |
| 2026-06-24 12:49 UTC | BTCUSDT | LONG      | 61,097.81   | 0.001637 BTC | +$0.2103       |
| 2026-06-24 13:34 UTC | BTCUSDT | LONG      | 61,165.90   | 0.001635 BTC | -$0.0083       |
| 2026-06-24 14:04 UTC | BTCUSDT | LONG      | 61,195.99   | 0.001634 BTC | -$0.3568       |
| 2026-06-24 15:14 UTC | BTCUSDT | LONG      | 61,379.40   | 0.001629 BTC | -$0.1137       |

---

# Example AI Trade Explanation

Trade ID:

`5131fd7e-ac30-4bb4-9e0c-576885037b0b`

Signal:

Mean Reversion Long

Market Regime:

Ranging

Confidence:

60%

AI Reasoning:

> Price was trading near the lower boundary of an established range while broader market conditions remained supportive. Sentiment indicators suggested elevated fear without corresponding bearish momentum. NEXUS identified a potential rebound opportunity and entered long with predefined stop-loss and take-profit levels.

Result:

+$0.2103

---

# Observations

The recorded trades occurred during a predominantly ranging market environment.

Under these conditions, NEXUS consistently selected the Mean Reversion strategy and maintained strict position sizing around 1% of portfolio value.

Even during a sequence of losing trades:

* No single loss exceeded $0.36
* Capital preservation remained intact
* Risk exposure stayed constant
* Strategy behavior remained consistent with design objectives

---

# Verification

Trading records are publicly accessible through:

```text
GET /api/trades
```

Repository:

https://github.com/adeyemib05/Nexus

The live trading engine and trade generation logic used for these records are available in the public repository for review and reproduction.

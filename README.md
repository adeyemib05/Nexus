# NEXUS — Adaptive Multi-Signal Trading Intelligence
**Bitget AI Base Camp Hackathon S1 (2026)**

An autonomous AI trading agent that reads 5 market signal dimensions, 
classifies market regime, executes adaptive strategies, and explains 
every trade decision in plain English.

## Stack
- Backend: Node.js + TypeScript + Express → Railway
- Frontend: React + Vite + Tailwind → Vercel
- Signals: Bitget Agent Hub (5 skills)
- NL Engine: Qwen API (primary) + Gemini (backup)
- Backtesting: In-house engine on Bitget historical candles

## Quick Start
cd backend && cp .env.example .env && npm install && npm run dev
cd frontend && cp .env.example .env && npm install && npm run dev

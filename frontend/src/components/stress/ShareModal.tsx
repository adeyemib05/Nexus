import React, { useState } from 'react';
import { X, Copy, Check, Twitter, Sparkles, ExternalLink } from 'lucide-react';
import { StressResult, EquityData } from '../../types';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: StressResult;
  equity: EquityData;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  result,
  equity,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const shareText = `🛡️ Just stress-tested my $${result.userPositionSize.toLocaleString()} ${equity.symbol} position against "${result.scenario.name}" on NEXUS!

⚡ Resilience Score: ${result.resilienceScore}/100 [${result.verdict}]
📉 Projected Drawdown: -${result.projectedDrawdownPct}% (Risk: -$${result.projectedLossUsd.toLocaleString()})
🕒 7x24 Weekend Liquidity Squeeze: +${result.weekendLiquidityPenaltyPct}%
🧠 AI Reasoning powered by @AlibabaCloud Qwen 3.8 Max

Building in public for @Bitget_AI Base Camp Hackathon S2! #BitgetHackathon
cc @BitgetWallet`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTweet = () => {
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(tweetUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0C1220] border border-nexus-accent/40 rounded-2xl w-full max-w-lg overflow-hidden shadow-[0_0_50px_rgba(0,200,255,0.25)] relative">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-nexus-bull" />
            <h3 className="text-sm font-bold text-white font-display">Share to X / Twitter</h3>
            <span className="px-2 py-0.5 rounded bg-nexus-bull/10 text-nexus-bull text-[10px] font-mono border border-nexus-bull/30">
              Hackathon Verified
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Visual Graphic Card Preview */}
        <div className="p-5 space-y-4">
          <div className="bg-gradient-to-br from-[#06090F] to-[#0C1220] p-4 rounded-xl border border-nexus-accent/30 relative overflow-hidden font-mono space-y-3 shadow-inner">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-white/10">
              <span className="font-bold text-nexus-accent tracking-wider font-display">NEXUS AI TRADING DESK</span>
              <span className="text-gray-400 text-[10px]">7×24 rToken Stress Audit</span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-xl font-bold text-white font-display">{equity.name}</span>
                <span className="text-xs text-gray-400 block">${equity.price} entry</span>
              </div>
              <div className="text-right">
                <span className={`text-sm font-bold px-2 py-0.5 rounded ${
                  result.verdict === 'PASSED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {result.resilienceScore}/100 {result.verdict}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs bg-black/40 p-2.5 rounded-lg border border-white/5">
              <div>
                <span className="text-[10px] text-gray-500">Max Projected Loss:</span>
                <span className="text-[#EF4444] font-bold block">-${result.projectedLossUsd.toLocaleString()} (-{result.projectedDrawdownPct}%)</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-500">Closest Black Swan:</span>
                <span className="text-[#00C8FF] font-bold block truncate">{result.analogs[0]?.name}</span>
              </div>
            </div>

            <div className="text-[10px] text-gray-400 pt-1 flex items-center justify-between">
              <span>Bitget AI Hackathon S2</span>
              <span>AI Engine: Qwen 3.8 Max</span>
            </div>
          </div>

          {/* Copy Box */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400 font-mono">Post Text (#BitgetHackathon @Bitget_AI ready):</label>
            <div className="relative">
              <textarea
                readOnly
                rows={5}
                value={shareText}
                className="w-full bg-[#06090F] border border-white/[0.08] rounded-xl p-3 text-xs text-gray-300 font-mono focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Official Quote Reminder */}
          <div className="p-2.5 rounded-lg bg-nexus-caution/10 border border-nexus-caution/25 text-[11px] text-gray-300 flex items-center justify-between">
            <span>Remember to quote the official Bitget announcement tweet!</span>
            <a
              href="https://x.com/Bitget_AI/status/2100519318824055159?s=20"
              target="_blank"
              rel="noreferrer"
              className="text-nexus-accent hover:underline flex items-center gap-1 font-mono font-semibold"
            >
              <span>View Tweet</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleCopy}
              className="flex-1 py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-mono text-xs font-semibold flex items-center justify-center gap-2 transition-all border border-white/10 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-nexus-bull" />
                  <span>Copied Text!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-gray-300" />
                  <span>Copy Text</span>
                </>
              )}
            </button>

            <button
              onClick={handleTweet}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#1DA1F2] to-nexus-accent text-black font-bold font-mono text-xs flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(29,161,242,0.4)] hover:opacity-95 transition-all cursor-pointer"
            >
              <Twitter className="w-4 h-4 fill-current" />
              <span>Post Directly to X</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

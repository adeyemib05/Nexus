import { X, Newspaper, ExternalLink, Calendar, Tag, ShieldCheck } from 'lucide-react';
import { formatTimestamp } from '../../lib/utils';

interface NewsItem {
  title: string;
  source?: string;
  url?: string;
  sentiment?: string;
  timestamp?: number;
  relevance?: number;
  summary?: string;
}

interface NewsDetailModalProps {
  news: NewsItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function NewsDetailModal({ news, isOpen, onClose }: NewsDetailModalProps) {
  if (!isOpen || !news) return null;

  const sentiment = (news.sentiment || 'neutral').toLowerCase();
  const isBull = sentiment.includes('bull') || sentiment.includes('pos');
  const isBear = sentiment.includes('bear') || sentiment.includes('neg');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-nexus-void/80 backdrop-blur-md animate-fade-in">
      <div
        className="w-full max-w-xl glass-card bg-nexus-surface/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-nexus-accent/10 border border-nexus-accent/20 flex items-center justify-center">
              <Newspaper size={16} className="text-nexus-accent" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-nexus-textMuted">
                Verified News Catalyst
              </span>
              <div className="text-sm font-display font-bold text-nexus-textPrimary">
                {news.source || 'Public Feed'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-nexus-textMuted hover:text-nexus-textPrimary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Tags */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded text-xs font-mono font-medium border uppercase ${
                isBull
                  ? 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/30'
                  : isBear
                  ? 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/30'
                  : 'bg-white/5 text-nexus-textMuted border-white/10'
              }`}
            >
              {sentiment} Catalyst
            </span>

            {news.timestamp && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono bg-white/[0.03] text-nexus-textMuted border border-white/[0.06]">
                <Calendar size={12} />
                {formatTimestamp(news.timestamp)}
              </span>
            )}

            {news.relevance !== undefined && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono bg-nexus-accent/10 text-nexus-accent border border-nexus-accent/20">
                <ShieldCheck size={12} />
                Relevance: {Math.round(news.relevance <= 1 ? news.relevance * 100 : news.relevance)}%
              </span>
            )}
          </div>

          {/* Headline Title */}
          <div className="p-4 rounded-xl bg-nexus-void/60 border border-white/[0.06]">
            <h3 className="text-base font-display font-semibold text-nexus-textPrimary leading-snug">
              {news.title}
            </h3>
            {news.summary && (
              <p className="mt-3 text-xs text-nexus-textSecondary font-body leading-relaxed">
                {news.summary}
              </p>
            )}
          </div>

          {/* Forensic Ingestion Metadata */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2 text-xs font-mono">
            <div className="text-[10px] text-nexus-textMuted uppercase flex items-center gap-1.5">
              <Tag size={11} className="text-nexus-accent" />
              NEXUS Intelligence Pipeline Attribution
            </div>
            <div className="text-nexus-textSecondary text-[11px] leading-relaxed">
              This news item was ingested and parsed by the NEXUS autonomous news signal engine. It contributed to the NLP catalyst sentiment score applied to the autonomous trading agent&apos;s decision loop.
            </div>
          </div>

          {/* Action Link if URL exists */}
          {news.url && (
            <div className="pt-2">
              <a
                href={news.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary w-full justify-center text-xs flex items-center gap-2"
              >
                <span>Read Original Release</span>
                <ExternalLink size={13} />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

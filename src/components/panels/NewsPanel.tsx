import React, { useEffect, useMemo, useState } from 'react';
import type { NewsStory, Security } from '../../types/terminal';
import { INITIAL_NEWS } from '../../data/news';
import { audioService } from '../../services/audioService';
import { marketEngine } from '../../services/marketEngine';
import { fetchTickerNews } from '../../services/liveData';
import { usePersistentState, isOneOf } from '../../hooks/usePersistentState';
import { Newspaper, ArrowLeft, Clock, ExternalLink, Radio } from 'lucide-react';

interface NewsPanelProps {
  security?: Security;
  onSelectTicker?: (ticker: string) => void;
}

/** Live wire stories inherit the selected security's desk so category tabs keep working. */
const liveCategory = (assetClass?: Security['assetClass']): NewsStory['category'] => {
  switch (assetClass) {
    case 'CURR':
      return 'FX';
    case 'CRYPTO':
      return 'CRYPTO';
    case 'CMDTY':
      return 'COMMODITIES';
    default:
      return 'EQUITIES';
  }
};

/** Parse the heterogeneous timestamp strings used across live + seeded
 * stories into epoch ms. Seeded demo rows use "HH:MM:SS UTC" (today, UTC);
 * live wire rows use "DD Mon YYYY HH:MM:SS" (UTC) or a raw RSS pubDate.
 * Unparseable values return 0 so they sink to the bottom, never the top. */
const newsTime = (s: string): number => {
  if (!s) return 0;
  // Server live format "DD Mon YYYY HH:MM:SS" is UTC without a tz suffix, so
  // stamp it GMT explicitly — a bare Date.parse would read it as local time
  // and skew ordering against the seeded "HH:MM:SS UTC" rows by the tz offset.
  if (/^\d{1,2} \w{3} \d{4} \d{2}:\d{2}(:\d{2})?$/.test(s.trim())) {
    const asUtc = Date.parse(`${s.trim()} GMT`);
    if (!Number.isNaN(asUtc)) return asUtc;
  }
  const direct = Date.parse(s);
  if (!Number.isNaN(direct)) return direct;
  const hm = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*UTC/i);
  if (hm) {
    const now = new Date();
    return Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      Number(hm[1]),
      Number(hm[2]),
      Number(hm[3] ?? 0)
    );
  }
  const asUtc = Date.parse(`${s} GMT`);
  if (!Number.isNaN(asUtc)) return asUtc;
  return 0;
};

/** Newest story first. */
const byNewestFirst = (a: NewsStory, b: NewsStory) => newsTime(b.timestamp) - newsTime(a.timestamp);

export const NewsPanel: React.FC<NewsPanelProps> = ({ security, onSelectTicker }) => {
  const [selectedStory, setSelectedStory] = useState<NewsStory | null>(null);
  // Category + scope persist so leaving TOP for WEI (which unmounts this panel)
  // and coming back restores the same wire view instead of resetting to ALL/TICKER.
  const [category, setCategory] = usePersistentState<'ALL' | NewsStory['category']>(
    'bloomberg-terminal:top:category:v1',
    'ALL',
    isOneOf(['ALL', 'EQUITIES', 'MACRO', 'COMMODITIES', 'FX', 'CRYPTO'] as const),
  );
  const [scope, setScope] = usePersistentState<'TICKER' | 'ALL'>(
    'bloomberg-terminal:top:scope:v1',
    'TICKER',
    isOneOf(['TICKER', 'ALL'] as const),
  );
  const [liveStories, setLiveStories] = useState<NewsStory[]>([]);
  const [liveState, setLiveState] = useState<'idle' | 'loading' | 'live' | 'offline'>('idle');

  const ticker = security?.ticker ?? '';

  // Live headlines follow the selected ticker (Google News RSS via /api/market).
  // Seeded demo content stays as the offline fallback.
  const secName = security?.name;
  const secAssetClass = security?.assetClass;
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLiveState('loading');
    fetchTickerNews(ticker, secName)
      .then((items) => {
        if (cancelled) return;
        if (!items) {
          setLiveStories([]);
          setLiveState('offline');
          return;
        }
        const cat = liveCategory(secAssetClass);
        setLiveStories(
          items.map((n, i) => ({
            id: `live-${ticker}-${i}`,
            headline: n.headline,
            summary: n.summary,
            body: n.summary,
            source: n.source,
            timestamp: n.timestamp,
            category: cat,
            urgency: 'ROUTINE' as const,
            tickers: [ticker],
            url: n.link,
            live: true,
          }))
        );
        setLiveState('live');
      })
      .catch(() => {
        if (cancelled) return;
        setLiveStories([]);
        setLiveState('offline');
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, secName, secAssetClass]);

  // Seeded stories that actually mention the selected ticker (tag or text).
  const seededForTicker = useMemo(() => {
    if (!ticker) return [];
    const needle = ticker.toUpperCase();
    return INITIAL_NEWS.filter(
      (n) =>
        n.tickers.some((t) => t.toUpperCase() === needle) ||
        `${n.headline} ${n.summary} ${n.body}`.toUpperCase().includes(needle)
    );
  }, [ticker]);

  const inCategory = (n: NewsStory) => category === 'ALL' || n.category === category;

  const tickerStories = useMemo(
    () => [...liveStories, ...seededForTicker].filter(inCategory).sort(byNewestFirst),
    [liveStories, seededForTicker, category]
  );

  const wireStories = useMemo(
    () =>
      (category === 'ALL' ? [...INITIAL_NEWS] : INITIAL_NEWS.filter((n) => n.category === category)).sort(
        byNewestFirst
      ),
    [category]
  );

  const stories = scope === 'TICKER' ? tickerStories : wireStories;

  // Securities outside the terminal's coverage universe cannot be opened, so
  // their story tags render as inert labels instead of misleading buttons.
  const knownTicker = (t: string) => !!marketEngine.getSecurity(t);

  const handleStoryClick = (story: NewsStory) => {
    audioService.playKeyClick();
    if (story.live && story.url) {
      // Only open http(s) links — live RSS links are upstream data and must
      // never become a javascript:/data: URL execution vector.
      try {
        const url = new URL(story.url);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          window.open(url.toString(), '_blank', 'noopener,noreferrer');
          return;
        }
      } catch {
        // Malformed URL — fall through to the in-app reader.
      }
    }
    setSelectedStory(story);
  };

  const handleTickerClick = (t: string) => {
    audioService.playKeyClick();
    if (onSelectTicker) {
      onSelectTicker(t);
    }
  };

  return (
    <div className="h-full w-full bg-[#080d16] text-zinc-300 font-mono text-xs flex flex-col select-none">
      {/* Top Filter and Category Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-1 px-2 py-1 bg-[#0c1322] border-b border-[#1b253b] shrink-0">
        <div className="flex items-center space-x-1.5">
          <Newspaper className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-bold text-amber-400 tracking-wider text-[11px]">NEWS WIRE</span>
          {ticker && scope === 'TICKER' && (
            <button
              onClick={() => handleTickerClick(ticker)}
              title={`Following ${ticker} — click to load it across the terminal`}
              className="text-[10px] bg-amber-500/15 text-amber-300 px-1.5 py-px rounded border border-amber-500/40 font-bold hover:bg-amber-500/25 transition-colors"
            >
              {ticker}
            </button>
          )}
          <span
            className={`text-[9px] font-bold flex items-center gap-1 ${
              liveState === 'live' ? 'text-emerald-400' : liveState === 'loading' ? 'text-amber-300' : 'text-zinc-500'
            }`}
            title={
              liveState === 'live'
                ? 'Live headlines via Google News RSS'
                : liveState === 'loading'
                ? 'Fetching live headlines…'
                : 'Live feed unreachable — showing seeded demo content'
            }
          >
            <Radio className="w-2.5 h-2.5" />
            {liveState === 'live' ? 'LIVE' : liveState === 'loading' ? 'SYNC…' : 'SEEDED'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Scope: ticker-specific vs full wire */}
          <div className="flex space-x-0.5 bg-[#101726] border border-[#212d44] p-0.5 rounded text-[10px]">
            {(['TICKER', 'ALL'] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  audioService.playKeyClick();
                  setScope(s);
                  setSelectedStory(null);
                }}
                className={`px-2 py-0.5 rounded font-bold transition-colors ${
                  scope === s ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {s === 'TICKER' ? ticker || 'TICKER' : 'ALL'}
              </button>
            ))}
          </div>

          <div className="flex space-x-0.5 bg-[#101726] border border-[#212d44] p-0.5 rounded text-[10px]">
            {(['ALL', 'EQUITIES', 'MACRO', 'COMMODITIES', 'FX', 'CRYPTO'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  audioService.playKeyClick();
                  setCategory(cat);
                  // Selecting a filter returns the reader to the wire list.
                  setSelectedStory(null);
                }}
                className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
                  category === cat ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {cat === 'COMMODITIES' ? 'CMDTY' : cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content: Story Reader or News Feed List */}
      {selectedStory ? (
        <div className="flex-1 overflow-y-auto p-2.5 bg-[#0a0f1b] space-y-2">
          <button
            onClick={() => {
              audioService.playKeyClick();
              setSelectedStory(null);
            }}
            className="flex items-center space-x-1 text-amber-400 hover:text-amber-300 text-[11px] font-bold pb-2 border-b border-[#182338]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>&lt;BACK TO NEWS WIRE&gt;</span>
          </button>

          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-[10px]">
              <span className="bg-amber-500/20 text-amber-400 font-bold px-1.5 py-0.5 rounded border border-amber-500/40">
                {selectedStory.source}
              </span>
              <span className="text-zinc-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-zinc-500" /> {selectedStory.timestamp}
              </span>
              <span className="text-zinc-500">|</span>
              <span className="text-cyan-400 font-semibold">{selectedStory.category}</span>
            </div>

            <h2 className="text-sm md:text-base font-bold text-white leading-snug">
              {selectedStory.headline}
            </h2>

            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-zinc-500 text-[10px] self-center">MENTIONED SECURITIES:</span>
              {selectedStory.tickers.map((t) =>
                knownTicker(t) ? (
                  <button
                    key={t}
                    onClick={() => handleTickerClick(t)}
                    className="bg-[#131c2e] hover:bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 text-[10px] font-bold transition-colors"
                  >
                    {t}
                  </button>
                ) : (
                  <span
                    key={t}
                    title="Not listed in this terminal's coverage universe"
                    className="bg-[#0e1220] text-zinc-600 px-2 py-0.5 rounded border border-[#1d2740] text-[10px] font-bold cursor-not-allowed"
                  >
                    {t}
                  </span>
                )
              )}
            </div>
          </div>

          <div className="text-[12px] text-zinc-300 leading-relaxed whitespace-pre-line bg-[#080c15] p-3 rounded-lg border border-[#172238]">
            {selectedStory.body}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-[#131b2c]">
          {stories.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <Clock className="w-6 h-6 text-zinc-600" />
              <span className="text-zinc-400 text-[11px] font-bold">
                {scope === 'TICKER'
                  ? liveState === 'loading'
                    ? `FETCHING LIVE HEADLINES FOR ${ticker}…`
                    : `NO ${category === 'ALL' ? '' : category + ' '}STORIES FOR ${ticker} RIGHT NOW`
                  : `NO ${category} STORIES ON THE WIRE RIGHT NOW`}
              </span>
              <button
                onClick={() => {
                  audioService.playKeyClick();
                  if (scope === 'TICKER') {
                    setScope('ALL');
                  } else {
                    setCategory('ALL');
                  }
                }}
                className="px-2 py-0.5 rounded bg-[#121929] border border-amber-500/40 text-amber-300 hover:bg-amber-500/20 text-[10px] font-bold transition-colors"
              >
                {scope === 'TICKER' ? 'SHOW FULL WIRE' : 'SHOW ALL STORIES'}
              </button>
            </div>
          ) : (
            stories.map((story) => (
            <article
              key={story.id}
              onClick={() => handleStoryClick(story)}
              className="p-2 hover:bg-[#101726] transition-colors cursor-pointer group space-y-1 focus-within:bg-[#101726]"
            >
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center space-x-2 min-w-0">
                  {story.live ? (
                    <span className="font-bold px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shrink-0">
                      LIVE
                    </span>
                  ) : (
                    <span
                      className={`font-bold px-1.5 py-0.5 rounded text-[9px] shrink-0 ${
                        story.urgency === 'BREAKING'
                          ? 'bg-rose-500 text-white'
                          : 'bg-[#18233a] text-cyan-300 border border-[#233352]'
                      }`}
                    >
                      {story.urgency}
                    </span>
                  )}
                  <span className="text-amber-400 font-semibold truncate">{story.source}</span>
                  <span className="text-zinc-500">•</span>
                  <span className="text-zinc-400 shrink-0">{story.timestamp}</span>
                  {story.live && <ExternalLink className="w-2.5 h-2.5 text-zinc-500 shrink-0" />}
                </div>

                <div className="flex space-x-1 shrink-0">
                  {story.tickers.map((t) =>
                    knownTicker(t) ? (
                      <button
                        key={t}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTickerClick(t);
                        }}
                        className="text-[9px] bg-[#121929] hover:bg-amber-500/20 text-zinc-400 hover:text-amber-300 px-1.5 py-0.5 rounded border border-[#1b253b] transition-colors"
                      >
                        {t}
                      </button>
                    ) : (
                      <span
                        key={t}
                        title="Not listed in this terminal's coverage universe"
                        className="text-[9px] bg-[#0e1220] text-zinc-600 px-1.5 py-0.5 rounded border border-[#1d2740] cursor-not-allowed"
                      >
                        {t}
                      </span>
                    )
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleStoryClick(story)}
                className="block w-full text-left font-bold text-zinc-200 group-hover:text-amber-400 text-[11px] leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 rounded"
              >
                {story.headline}
              </button>

              <p className="text-zinc-400 text-[10px] line-clamp-2 leading-relaxed select-text">
                {story.summary}
              </p>
            </article>
          ))
          )}
        </div>
      )}
    </div>
  );
};

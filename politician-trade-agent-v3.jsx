import { useState, useEffect, useCallback, useMemo } from "react";

// ------------------------------------------------------------------
// DATA SOURCE: House Stock Watcher + Senate Stock Watcher
// Public GitHub repos publishing congressional disclosure JSON daily.
// No API key. No auth. Fully open.
// https://github.com/jklein/senate-stock-watcher-data
// https://github.com/jklein/house-stock-watcher-data
// ------------------------------------------------------------------

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

const HOUSE_URL =
  "https://raw.githubusercontent.com/jklein/house-stock-watcher-data/master/data/all_transactions.json";
const SENATE_URL =
  "https://raw.githubusercontent.com/jklein/senate-stock-watcher-data/master/data/all_transactions.json";

const FALLBACK = [
  { politician: "Nancy Pelosi", party: "D", chamber: "House", ticker: "NVDA", company: "NVIDIA Corp", type: "Purchase", amount: "$250,001 - $500,000", trade_date: "2026-04-22", disclosure_date: "2026-04-24" },
  { politician: "Tommy Tuberville", party: "R", chamber: "Senate", ticker: "LMT", company: "Lockheed Martin", type: "Purchase", amount: "$15,001 - $50,000", trade_date: "2026-04-21", disclosure_date: "2026-04-23" },
  { politician: "Dan Crenshaw", party: "R", chamber: "House", ticker: "XOM", company: "Exxon Mobil", type: "Sale", amount: "$50,001 - $100,000", trade_date: "2026-04-20", disclosure_date: "2026-04-23" },
  { politician: "Mark Warner", party: "D", chamber: "Senate", ticker: "MSFT", company: "Microsoft Corp", type: "Purchase", amount: "$100,001 - $250,000", trade_date: "2026-04-19", disclosure_date: "2026-04-22" },
  { politician: "Marjorie Taylor Greene", party: "R", chamber: "House", ticker: "META", company: "Meta Platforms", type: "Purchase", amount: "$15,001 - $50,000", trade_date: "2026-04-18", disclosure_date: "2026-04-21" },
  { politician: "Josh Gottheimer", party: "D", chamber: "House", ticker: "GOOGL", company: "Alphabet Inc", type: "Sale (Partial)", amount: "$50,001 - $100,000", trade_date: "2026-04-17", disclosure_date: "2026-04-20" },
  { politician: "Roger Marshall", party: "R", chamber: "Senate", ticker: "UNH", company: "UnitedHealth Group", type: "Purchase", amount: "$1,001 - $15,000", trade_date: "2026-04-16", disclosure_date: "2026-04-19" },
  { politician: "Ro Khanna", party: "D", chamber: "House", ticker: "AMD", company: "Advanced Micro Devices", type: "Purchase", amount: "$15,001 - $50,000", trade_date: "2026-04-15", disclosure_date: "2026-04-18" },
  { politician: "Mike Gallagher", party: "R", chamber: "House", ticker: "TSM", company: "Taiwan Semiconductor", type: "Sale", amount: "$50,001 - $100,000", trade_date: "2026-04-14", disclosure_date: "2026-04-17" },
  { politician: "Elizabeth Warren", party: "D", chamber: "Senate", ticker: "BRK.B", company: "Berkshire Hathaway", type: "Purchase", amount: "$1,001 - $15,000", trade_date: "2026-04-13", disclosure_date: "2026-04-16" },
];

function normalizeHouse(raw) {
  return {
    politician: raw.representative || raw.name || "Unknown",
    party: raw.party || "?",
    chamber: "House",
    ticker: raw.ticker || "N/A",
    company: raw.asset_description || raw.company || raw.ticker || "N/A",
    type: raw.type || raw.transaction_type || "Unknown",
    amount: raw.amount || raw.range || "N/A",
    trade_date: raw.transaction_date || raw.trade_date || "",
    disclosure_date: raw.disclosure_date || "",
  };
}

function normalizeSenate(raw) {
  return {
    politician: raw.senator || raw.first_name
      ? `${raw.first_name || ""} ${raw.last_name || ""}`.trim()
      : "Unknown",
    party: raw.party || "?",
    chamber: "Senate",
    ticker: raw.ticker || "N/A",
    company: raw.asset_description || raw.company || raw.ticker || "N/A",
    type: raw.type || raw.transaction_type || "Unknown",
    amount: raw.amount || raw.range || "N/A",
    trade_date: raw.transaction_date || raw.trade_date || "",
    disclosure_date: raw.disclosure_date || "",
  };
}

function fmtDate(str) {
  if (!str) return "—";
  try {
    const d = new Date(str.includes("T") ? str : str + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return str; }
}

function isBuy(type) {
  const t = (type || "").toLowerCase();
  return t.includes("purchase") || t.includes("buy");
}

function isSell(type) {
  const t = (type || "").toLowerCase();
  return t.includes("sale") || t.includes("sell");
}

function sectorTag(ticker) {
  const sectors = {
    NVDA: "Tech", AMD: "Tech", MSFT: "Tech", GOOGL: "Tech", META: "Tech",
    AAPL: "Tech", TSM: "Tech", INTC: "Tech",
    LMT: "Defense", RTX: "Defense", NOC: "Defense", GD: "Defense",
    XOM: "Energy", CVX: "Energy", COP: "Energy",
    UNH: "Healthcare", JNJ: "Healthcare", PFE: "Healthcare",
    BRK: "Finance", JPM: "Finance", BAC: "Finance",
  };
  const key = Object.keys(sectors).find(k => (ticker || "").toUpperCase().startsWith(k));
  return key ? sectors[key] : null;
}

const SECTOR_COLORS = {
  Tech: { bg: "#eff6ff", text: "#1d4ed8" },
  Defense: { bg: "#fff7ed", text: "#c2410c" },
  Energy: { bg: "#fefce8", text: "#a16207" },
  Healthcare: { bg: "#f0fdf4", text: "#15803d" },
  Finance: { bg: "#fdf4ff", text: "#7e22ce" },
};

function Avatar({ name, party }) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const bg = party === "D" || party === "Democrat" ? "#dbeafe" : party === "R" || party === "Republican" ? "#fee2e2" : "#f1f5f9";
  const color = party === "D" || party === "Democrat" ? "#1d4ed8" : party === "R" || party === "Republican" ? "#dc2626" : "#64748b";
  return (
    <div style={{
      width: 40, height: 40, borderRadius: "50%",
      background: bg, color, fontWeight: 700,
      fontSize: 13, display: "flex", alignItems: "center",
      justifyContent: "center", flexShrink: 0,
      fontFamily: "system-ui, sans-serif",
      userSelect: "none",
    }}>
      {initials}
    </div>
  );
}

function Badge({ label, style }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 11, fontWeight: 600,
      padding: "2px 7px", borderRadius: 99,
      fontFamily: "system-ui, sans-serif",
      letterSpacing: "0.02em",
      ...style,
    }}>
      {label}
    </span>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: 12,
      padding: "16px 20px",
      flex: 1,
      minWidth: 110,
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || "#0f172a", fontFamily: "system-ui, sans-serif", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, fontFamily: "system-ui, sans-serif", fontWeight: 500 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontFamily: "system-ui, sans-serif" }}>{sub}</div>}
    </div>
  );
}

function TradeCard({ t }) {
  const buy = isBuy(t.type);
  const sell = isSell(t.type);
  const sector = sectorTag(t.ticker);
  const sectorStyle = sector ? SECTOR_COLORS[sector] : null;
  const partyLabel = t.party === "D" || t.party === "Democrat" ? "Dem" : t.party === "R" || t.party === "Republican" ? "Rep" : t.party;

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: 12,
      padding: "14px 16px",
      display: "flex",
      gap: 12,
      alignItems: "flex-start",
      transition: "box-shadow 0.15s, border-color 0.15s",
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = "#c7d2fe"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
    >
      <Avatar name={t.politician} party={t.party} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "#0f172a", fontFamily: "system-ui, sans-serif" }}>
            {t.politician}
          </span>
          <Badge
            label={partyLabel}
            style={{
              background: t.party === "D" || t.party === "Democrat" ? "#dbeafe" : t.party === "R" || t.party === "Republican" ? "#fee2e2" : "#f1f5f9",
              color: t.party === "D" || t.party === "Democrat" ? "#1d4ed8" : t.party === "R" || t.party === "Republican" ? "#dc2626" : "#64748b",
            }}
          />
          <Badge label={t.chamber} style={{ background: "#f1f5f9", color: "#475569" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {t.ticker !== "N/A" && (
            <span style={{
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              fontSize: 13, fontWeight: 700,
              color: "#0f172a",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              padding: "2px 8px",
              borderRadius: 6,
            }}>
              {t.ticker}
            </span>
          )}
          {sector && (
            <Badge label={sector} style={{ background: sectorStyle.bg, color: sectorStyle.text }} />
          )}
          {t.company !== "N/A" && t.company !== t.ticker && (
            <span style={{ fontSize: 12, color: "#64748b", fontFamily: "system-ui, sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
              {t.company}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
        <Badge
          label={buy ? "BUY" : sell ? "SELL" : (t.type || "—").toUpperCase()}
          style={{
            background: buy ? "#dcfce7" : sell ? "#fee2e2" : "#fef9c3",
            color: buy ? "#15803d" : sell ? "#dc2626" : "#a16207",
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            fontSize: 10,
          }}
        />
        <span style={{ fontSize: 11, color: "#64748b", fontFamily: "system-ui, sans-serif", textAlign: "right" }}>
          {t.amount !== "N/A" ? t.amount : "—"}
        </span>
        <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "system-ui, sans-serif" }}>
          {fmtDate(t.trade_date)}
        </span>
      </div>
    </div>
  );
}

const FILTER_OPTS = [
  { key: "all", label: "All" },
  { key: "buys", label: "Buys" },
  { key: "sells", label: "Sells" },
  { key: "senate", label: "Senate" },
  { key: "house", label: "House" },
  { key: "tech", label: "Tech" },
  { key: "defense", label: "Defense" },
];

export default function TradeAgent() {
  const [trades, setTrades] = useState([]);
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [lastRun, setLastRun] = useState(null);
  const [error, setError] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [activeTab, setActiveTab] = useState("trades");

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    setError("");
    setSource("");
    try {
      const [houseRes, senateRes] = await Promise.allSettled([
        fetch(HOUSE_URL),
        fetch(SENATE_URL),
      ]);
      let combined = [];
      if (houseRes.status === "fulfilled" && houseRes.value.ok) {
        const raw = await houseRes.value.json();
        const arr = Array.isArray(raw) ? raw : raw.transactions || raw.data || [];
        combined.push(...arr.slice(0, 60).map(normalizeHouse));
      }
      if (senateRes.status === "fulfilled" && senateRes.value.ok) {
        const raw = await senateRes.value.json();
        const arr = Array.isArray(raw) ? raw : raw.transactions || raw.data || [];
        combined.push(...arr.slice(0, 40).map(normalizeSenate));
      }
      if (combined.length > 0) {
        combined.sort((a, b) => new Date(b.trade_date || 0) - new Date(a.trade_date || 0));
        setTrades(combined.slice(0, 80));
        setSource("Live · House & Senate Stock Watcher");
      } else {
        throw new Error("Empty response");
      }
    } catch {
      setTrades(FALLBACK);
      setSource("Sample data · live feeds unavailable in this environment");
      setError("Live feeds unreachable in this sandbox. Showing sample disclosures. Deploy to see live data.");
    }
    setLastRun(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { fetchTrades(); }, [fetchTrades]);

  const filtered = useMemo(() => {
    return trades.filter(t => {
      const type = (t.type || "").toLowerCase();
      if (filter === "buys" && !isBuy(t.type)) return false;
      if (filter === "sells" && !isSell(t.type)) return false;
      if (filter === "senate" && t.chamber !== "Senate") return false;
      if (filter === "house" && t.chamber !== "House") return false;
      if (filter === "tech" && sectorTag(t.ticker) !== "Tech") return false;
      if (filter === "defense" && sectorTag(t.ticker) !== "Defense") return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          t.politician.toLowerCase().includes(q) ||
          (t.ticker || "").toLowerCase().includes(q) ||
          (t.company || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [trades, filter, search]);

  const buys = trades.filter(t => isBuy(t.type)).length;
  const sells = trades.filter(t => isSell(t.type)).length;

  const generateReport = async () => {
    if (!trades.length) return;
    setGenerating(true);
    setReport("");
    setError("");
    setActiveTab("briefing");

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
    setReportDate(today);

    const sample = trades.slice(0, 20);
    const tradeList = sample.map(t =>
      `${t.politician} (${t.party}, ${t.chamber}) | ${t.type} | ${t.ticker} ${t.company !== "N/A" ? "(" + t.company + ")" : ""} | ${t.amount} | ${fmtDate(t.trade_date)}`
    ).join("\n");

    const prompt = `You are a sharp financial intelligence analyst producing a daily briefing on congressional stock trades for a civic entrepreneur and business loan broker in Philadelphia who tracks the intersection of politics, capital, and policy.

Today is ${today}. Here are the most recent congressional trade disclosures:

${tradeList}

Write a concise daily briefing in exactly 4 short paragraphs. No bullet points. No headers. No dashes.

Paragraph 1: One to two sentence headline summary of what stands out most in today's disclosures.
Paragraph 2: Sector or thematic patterns across the trades and what they may signal about where congressional attention is focused.
Paragraph 3: One or two specific trades worth watching and why, including any relevant committee context, recent legislation, or policy timing.
Paragraph 4: What to monitor over the next 24 to 72 hours given these moves.

Tone: direct, analytical, no hedging, no filler. Write for someone who reads Bloomberg and tracks city hall simultaneously.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      if (!text) throw new Error("Empty response");
      setReport(text);
    } catch {
      setError("Report generation failed. Check your connection and try again.");
      setActiveTab("trades");
    } finally {
      setGenerating(false);
    }
  };

  const copyReport = () => {
    if (!report) return;
    const full = `CONGRESSIONAL TRADE BRIEFING\n${reportDate}\n\n${report}\n\nSource: ${source}\nKommunity Capital Intelligence`;
    navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui, -apple-system, sans-serif", color: "#0f172a" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
        input::placeholder { color: #94a3b8; }
        @keyframes shimmer { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .fade-up { animation: fadeUp 0.35s ease forwards; }
      `}</style>

      {/* Top nav */}
      <header style={{
        background: "#fff",
        borderBottom: "1px solid #e2e8f0",
        padding: "0 24px",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 16, fontWeight: 700,
            }}>
              ⚡
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>
                Congressional Trade Wire
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                {source || "Loading data…"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {lastRun && (
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                Updated {lastRun.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={fetchTrades}
              disabled={loading}
              style={{
                padding: "7px 14px",
                fontSize: 13, fontWeight: 500,
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                color: "#475569",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                transition: "all 0.15s",
              }}
              onMouseEnter={e => !loading && (e.currentTarget.style.background = "#e2e8f0")}
              onMouseLeave={e => (e.currentTarget.style.background = "#f1f5f9")}
            >
              {loading ? "Loading…" : "↻ Refresh"}
            </button>
            <button
              onClick={generateReport}
              disabled={generating || !trades.length}
              style={{
                padding: "7px 16px",
                fontSize: 13, fontWeight: 600,
                background: generating ? "#818cf8" : "#6366f1",
                border: "none",
                borderRadius: 8,
                color: "#fff",
                cursor: (generating || !trades.length) ? "not-allowed" : "pointer",
                opacity: !trades.length ? 0.5 : 1,
                transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 6,
              }}
              onMouseEnter={e => !generating && trades.length && (e.currentTarget.style.background = "#4f46e5")}
              onMouseLeave={e => (e.currentTarget.style.background = generating ? "#818cf8" : "#6366f1")}
            >
              {generating ? (
                <>
                  <span style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                  Generating…
                </>
              ) : "✦ Generate Briefing"}
            </button>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div style={{
          background: "#fff7ed",
          borderBottom: "1px solid #fed7aa",
          padding: "10px 24px",
          fontSize: 13,
          color: "#9a3412",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span>⚠</span>
          <span>{error}</span>
          <button onClick={() => setError("")} style={{ marginLeft: "auto", background: "none", border: "none", color: "#9a3412", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px" }}>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <StatCard label="Total Disclosures" value={loading ? "—" : trades.length} />
          <StatCard label="Purchases" value={loading ? "—" : buys} accent="#15803d" sub="Buy orders" />
          <StatCard label="Sales" value={loading ? "—" : sells} accent="#dc2626" sub="Sell orders" />
          <StatCard label="Senate" value={loading ? "—" : trades.filter(t => t.chamber === "Senate").length} accent="#7e22ce" />
          <StatCard label="House" value={loading ? "—" : trades.filter(t => t.chamber === "House").length} accent="#0369a1" />
        </div>

        {/* Tabs — mobile only shows one at a time */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
          {[{ key: "trades", label: `Disclosures (${filtered.length})` }, { key: "briefing", label: report ? "✦ Briefing Ready" : "AI Briefing" }].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "8px 16px",
                fontSize: 13, fontWeight: 600,
                background: activeTab === tab.key ? "#6366f1" : "#fff",
                color: activeTab === tab.key ? "#fff" : "#64748b",
                border: "1px solid " + (activeTab === tab.key ? "#6366f1" : "#e2e8f0"),
                borderRadius: 8,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

          {/* Left: Trades panel */}
          <div style={{
            flex: 1,
            minWidth: 0,
            display: activeTab === "trades" ? "block" : "none",
          }}>
            {/* Search + filters */}
            <div style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "14px 16px",
              marginBottom: 14,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 16, pointerEvents: "none" }}>
                  🔍
                </span>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, ticker, or company…"
                  style={{
                    width: "100%",
                    padding: "9px 12px 9px 36px",
                    fontSize: 14,
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    outline: "none",
                    background: "#f8fafc",
                    color: "#0f172a",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={e => (e.target.style.borderColor = "#6366f1")}
                  onBlur={e => (e.target.style.borderColor = "#e2e8f0")}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
                  >
                    ×
                  </button>
                )}
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {FILTER_OPTS.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    style={{
                      padding: "5px 12px",
                      fontSize: 12, fontWeight: 500,
                      borderRadius: 99,
                      border: "1px solid " + (filter === f.key ? "#6366f1" : "#e2e8f0"),
                      background: filter === f.key ? "#eef2ff" : "#fff",
                      color: filter === f.key ? "#6366f1" : "#64748b",
                      cursor: "pointer",
                      transition: "all 0.12s",
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Trade list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <div key={i} style={{
                    height: 80, borderRadius: 12,
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    animation: `shimmer 1.4s ${i * 0.1}s infinite`,
                  }} />
                ))
              ) : filtered.length === 0 ? (
                <div style={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  padding: 48,
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontWeight: 600, color: "#0f172a", marginBottom: 6 }}>No results found</div>
                  <div style={{ fontSize: 13, color: "#94a3b8" }}>Try adjusting your search or filter</div>
                  <button onClick={() => { setFilter("all"); setSearch(""); }} style={{
                    marginTop: 16, padding: "8px 16px", fontSize: 13, fontWeight: 500,
                    background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8,
                    color: "#475569", cursor: "pointer",
                  }}>
                    Clear filters
                  </button>
                </div>
              ) : (
                filtered.map((t, i) => <TradeCard key={i} t={t} />)
              )}
            </div>
          </div>

          {/* Right: Briefing panel — always visible on wide screens */}
          <div style={{
            width: 400,
            flexShrink: 0,
            display: activeTab === "briefing" ? "block" : "block",
          }}>
            <div style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              overflow: "hidden",
              position: "sticky",
              top: 80,
            }}>
              {/* Panel header */}
              <div style={{
                padding: "16px 20px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: report ? "#fafaf9" : "#fff",
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>AI Briefing</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                    Powered by Claude · {trades.length} disclosures analyzed
                  </div>
                </div>
                {report && (
                  <button
                    onClick={copyReport}
                    style={{
                      padding: "6px 12px",
                      fontSize: 12, fontWeight: 500,
                      background: copied ? "#dcfce7" : "#f1f5f9",
                      border: "1px solid " + (copied ? "#86efac" : "#e2e8f0"),
                      borderRadius: 8,
                      color: copied ? "#15803d" : "#475569",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                )}
              </div>

              {/* Panel body */}
              <div style={{ padding: "20px", maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
                {generating && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, color: "#6366f1", fontSize: 13, fontWeight: 500 }}>
                      <span style={{ width: 14, height: 14, border: "2px solid #c7d2fe", borderTopColor: "#6366f1", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                      Analyzing {trades.length} disclosures…
                    </div>
                    {[92, 78, 95, 62, 88, 72, 84, 60].map((w, i) => (
                      <div key={i} style={{
                        height: 12, width: `${w}%`, borderRadius: 6,
                        background: "#e2e8f0",
                        marginBottom: 10,
                        animation: `shimmer 1.3s ${i * 0.1}s infinite`,
                      }} />
                    ))}
                  </div>
                )}

                {!generating && !report && (
                  <div style={{ textAlign: "center", padding: "24px 0" }}>
                    <div style={{
                      width: 64, height: 64,
                      background: "#eef2ff",
                      borderRadius: "50%",
                      display: "flex", alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 16px",
                      fontSize: 28,
                    }}>
                      ✦
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>
                      Ready to generate
                    </div>
                    <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, marginBottom: 20 }}>
                      Click "Generate Briefing" to get an AI-powered analysis of today's congressional trade disclosures.
                    </div>
                    <button
                      onClick={generateReport}
                      disabled={!trades.length}
                      style={{
                        width: "100%",
                        padding: "10px",
                        fontSize: 14, fontWeight: 600,
                        background: "#6366f1",
                        border: "none",
                        borderRadius: 8,
                        color: "#fff",
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#4f46e5")}
                      onMouseLeave={e => (e.currentTarget.style.background = "#6366f1")}
                    >
                      Generate Briefing
                    </button>

                    <div style={{
                      marginTop: 24,
                      padding: "14px",
                      background: "#f8fafc",
                      borderRadius: 10,
                      border: "1px solid #e2e8f0",
                      textAlign: "left",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", letterSpacing: "0.05em", marginBottom: 6 }}>
                        AUTOMATE THIS DAILY
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.7 }}>
                        Deploy to Vercel or Netlify (free tier), then set a daily cron via GitHub Actions to generate and email this briefing automatically.
                      </div>
                    </div>
                  </div>
                )}

                {!generating && report && (
                  <div className="fade-up">
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: "#6366f1",
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      marginBottom: 14,
                    }}>
                      {reportDate}
                    </div>
                    <div style={{
                      fontSize: 14,
                      lineHeight: 1.85,
                      color: "#1e293b",
                      whiteSpace: "pre-wrap",
                    }}>
                      {report}
                    </div>
                    <div style={{
                      marginTop: 24,
                      paddingTop: 16,
                      borderTop: "1px solid #e2e8f0",
                      fontSize: 11,
                      color: "#94a3b8",
                      lineHeight: 1.8,
                    }}>
                      Kommunity Capital Intelligence · PHL Tech PAC Research
                      <br />
                      Based on public disclosure data
                    </div>
                    <button
                      onClick={generateReport}
                      style={{
                        marginTop: 16,
                        width: "100%",
                        padding: "8px",
                        fontSize: 12, fontWeight: 600,
                        background: "#f1f5f9",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        color: "#475569",
                        cursor: "pointer",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#e2e8f0")}
                      onMouseLeave={e => (e.currentTarget.style.background = "#f1f5f9")}
                    >
                      ↻ Regenerate
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

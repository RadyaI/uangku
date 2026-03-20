"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, Area, AreaChart, ReferenceLine,
} from "recharts";
import { ArrowLeft, TrendingUp, TrendingDown, Wallet, PiggyBank, Target, Loader2, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { Timestamp } from "firebase/firestore";

import {
  getAccounts, getTransactions, getNetWorthSnapshots, getPortfolioSnapshots,
} from "@/utils/crud";
import type { Account, Transaction, NetWorthSnapshot, PortfolioSnapshot } from "@/types";

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(n);
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const PALETTE = ["#6366f1", "#f43f5e", "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-lg p-3 min-w-[140px]">
      <p className="text-xs font-bold text-slate-500 mb-2">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-xs text-slate-500">{p.name}</span>
          <span className="text-xs font-bold text-slate-800 ml-auto">{fmtShort(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

type MonthlyRow = {
  label: string;
  month: number;
  year: number;
  income: number;
  expense: number;
  saving: number;
  savingRate: number;
  netWorth: number;
};

export default function StatsPage() {
  const router = useRouter();
  const now = new Date();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [netWorthSnaps, setNetWorthSnaps] = useState<NetWorthSnapshot[]>([]);
  const [portfolioSnaps, setPortfolioSnaps] = useState<PortfolioSnapshot[]>([]);

  const [rangeMonths, setRangeMonths] = useState(6);
  const [savingTarget, setSavingTarget] = useState(20);
  const [editingSavingTarget, setEditingSavingTarget] = useState(false);
  const [savingTargetInput, setSavingTargetInput] = useState("20");
  const [activeTab, setActiveTab] = useState<"overview" | "investment" | "expense" | "table">("overview");
  const [expenseFilterMonth, setExpenseFilterMonth] = useState<number | "all">("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = new Date(now.getFullYear(), now.getMonth() - rangeMonths + 1, 1);
      const [accs, txs, nwSnaps, pSnaps] = await Promise.all([
        getAccounts(),
        getTransactions({ limitCount: 500 }),
        getNetWorthSnapshots(),
        getPortfolioSnapshots(),
      ]);
      setAccounts(accs);
      setAllTransactions(txs.filter((t) => t.date.toDate() >= startDate));
      setNetWorthSnaps(nwSnaps);
      setPortfolioSnaps(pSnaps);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [rangeMonths]);

  useEffect(() => { loadData(); }, [loadData]);

  const getMonthlyData = (): MonthlyRow[] => {
    const rows: MonthlyRow[] = [];
    let runningNetWorth = 0;

    for (let i = rangeMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const txs = allTransactions.filter((t) => {
        const td = t.date.toDate();
        return td.getMonth() === m && td.getFullYear() === y;
      });
      const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
      const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
      const saving = income - expense;
      const savingRate = income > 0 ? (saving / income) * 100 : 0;

      const nwSnap = netWorthSnaps.find((s) => {
        const sd = s.snapshotDate.toDate();
        return sd.getMonth() === m && sd.getFullYear() === y;
      });
      if (nwSnap) runningNetWorth = nwSnap.totalAssets;
      else if (i === 0) {
        runningNetWorth = accounts.reduce((s, a) => s + a.balance, 0);
      }

      rows.push({ label: `${MONTHS[m]} '${String(y).slice(2)}`, month: m, year: y, income, expense, saving, savingRate, netWorth: runningNetWorth });
    }
    return rows;
  };

  const monthlyData = getMonthlyData();

  const getPortfolioData = () => {
    const investAccounts = accounts.filter((a) => a.type === "mutual_fund" || a.type === "stock");
    if (!investAccounts.length) return [];

    const monthSet = new Set<string>();
    portfolioSnaps.forEach((s) => {
      const d = s.snapshotDate.toDate();
      monthSet.add(`${d.getMonth()}-${d.getFullYear()}`);
    });

    return Array.from(monthSet)
      .map((key) => {
        const [m, y] = key.split("-").map(Number);
        const entry: Record<string, number | string> = { label: `${MONTHS[m]} '${String(y).slice(2)}` };
        let totalValue = 0;
        let totalInvested = 0;
        for (const acc of investAccounts) {
          const snap = portfolioSnaps.find((s) => {
            const d = s.snapshotDate.toDate();
            return s.accountId === acc.id && d.getMonth() === m && d.getFullYear() === y;
          });
          if (snap) {
            entry[acc.name] = snap.totalValue;
            totalValue += snap.totalValue;
            totalInvested += snap.totalInvested;
          }
        }
        entry["Total Nilai"] = totalValue;
        entry["Total Modal"] = totalInvested;
        return entry;
      })
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  };

  const portfolioData = getPortfolioData();

  const getExpenseByCategory = () => {
    const filtered = expenseFilterMonth === "all"
      ? allTransactions.filter((t) => t.type === "expense")
      : allTransactions.filter((t) => {
          const d = t.date.toDate();
          return t.type === "expense" && d.getMonth() === expenseFilterMonth;
        });

    const map: Record<string, number> = {};
    filtered.forEach((t) => {
      const key = t.categoryId ?? "other";
      map[key] = (map[key] ?? 0) + t.amount;
    });
    return Object.entries(map)
      .map(([id, value]) => ({ id, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  };

  const expCatData = getExpenseByCategory();
  const totalExpCat = expCatData.reduce((s, d) => s + d.value, 0);

  const totalIncome = monthlyData.reduce((s, r) => s + r.income, 0);
  const totalExpense = monthlyData.reduce((s, r) => s + r.expense, 0);
  const totalSaving = totalIncome - totalExpense;
  const avgSavingRate = monthlyData.filter((r) => r.income > 0).reduce((s, r) => s + r.savingRate, 0) / (monthlyData.filter((r) => r.income > 0).length || 1);
  const currentNetWorth = accounts.reduce((s, a) => s + a.balance, 0);

  const netWorthGrowth = monthlyData.length >= 2
    ? ((monthlyData[monthlyData.length - 1].netWorth - monthlyData[0].netWorth) / Math.max(monthlyData[0].netWorth, 1)) * 100
    : 0;

  const fade = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f7ff] flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-slate-500 text-sm font-medium">Memuat statistik...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f7ff]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        * { font-family: 'Plus Jakarta Sans', sans-serif; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: #e0e0f0; border-radius: 99px; }
        .card { background: white; border-radius: 20px; box-shadow: 0 1px 3px rgba(99,102,241,0.06), 0 4px 16px rgba(99,102,241,0.04); }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">

        {/* Header */}
        <motion.div {...fade} className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm border border-slate-100"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-800 tracking-tight">
                Statistik <span className="text-indigo-600">Keuangan</span>
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">Lihat pola & progres lo dari waktu ke waktu</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={rangeMonths}
              onChange={(e) => setRangeMonths(Number(e.target.value))}
              className="text-sm border border-slate-100 bg-white rounded-xl px-3 py-2 text-slate-600 font-semibold shadow-sm"
            >
              <option value={3}>3 Bulan</option>
              <option value={6}>6 Bulan</option>
              <option value={12}>12 Bulan</option>
            </select>
          </div>
        </motion.div>

        {/* KPI Cards */}
        <motion.div {...fade} transition={{ delay: 0.05 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            {
              label: "Net Worth",
              value: fmtShort(currentNetWorth),
              sub: netWorthGrowth !== 0 ? `${netWorthGrowth >= 0 ? "+" : ""}${netWorthGrowth.toFixed(1)}% periode ini` : "Belum ada data",
              icon: <Wallet className="w-5 h-5" />,
              positive: netWorthGrowth >= 0,
              bg: "bg-indigo-50", color: "text-indigo-600",
            },
            {
              label: "Total Tabungan",
              value: fmtShort(totalSaving),
              sub: `Dari ${fmtShort(totalIncome)} pendapatan`,
              icon: <PiggyBank className="w-5 h-5" />,
              positive: totalSaving >= 0,
              bg: "bg-emerald-50", color: "text-emerald-600",
            },
            {
              label: "Avg Saving Rate",
              value: `${avgSavingRate.toFixed(1)}%`,
              sub: avgSavingRate >= savingTarget ? "🎉 Di atas target!" : `Target ${savingTarget}%`,
              icon: <Target className="w-5 h-5" />,
              positive: avgSavingRate >= savingTarget,
              bg: avgSavingRate >= savingTarget ? "bg-emerald-50" : "bg-amber-50",
              color: avgSavingRate >= savingTarget ? "text-emerald-600" : "text-amber-600",
            },
            {
              label: "Total Pengeluaran",
              value: fmtShort(totalExpense),
              sub: `Rata-rata ${fmtShort(Math.round(totalExpense / rangeMonths))}/bulan`,
              icon: <TrendingDown className="w-5 h-5" />,
              positive: false,
              bg: "bg-rose-50", color: "text-rose-600",
            },
          ].map((kpi) => (
            <motion.div key={kpi.label} whileHover={{ y: -2 }} className="card p-4">
              <div className={`w-9 h-9 ${kpi.bg} ${kpi.color} rounded-xl flex items-center justify-center mb-3`}>
                {kpi.icon}
              </div>
              <p className="text-xs text-slate-400 font-medium mb-1">{kpi.label}</p>
              <p className="text-xl font-extrabold text-slate-800">{kpi.value}</p>
              <p className={`text-xs mt-1 font-medium ${kpi.positive ? "text-emerald-500" : "text-slate-400"}`}>{kpi.sub}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Tabs */}
        <motion.div {...fade} transition={{ delay: 0.08 }} className="flex gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 mb-6 w-fit">
          {(["overview", "investment", "expense", "table"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tab ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-indigo-500 hover:bg-indigo-50"}`}
            >
              {tab === "overview" ? "Overview" : tab === "investment" ? "Investasi" : tab === "expense" ? "Pengeluaran" : "Tabel"}
            </button>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">

          {/* ── OVERVIEW TAB ── */}
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-5">

              {/* Net Worth Chart */}
              <div className="card p-5 lg:p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-base font-bold text-slate-800">Pertumbuhan Net Worth 📈</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Makin naik makin cuan</p>
                  </div>
                  <div className={`px-3 py-1.5 rounded-xl text-xs font-bold ${netWorthGrowth >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                    {netWorthGrowth >= 0 ? "+" : ""}{netWorthGrowth.toFixed(1)}%
                  </div>
                </div>
                {monthlyData.every((r) => r.netWorth === 0) ? (
                  <div className="py-16 text-center">
                    <p className="text-slate-300 text-4xl mb-3">📊</p>
                    <p className="text-slate-400 text-sm">Belum ada data net worth snapshot</p>
                    <p className="text-slate-300 text-xs mt-1">Tambah Net Worth Snapshot dari halaman utama</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={monthlyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={52} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="netWorth" name="Net Worth" stroke="#6366f1" strokeWidth={2.5} fill="url(#nwGrad)" dot={{ fill: "#6366f1", r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: "#6366f1" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Income vs Expense */}
              <div className="card p-5 lg:p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-base font-bold text-slate-800">Pemasukan vs Pengeluaran 💰</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Keliatan boros atau hemat dari sini</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={52} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: "12px", fontWeight: "600", paddingTop: "12px" }} />
                    <Bar dataKey="income" name="Pemasukan" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="expense" name="Pengeluaran" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Saving Rate */}
              <div className="card p-5 lg:p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-base font-bold text-slate-800">Saving Rate Bulanan 🐷</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Target ideal ≥20% pendapatan</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Target:</span>
                    {editingSavingTarget ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          type="number"
                          value={savingTargetInput}
                          onChange={(e) => setSavingTargetInput(e.target.value)}
                          onBlur={() => { setSavingTarget(Number(savingTargetInput)); setEditingSavingTarget(false); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { setSavingTarget(Number(savingTargetInput)); setEditingSavingTarget(false); } }}
                          className="w-16 text-sm border border-indigo-200 rounded-lg px-2 py-1 text-center font-bold text-indigo-600"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setSavingTargetInput(String(savingTarget)); setEditingSavingTarget(true); }}
                        className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all"
                      >
                        {savingTarget}% ✏️
                      </button>
                    )}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Saving Rate"]} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }} />
                    <ReferenceLine y={savingTarget} stroke="#6366f1" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `Target ${savingTarget}%`, position: "right", fontSize: 10, fill: "#6366f1" }} />
                    <Bar dataKey="savingRate" name="Saving Rate" radius={[6, 6, 0, 0]} maxBarSize={32}>
                      {monthlyData.map((entry, i) => (
                        <Cell key={i} fill={entry.savingRate >= savingTarget ? "#10b981" : entry.savingRate >= 0 ? "#f59e0b" : "#f43f5e"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-50">
                  {[
                    { color: "#10b981", label: `≥${savingTarget}% — On track 🎉` },
                    { color: "#f59e0b", label: `<${savingTarget}% — Lumayan` },
                    { color: "#f43f5e", label: "Minus — Boros nih 😬" },
                  ].map((l) => (
                    <div key={l.label} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                      <span className="text-xs text-slate-500">{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── INVESTMENT TAB ── */}
          {activeTab === "investment" && (
            <motion.div key="investment" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-5">

              {/* Portfolio Growth Chart */}
              <div className="card p-5 lg:p-6">
                <div className="mb-6">
                  <h2 className="text-base font-bold text-slate-800">Pertumbuhan Portofolio 📊</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Modal vs nilai sekarang</p>
                </div>
                {portfolioData.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="text-slate-300 text-4xl mb-3">📈</p>
                    <p className="text-slate-400 text-sm">Belum ada data portofolio</p>
                    <p className="text-slate-300 text-xs mt-1">Update snapshot dari kartu akun investasi di halaman utama</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={portfolioData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="modGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={52} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: "12px", fontWeight: "600", paddingTop: "12px" }} />
                      <Area type="monotone" dataKey="Total Modal" stroke="#6366f1" strokeWidth={2} fill="url(#modGrad)" dot={{ fill: "#6366f1", r: 3, strokeWidth: 0 }} />
                      <Area type="monotone" dataKey="Total Nilai" stroke="#10b981" strokeWidth={2.5} fill="url(#valGrad)" dot={{ fill: "#10b981", r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Per-Account Portfolio Cards */}
              {accounts.filter((a) => a.type === "mutual_fund" || a.type === "stock").length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-600 mb-3">Detail per Akun Investasi</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {accounts.filter((a) => a.type === "mutual_fund" || a.type === "stock").map((acc) => {
                      const snaps = portfolioSnaps.filter((s) => s.accountId === acc.id).sort((a, b) => b.snapshotDate.toMillis() - a.snapshotDate.toMillis());
                      const latest = snaps[0];
                      const prev = snaps[1];
                      const monthlyChange = latest && prev ? latest.totalValue - prev.totalValue : 0;

                      if (!latest) return (
                        <div key={acc.id} className="card p-5">
                          <p className="font-bold text-slate-700 mb-1">{acc.name}</p>
                          <p className="text-sm text-slate-400">Belum ada snapshot</p>
                        </div>
                      );

                      return (
                        <motion.div key={acc.id} whileHover={{ y: -2 }} className="card p-5">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <p className="font-bold text-slate-800">{acc.name}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{acc.type === "mutual_fund" ? "Reksa Dana" : "Saham"}</p>
                            </div>
                            <div className={`px-2.5 py-1 rounded-xl text-xs font-bold ${latest.returnPercent >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                              {latest.returnPercent >= 0 ? "+" : ""}{latest.returnPercent.toFixed(2)}%
                            </div>
                          </div>
                          <p className="text-2xl font-extrabold text-slate-800 mb-3">{fmt(latest.totalValue)}</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-50 rounded-xl p-3">
                              <p className="text-xs text-slate-400 mb-1">Modal</p>
                              <p className="text-sm font-bold text-slate-700">{fmtShort(latest.totalInvested)}</p>
                            </div>
                            <div className={`rounded-xl p-3 ${latest.returnAmount >= 0 ? "bg-emerald-50" : "bg-rose-50"}`}>
                              <p className={`text-xs mb-1 ${latest.returnAmount >= 0 ? "text-emerald-500" : "text-rose-500"}`}>Return</p>
                              <p className={`text-sm font-bold ${latest.returnAmount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                {latest.returnAmount >= 0 ? "+" : ""}{fmtShort(latest.returnAmount)}
                              </p>
                            </div>
                          </div>
                          {monthlyChange !== 0 && (
                            <div className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${monthlyChange >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                              {monthlyChange >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                              {monthlyChange >= 0 ? "+" : ""}{fmtShort(monthlyChange)} dari bulan lalu
                            </div>
                          )}

                          {snaps.length > 1 && (
                            <div className="mt-4">
                              <ResponsiveContainer width="100%" height={80}>
                                <AreaChart data={snaps.slice(0, 6).reverse().map((s) => ({ label: MONTHS[s.snapshotDate.toDate().getMonth()], value: s.totalValue }))}>
                                  <defs>
                                    <linearGradient id={`grad-${acc.id}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                  </defs>
                                  <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill={`url(#grad-${acc.id})`} dot={false} />
                                  <XAxis dataKey="label" hide />
                                  <YAxis hide />
                                  <Tooltip formatter={(v: number) => fmtShort(v)} contentStyle={{ borderRadius: "10px", fontSize: "11px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ── EXPENSE TAB ── */}
          {activeTab === "expense" && (
            <motion.div key="expense" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-5">
              <div className="card p-5 lg:p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-base font-bold text-slate-800">Breakdown Pengeluaran 🍩</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Bocornya di kategori mana?</p>
                  </div>
                  <select
                    value={expenseFilterMonth === "all" ? "all" : String(expenseFilterMonth)}
                    onChange={(e) => setExpenseFilterMonth(e.target.value === "all" ? "all" : Number(e.target.value))}
                    className="text-xs border border-slate-100 bg-slate-50 rounded-xl px-3 py-2 text-slate-600 font-semibold"
                  >
                    <option value="all">Semua Bulan</option>
                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                </div>

                {expCatData.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="text-slate-300 text-4xl mb-3">🎉</p>
                    <p className="text-slate-400 text-sm">Tidak ada pengeluaran di periode ini</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={expCatData} cx="50%" cy="50%" innerRadius={65} outerRadius={100} dataKey="value" paddingAngle={3}>
                          {expCatData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }} />
                      </PieChart>
                    </ResponsiveContainer>

                    <div className="flex flex-col gap-2 justify-center">
                      {expCatData.map((item, i) => {
                        const pct = (item.value / totalExpCat) * 100;
                        return (
                          <div key={item.id}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                                <span className="text-xs font-semibold text-slate-600 truncate max-w-[120px]">{item.id}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-700">{fmtShort(item.value)}</span>
                                <span className="text-xs text-slate-400 w-10 text-right">{pct.toFixed(1)}%</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.6, delay: i * 0.05, ease: "easeOut" }}
                                className="h-full rounded-full"
                                style={{ background: PALETTE[i % PALETTE.length] }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Expense Trend Bar Chart */}
              <div className="card p-5 lg:p-6">
                <div className="mb-6">
                  <h2 className="text-base font-bold text-slate-800">Tren Pengeluaran Bulanan</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Naik turunnya pengeluaran</p>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={52} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="expense" name="Pengeluaran" radius={[6, 6, 0, 0]} maxBarSize={36}>
                      {monthlyData.map((entry, i) => {
                        const avg = monthlyData.reduce((s, r) => s + r.expense, 0) / monthlyData.length;
                        return <Cell key={i} fill={entry.expense > avg * 1.2 ? "#f43f5e" : entry.expense > avg ? "#f59e0b" : "#6366f1"} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          {/* ── TABLE TAB ── */}
          {activeTab === "table" && (
            <motion.div key="table" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <div className="card p-5 lg:p-6">
                <div className="mb-6">
                  <h2 className="text-base font-bold text-slate-800">Ringkasan Bulanan 📋</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Lihat pattern keuangan lo dari waktu ke waktu</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        {["Bulan", "Pemasukan", "Pengeluaran", "Nabung", "Saving Rate", "Net Worth"].map((h) => (
                          <th key={h} className="pb-3 text-left text-xs font-bold text-slate-400 pr-4 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.map((row, i) => (
                        <motion.tr
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors"
                        >
                          <td className="py-3.5 pr-4">
                            <span className="text-sm font-bold text-slate-700 whitespace-nowrap">{row.label}</span>
                          </td>
                          <td className="py-3.5 pr-4">
                            <span className="text-sm font-semibold text-emerald-600">+{fmtShort(row.income)}</span>
                          </td>
                          <td className="py-3.5 pr-4">
                            <span className="text-sm font-semibold text-rose-600">-{fmtShort(row.expense)}</span>
                          </td>
                          <td className="py-3.5 pr-4">
                            <span className={`text-sm font-semibold ${row.saving >= 0 ? "text-indigo-600" : "text-rose-600"}`}>
                              {row.saving >= 0 ? "+" : ""}{fmtShort(row.saving)}
                            </span>
                          </td>
                          <td className="py-3.5 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.max(0, Math.min(row.savingRate, 100))}%`,
                                    background: row.savingRate >= savingTarget ? "#10b981" : row.savingRate >= 0 ? "#f59e0b" : "#f43f5e",
                                  }}
                                />
                              </div>
                              <span className={`text-xs font-bold ${row.savingRate >= savingTarget ? "text-emerald-600" : row.savingRate >= 0 ? "text-amber-600" : "text-rose-600"}`}>
                                {row.savingRate.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5">
                            <span className="text-sm font-bold text-slate-700">
                              {row.netWorth > 0 ? fmtShort(row.netWorth) : <span className="text-slate-300">—</span>}
                            </span>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-100">
                        <td className="pt-4 pr-4 text-xs font-bold text-slate-500">TOTAL</td>
                        <td className="pt-4 pr-4 text-sm font-extrabold text-emerald-600">+{fmtShort(totalIncome)}</td>
                        <td className="pt-4 pr-4 text-sm font-extrabold text-rose-600">-{fmtShort(totalExpense)}</td>
                        <td className="pt-4 pr-4 text-sm font-extrabold text-indigo-600">{totalSaving >= 0 ? "+" : ""}{fmtShort(totalSaving)}</td>
                        <td className="pt-4 pr-4 text-sm font-extrabold text-slate-700">{avgSavingRate.toFixed(1)}%</td>
                        <td className="pt-4 text-sm font-extrabold text-slate-700">{fmtShort(currentNetWorth)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, ArrowRightLeft, Plus, Target, BarChart2,
  ChevronRight, X, Check, Edit2, Trash2, ArrowUpRight, ArrowDownLeft, Repeat2,
  Flame, Filter, ChevronDown, Loader2, PiggyBank, Eye, EyeOff,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import Swal from "sweetalert2";
import { Timestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";

import {
  getAccounts, createAccount, updateAccount,
  getCategories, createCategory,
  getTransactions, createTransaction, updateTransaction, deleteTransaction, getMonthlyStats,
  getExpenseByCategory,
  getGoals, createGoal, updateGoal, depositToGoal, deleteGoal,
  getLatestPortfolioSnapshot, createPortfolioSnapshot,
} from "@/utils/crud";
import type {
  Account, Category, Transaction, Goal, PortfolioSnapshot,
  CreateTransaction, CreateGoal, CreatePortfolioSnapshot,
} from "@/types";

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(n);
};

const PALETTE = ["#6366f1", "#f43f5e", "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];

const DEFAULT_CATEGORIES: { name: string; icon: string; type: "income" | "expense" }[] = [
  { name: "Gaji", icon: "💼", type: "income" },
  { name: "Freelance", icon: "💻", type: "income" },
  { name: "Investasi", icon: "📈", type: "income" },
  { name: "Lainnya (in)", icon: "💰", type: "income" },
  { name: "Makan", icon: "🍜", type: "expense" },
  { name: "Transport", icon: "🚗", type: "expense" },
  { name: "Belanja", icon: "🛍️", type: "expense" },
  { name: "Hiburan", icon: "🎮", type: "expense" },
  { name: "Kesehatan", icon: "💊", type: "expense" },
  { name: "Pendidikan", icon: "📚", type: "expense" },
  { name: "Tagihan", icon: "🧾", type: "expense" },
  { name: "Lainnya (out)", icon: "📦", type: "expense" },
];

const ACCOUNT_COLORS: Record<string, string> = {
  bank: "#6366f1",
  mutual_fund: "#10b981",
  stock: "#f59e0b",
  cash: "#3b82f6",
};

type Modal = "none" | "addTx" | "editTx" | "addGoal" | "depositGoal" | "addSnapshot" | "addAccount" | "txDetail";

export default function Dashboard() {
  const router = useRouter();
  const now = new Date();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [portfolioSnaps, setPortfolioSnaps] = useState<Record<string, PortfolioSnapshot>>({});
  const [monthlyStats, setMonthlyStats] = useState({ income: 0, expense: 0, balance: 0 });
  const [expenseByCategory, setExpenseByCategory] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [balanceHidden, setBalanceHidden] = useState(false);

  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  const [filterYear, setFilterYear] = useState(now.getFullYear());

  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [budgetInput, setBudgetInput] = useState("");

  const [modal, setModal] = useState<Modal>("none");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [selectedAccountDetail, setSelectedAccountDetail] = useState<string | null>(null);

  const [txForm, setTxForm] = useState<{
    type: "income" | "expense" | "transfer";
    amount: string;
    categoryId: string;
    accountId: string;
    toAccountId: string;
    note: string;
    date: string;
  }>({
    type: "expense",
    amount: "",
    categoryId: "",
    accountId: "",
    toAccountId: "",
    note: "",
    date: now.toISOString().split("T")[0],
  });

  const [goalForm, setGoalForm] = useState({ name: "", targetAmount: "", deadline: "", linkedAccountId: "" });
  const [depositAmount, setDepositAmount] = useState("");
  const [snapshotForm, setSnapshotForm] = useState({ accountId: "", totalValue: "", totalInvested: "" });
  const [accountForm, setAccountForm] = useState({ name: "", type: "bank" as Account["type"], balance: "", currency: "IDR" });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accs, cats, txs, gls, stats, expCat] = await Promise.all([
        getAccounts(),
        getCategories(),
        getTransactions({ month: filterMonth, year: filterYear, limitCount: 50 }),
        getGoals(),
        getMonthlyStats(filterMonth, filterYear),
        getExpenseByCategory(filterMonth, filterYear),
      ]);
      setAccounts(accs);
      setCategories(cats.length ? cats : []);
      setTransactions(txs);
      setGoals(gls);
      setMonthlyStats(stats);
      setExpenseByCategory(expCat);

      const snaps: Record<string, PortfolioSnapshot> = {};
      await Promise.all(
        accs.filter((a) => a.type === "mutual_fund" || a.type === "stock").map(async (a) => {
          const s = await getLatestPortfolioSnapshot(a.id);
          if (s) snaps[a.id] = s;
        })
      );
      setPortfolioSnaps(snaps);

      if (cats.length === 0) {
        await Promise.all(DEFAULT_CATEGORIES.map((c) => createCategory(c)));
        const newCats = await getCategories();
        setCategories(newCats);
      }
    } catch {
      toast.error("Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterYear]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalNetWorth = accounts.reduce((s, a) => {
    if (a.type === "mutual_fund" || a.type === "stock") {
      return s + (portfolioSnaps[a.id]?.totalValue ?? a.balance);
    }
    return s + a.balance;
  }, 0);

  const filteredTx = filterAccount === "all"
    ? transactions
    : transactions.filter((t) => t.accountId === filterAccount || t.toAccountId === filterAccount);

  const pieData = Object.entries(expenseByCategory)
    .map(([catId, amount]) => {
      const cat = categories.find((c) => c.id === catId);
      return { name: cat ? `${cat.icon} ${cat.name}` : "Lainnya", value: amount, id: catId };
    })
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const handleSaveTx = async () => {
    if (!txForm.amount || !txForm.accountId) return toast.error("Lengkapi form dulu ya!");
    if (txForm.type === "transfer" && !txForm.toAccountId) return toast.error("Pilih akun tujuan");
    const amount = parseFloat(txForm.amount.replace(/\D/g, ""));
    if (isNaN(amount) || amount <= 0) return toast.error("Nominal tidak valid");

    try {
      const payload: CreateTransaction = {
        type: txForm.type,
        amount,
        accountId: txForm.accountId,
        categoryId: txForm.type !== "transfer" ? (txForm.categoryId || null) : null,
        note: txForm.note,
        date: Timestamp.fromDate(new Date(txForm.date)),
        toAccountId: txForm.type === "transfer" ? txForm.toAccountId : undefined,
      };

      if (selectedTx) {
        await updateTransaction(selectedTx.id, { ...payload });
        toast.success("Transaksi diperbarui!");
      } else {
        await createTransaction(payload);
        toast.success("Transaksi ditambahkan!");
      }
      setModal("none");
      setSelectedTx(null);
      resetTxForm();
      await loadData();
    } catch {
      toast.error("Gagal simpan transaksi");
    }
  };

  const handleDeleteTx = async (id: string) => {
    const result = await Swal.fire({
      title: "Hapus transaksi?",
      text: "Ini akan mempengaruhi saldo akun.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#f43f5e",
      background: "#fff",
    });
    if (!result.isConfirmed) return;
    try {
      await deleteTransaction(id);
      toast.success("Transaksi dihapus");
      await loadData();
    } catch {
      toast.error("Gagal hapus");
    }
  };

  const handleSaveGoal = async () => {
    if (!goalForm.name || !goalForm.targetAmount) return toast.error("Lengkapi form");
    try {
      await createGoal({
        name: goalForm.name,
        targetAmount: parseFloat(goalForm.targetAmount.replace(/\D/g, "")),
        currentAmount: 0,
        deadline: goalForm.deadline ? Timestamp.fromDate(new Date(goalForm.deadline)) : null,
        linkedAccountId: goalForm.linkedAccountId || null,
        isDone: false,
      });
      toast.success("Goal dibuat!");
      setModal("none");
      setGoalForm({ name: "", targetAmount: "", deadline: "", linkedAccountId: "" });
      await loadData();
    } catch {
      toast.error("Gagal buat goal");
    }
  };

  const handleDeposit = async () => {
    if (!selectedGoal || !depositAmount) return;
    const amount = parseFloat(depositAmount.replace(/\D/g, ""));
    if (isNaN(amount) || amount <= 0) return toast.error("Nominal tidak valid");
    try {
      await depositToGoal(selectedGoal.id, amount);
      toast.success(`+${fmt(amount)} ke ${selectedGoal.name}`);
      setModal("none");
      setDepositAmount("");
      setSelectedGoal(null);
      await loadData();
    } catch {
      toast.error("Gagal setor");
    }
  };

  const handleDeleteGoal = async (id: string) => {
    const result = await Swal.fire({
      title: "Hapus goal?", icon: "warning",
      showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal",
      confirmButtonColor: "#f43f5e", background: "#fff",
    });
    if (!result.isConfirmed) return;
    try {
      await deleteGoal(id);
      toast.success("Goal dihapus");
      await loadData();
    } catch {
      toast.error("Gagal hapus");
    }
  };

  const handleSaveSnapshot = async () => {
    if (!snapshotForm.accountId || !snapshotForm.totalValue || !snapshotForm.totalInvested)
      return toast.error("Lengkapi form");
    const totalValue = parseFloat(snapshotForm.totalValue.replace(/\D/g, ""));
    const totalInvested = parseFloat(snapshotForm.totalInvested.replace(/\D/g, ""));
    const returnAmount = totalValue - totalInvested;
    const returnPercent = totalInvested > 0 ? (returnAmount / totalInvested) * 100 : 0;
    try {
      const payload: CreatePortfolioSnapshot = {
        accountId: snapshotForm.accountId,
        totalValue, totalInvested, returnAmount, returnPercent,
        snapshotDate: Timestamp.now(),
      };
      await createPortfolioSnapshot(payload);
      toast.success("Snapshot disimpan!");
      setModal("none");
      setSnapshotForm({ accountId: "", totalValue: "", totalInvested: "" });
      await loadData();
    } catch {
      toast.error("Gagal simpan snapshot");
    }
  };

  const handleSaveAccount = async () => {
    if (!accountForm.name || !accountForm.balance) return toast.error("Lengkapi form");
    try {
      await createAccount({
        name: accountForm.name,
        type: accountForm.type,
        balance: parseFloat(accountForm.balance.replace(/\D/g, "")),
        currency: accountForm.currency,
        isActive: true,
      });
      toast.success("Akun ditambahkan!");
      setModal("none");
      setAccountForm({ name: "", type: "bank", balance: "", currency: "IDR" });
      await loadData();
    } catch {
      toast.error("Gagal tambah akun");
    }
  };

  const resetTxForm = () => {
    setTxForm({ type: "expense", amount: "", categoryId: "", accountId: accounts[0]?.id ?? "", toAccountId: "", note: "", date: now.toISOString().split("T")[0] });
  };

  const openEditTx = (tx: Transaction) => {
    setSelectedTx(tx);
    setTxForm({
      type: tx.type,
      amount: String(tx.amount),
      categoryId: tx.categoryId ?? "",
      accountId: tx.accountId,
      toAccountId: tx.toAccountId ?? "",
      note: tx.note,
      date: tx.date.toDate().toISOString().split("T")[0],
    });
    setModal("editTx");
  };

  const getAccountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;
  const getCategoryInfo = (id: string | null) => categories.find((c) => c.id === id);

  const estimateGoalMonths = (goal: Goal) => {
    if (goal.isDone) return 0;
    const remaining = goal.targetAmount - goal.currentAmount;
    const monthsOld = Math.max(1, Math.ceil((Date.now() - goal.createdAt.toMillis()) / (1000 * 60 * 60 * 24 * 30)));
    const avgPerMonth = goal.currentAmount / monthsOld;
    if (avgPerMonth <= 0) return null;
    return Math.ceil(remaining / avgPerMonth);
  };

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

  const txTypeIcon = (type: string) => {
    if (type === "income") return <ArrowDownLeft className="w-4 h-4 text-emerald-500" />;
    if (type === "expense") return <ArrowUpRight className="w-4 h-4 text-rose-500" />;
    return <Repeat2 className="w-4 h-4 text-indigo-500" />;
  };

  const fade = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-slate-500 text-sm font-medium tracking-wide">Memuat dashboard...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f7ff] font-sans">
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: "12px", fontFamily: "inherit" } }} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        * { font-family: 'Plus Jakarta Sans', sans-serif; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: #e0e0f0; border-radius: 99px; }
        .card { background: white; border-radius: 20px; box-shadow: 0 1px 3px rgba(99,102,241,0.06), 0 4px 16px rgba(99,102,241,0.04); }
        .card-hover { transition: all 0.2s ease; }
        .card-hover:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(99,102,241,0.12); }
        input:focus, select:focus, textarea:focus { outline: none; border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">

        {/* ── Top Nav ── */}
        <motion.div {...fade} className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-800 tracking-tight">
              <span className="text-indigo-600">Duit</span>Radya 💸
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">{new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/stats")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-slate-600 font-semibold text-sm hover:bg-indigo-50 hover:text-indigo-600 transition-all border border-slate-100"
            >
              <BarChart2 className="w-4 h-4" />
              <span className="hidden sm:inline">Statistik</span>
            </button>
            <button
              onClick={() => { resetTxForm(); setModal("addTx"); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Transaksi</span>
            </button>
          </div>
        </motion.div>

        {/* ── Summary Bar ── */}
        <motion.div {...fade} transition={{ delay: 0.05 }} className="card p-5 lg:p-6 mb-5 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.04) 0%, rgba(236,72,153,0.02) 100%)" }} />
          <div className="flex items-center justify-between mb-4">
            <p className="text-slate-400 text-sm font-medium">Total Uang</p>
            <button onClick={() => setBalanceHidden((v) => !v)} className="text-slate-300 hover:text-slate-500 transition-colors">
              {balanceHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-3xl lg:text-4xl font-extrabold text-slate-800 mb-5 tracking-tight">
            {balanceHidden ? "••••••••" : fmt(totalNetWorth)}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Pemasukan", val: monthlyStats.income, icon: <TrendingUp className="w-4 h-4" />, color: "text-emerald-600", bg: "bg-emerald-50", sign: "+" },
              { label: "Pengeluaran", val: monthlyStats.expense, icon: <TrendingDown className="w-4 h-4" />, color: "text-rose-600", bg: "bg-rose-50", sign: "-" },
              { label: "Sisa", val: monthlyStats.balance, icon: <Wallet className="w-4 h-4" />, color: monthlyStats.balance >= 0 ? "text-indigo-600" : "text-rose-600", bg: monthlyStats.balance >= 0 ? "bg-indigo-50" : "bg-rose-50", sign: "" },
            ].map((item) => (
              <div key={item.label} className={`${item.bg} rounded-2xl p-3 lg:p-4`}>
                <div className={`${item.color} flex items-center gap-1.5 mb-2`}>
                  {item.icon}
                  <span className="text-xs font-semibold">{item.label}</span>
                </div>
                <p className={`text-base lg:text-lg font-bold ${item.color}`}>
                  {balanceHidden ? "•••" : `${item.sign}${fmtShort(item.val)}`}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{monthNames[filterMonth]} {filterYear}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── LEFT COLUMN ── */}
          <div className="lg:col-span-2 flex flex-col gap-5">

            {/* Accounts */}
            <motion.div {...fade} transition={{ delay: 0.1 }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-slate-700">Akun</h2>
                <button onClick={() => setModal("addAccount")} className="text-xs text-indigo-500 font-semibold hover:text-indigo-700 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Tambah
                </button>
              </div>
              {accounts.length === 0 ? (
                <div className="card p-8 text-center">
                  <Wallet className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">Belum ada akun. Tambah sekarang!</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                  {accounts.map((acc) => {
                    const isPortfolio = acc.type === "mutual_fund" || acc.type === "stock";
                    const snap = portfolioSnaps[acc.id];
                    const val = snap?.totalValue ?? acc.balance;
                    const ret = snap?.returnPercent ?? 0;
                    const color = ACCOUNT_COLORS[acc.type] ?? "#6366f1";
                    return (
                      <motion.div
                        key={acc.id}
                        whileHover={{ scale: 1.01 }}
                        className="card card-hover p-4 cursor-pointer"
                        onClick={() => setSelectedAccountDetail(selectedAccountDetail === acc.id ? null : acc.id)}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ background: color }}>
                            {acc.name.charAt(0).toUpperCase()}
                          </div>
                          <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform ${selectedAccountDetail === acc.id ? "rotate-90" : ""}`} />
                        </div>
                        <p className="text-xs text-slate-400 font-medium truncate">{acc.name}</p>
                        <p className="text-lg font-extrabold text-slate-800 mt-0.5 truncate">{balanceHidden ? "•••" : fmtShort(val)}</p>
                        {isPortfolio && snap && (
                          <div className={`flex items-center gap-1 mt-1 text-xs font-semibold ${ret >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                            {ret >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {ret.toFixed(2)}%
                          </div>
                        )}
                        {isPortfolio && (
                          <button
                            className="mt-2 text-xs text-indigo-400 hover:text-indigo-600 font-semibold flex items-center gap-1"
                            onClick={(e) => { e.stopPropagation(); setSnapshotForm({ accountId: acc.id, totalValue: "", totalInvested: "" }); setModal("addSnapshot"); }}
                          >
                            <Plus className="w-3 h-3" /> Update
                          </button>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>

            {/* Quick Add Tx */}
            <motion.div {...fade} transition={{ delay: 0.12 }} className="card p-5">
              <h2 className="text-base font-bold text-slate-700 mb-4 flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" /> Tambah Cepat
              </h2>
              <div className="flex gap-2 mb-4">
                {(["expense", "income", "transfer"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTxForm((prev) => ({ ...prev, type: t }))}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${txForm.type === t
                      ? t === "income" ? "bg-emerald-500 text-white" : t === "expense" ? "bg-rose-500 text-white" : "bg-indigo-500 text-white"
                      : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}
                  >
                    {t === "income" ? "Pemasukan" : t === "expense" ? "Pengeluaran" : "Transfer"}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2">
                  <input
                    type="text"
                    placeholder="Nominal (Rp)"
                    value={txForm.amount ? `Rp ${Number(txForm.amount.replace(/\D/g, "")).toLocaleString("id-ID")}` : ""}
                    onChange={(e) => setTxForm((p) => ({ ...p, amount: e.target.value.replace(/\D/g, "") }))}
                    className="w-full border border-slate-100 bg-slate-50 rounded-xl px-4 py-3 text-slate-700 text-lg font-bold placeholder:text-slate-300 transition-all"
                  />
                </div>
                <select
                  value={txForm.accountId}
                  onChange={(e) => setTxForm((p) => ({ ...p, accountId: e.target.value }))}
                  className="border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all"
                >
                  <option value="">Pilih Akun</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {txForm.type === "transfer" ? (
                  <select
                    value={txForm.toAccountId}
                    onChange={(e) => setTxForm((p) => ({ ...p, toAccountId: e.target.value }))}
                    className="border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all"
                  >
                    <option value="">Ke Akun</option>
                    {accounts.filter((a) => a.id !== txForm.accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                ) : (
                  <select
                    value={txForm.categoryId}
                    onChange={(e) => setTxForm((p) => ({ ...p, categoryId: e.target.value }))}
                    className="border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all"
                  >
                    <option value="">Kategori</option>
                    {categories.filter((c) => c.type === txForm.type).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                )}
                <input
                  type="date"
                  value={txForm.date}
                  onChange={(e) => setTxForm((p) => ({ ...p, date: e.target.value }))}
                  className="border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all"
                />
                <input
                  type="text"
                  placeholder="Catatan (opsional)"
                  value={txForm.note}
                  onChange={(e) => setTxForm((p) => ({ ...p, note: e.target.value }))}
                  className="border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all"
                />
              </div>
              <button
                onClick={handleSaveTx}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-sm shadow-indigo-100 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" /> Simpan Transaksi
              </button>
            </motion.div>

            {/* Transaction History */}
            <motion.div {...fade} transition={{ delay: 0.15 }} className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-700">Riwayat Transaksi</h2>
                <div className="flex items-center gap-2">
                  <select
                    value={`${filterMonth}-${filterYear}`}
                    onChange={(e) => { const [m, y] = e.target.value.split("-"); setFilterMonth(Number(m)); setFilterYear(Number(y)); }}
                    className="text-xs border border-slate-100 bg-slate-50 rounded-lg px-2 py-1.5 text-slate-600 font-medium"
                  >
                    {Array.from({ length: 12 }, (_, i) => {
                      const m = (now.getMonth() - i + 12) % 12;
                      const y = now.getFullYear() - Math.floor((i - now.getMonth() + 12) / 12);
                      return <option key={i} value={`${m}-${y}`}>{monthNames[m]} {y}</option>;
                    })}
                  </select>
                  <select
                    value={filterAccount}
                    onChange={(e) => setFilterAccount(e.target.value)}
                    className="text-xs border border-slate-100 bg-slate-50 rounded-lg px-2 py-1.5 text-slate-600 font-medium"
                  >
                    <option value="all">Semua Akun</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>

              {filteredTx.length === 0 ? (
                <div className="py-12 text-center">
                  <ArrowRightLeft className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">Belum ada transaksi bulan ini</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {filteredTx.map((tx) => {
                    const cat = getCategoryInfo(tx.categoryId);
                    return (
                      <motion.div
                        key={tx.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-all group"
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0 ${tx.type === "income" ? "bg-emerald-50" : tx.type === "expense" ? "bg-rose-50" : "bg-indigo-50"}`}>
                          {tx.type === "transfer" ? "↔" : cat?.icon ?? "💸"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-700 truncate">
                            {tx.note || (tx.type === "transfer" ? `${getAccountName(tx.accountId)} → ${getAccountName(tx.toAccountId ?? "")}` : cat?.name ?? "Transaksi")}
                          </p>
                          <p className="text-xs text-slate-400">{getAccountName(tx.accountId)} · {tx.date.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-sm font-bold ${tx.type === "income" ? "text-emerald-600" : tx.type === "expense" ? "text-rose-600" : "text-indigo-600"}`}>
                            {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "↔"}{fmtShort(tx.amount)}
                          </p>
                          <div className="flex gap-1 justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditTx(tx)} className="p-1 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-500 transition-colors">
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button onClick={() => handleDeleteTx(tx.id)} className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="flex flex-col gap-5">

            {/* Expense Chart */}
            <motion.div {...fade} transition={{ delay: 0.17 }} className="card p-5">
              <h2 className="text-base font-bold text-slate-700 mb-1">Keluarnya di Mana</h2>
              <p className="text-xs text-slate-400 mb-4">{monthNames[filterMonth]} {filterYear}</p>
              {pieData.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-slate-300 text-3xl mb-2">🎉</p>
                  <p className="text-slate-400 text-sm">Belum ada pengeluaran</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3}>
                        {pieData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-1.5 mt-3">
                    {pieData.slice(0, 5).map((item, i) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                        <span className="text-xs text-slate-600 flex-1 truncate">{item.name}</span>
                        <span className="text-xs font-bold text-slate-700">{fmtShort(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>

            {/* Money Flow */}
            <motion.div {...fade} transition={{ delay: 0.19 }} className="card p-5">
              <h2 className="text-base font-bold text-slate-700 mb-4">Alur Uang 💫</h2>
              {accounts.length === 0 || monthlyStats.income === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">Belum ada data alur</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl">
                    <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-emerald-700">Total Masuk</p>
                      <p className="text-sm font-bold text-emerald-800">+{fmt(monthlyStats.income)}</p>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <div className="w-px h-6 bg-slate-200" />
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {accounts.slice(0, 4).map((acc) => {
                      const accTxs = transactions.filter((t) => t.accountId === acc.id || t.toAccountId === acc.id);
                      const totalIn = accTxs.filter((t) => t.type === "income" || t.toAccountId === acc.id).reduce((s, t) => s + t.amount, 0);
                      if (totalIn === 0) return null;
                      return (
                        <div key={acc.id} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl">
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: ACCOUNT_COLORS[acc.type] ?? "#6366f1" }}>
                            {acc.name.charAt(0)}
                          </div>
                          <span className="text-xs font-medium text-slate-600 flex-1 truncate">{acc.name}</span>
                          <span className="text-xs font-bold text-slate-700">{fmtShort(totalIn)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-center">
                    <div className="w-px h-6 bg-slate-200" />
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-rose-50 rounded-xl">
                    <ArrowUpRight className="w-4 h-4 text-rose-500" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-rose-700">Total Keluar</p>
                      <p className="text-sm font-bold text-rose-800">-{fmt(monthlyStats.expense)}</p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Budget */}
            <motion.div {...fade} transition={{ delay: 0.21 }} className="card p-5">
              <h2 className="text-base font-bold text-slate-700 mb-4">Budget 🎯</h2>
              {categories.filter((c) => c.type === "expense").slice(0, 6).map((cat) => {
                const limit = budgets[cat.id] ?? 0;
                const used = expenseByCategory[cat.id] ?? 0;
                const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
                const isEditing = editingBudget === cat.id;
                return (
                  <div key={cat.id} className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-600">{cat.icon} {cat.name}</span>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            type="text"
                            value={budgetInput}
                            onChange={(e) => setBudgetInput(e.target.value.replace(/\D/g, ""))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                setBudgets((p) => ({ ...p, [cat.id]: Number(budgetInput) }));
                                setEditingBudget(null);
                              }
                              if (e.key === "Escape") setEditingBudget(null);
                            }}
                            className="w-24 text-xs border border-indigo-200 rounded-lg px-2 py-1 text-right font-bold"
                            placeholder="Limit"
                          />
                          <button onClick={() => { setBudgets((p) => ({ ...p, [cat.id]: Number(budgetInput) })); setEditingBudget(null); }} className="text-emerald-500">
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingBudget(cat.id); setBudgetInput(String(limit)); }}
                          className="text-xs text-slate-400 hover:text-indigo-500 font-medium flex items-center gap-1"
                        >
                          {limit > 0 ? <span className={pct >= 80 ? "text-rose-500 font-bold" : "text-slate-500"}>{fmtShort(used)}/{fmtShort(limit)}</span> : <span className="text-slate-300">+ Set</span>}
                        </button>
                      )}
                    </div>
                    {limit > 0 && (
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          className="h-full rounded-full transition-all"
                          style={{ background: pct >= 90 ? "#f43f5e" : pct >= 70 ? "#f59e0b" : "#6366f1" }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>

            {/* Goals */}
            <motion.div {...fade} transition={{ delay: 0.23 }} className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-700 flex items-center gap-2"><PiggyBank className="w-4 h-4 text-indigo-400" /> Goals</h2>
                <button onClick={() => setModal("addGoal")} className="text-xs text-indigo-500 font-semibold hover:text-indigo-700 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Tambah
                </button>
              </div>
              {goals.length === 0 ? (
                <div className="py-8 text-center">
                  <Target className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">Belum ada goals</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {goals.map((goal) => {
                    const pct = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
                    const monthsLeft = estimateGoalMonths(goal);
                    return (
                      <div key={goal.id} className={`p-3 rounded-2xl border ${goal.isDone ? "border-emerald-100 bg-emerald-50/50" : "border-slate-100 bg-slate-50/50"}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                              {goal.isDone && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                              {goal.name}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">{fmtShort(goal.currentAmount)} / {fmtShort(goal.targetAmount)}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {!goal.isDone && (
                              <button
                                onClick={() => { setSelectedGoal(goal); setDepositAmount(""); setModal("depositGoal"); }}
                                className="text-xs font-bold text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-all"
                              >
                                Setor
                              </button>
                            )}
                            <button onClick={() => handleDeleteGoal(goal.id)} className="p-1 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-400 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="h-2 bg-white rounded-full overflow-hidden mb-1.5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="h-full rounded-full"
                            style={{ background: goal.isDone ? "#10b981" : "linear-gradient(90deg, #6366f1, #8b5cf6)" }}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500">{pct.toFixed(0)}%</span>
                          {!goal.isDone && monthsLeft !== null && (
                            <span className="text-xs text-slate-400">~{monthsLeft} bulan lagi</span>
                          )}
                          {goal.deadline && !goal.isDone && (
                            <span className="text-xs text-slate-400">
                              Deadline: {goal.deadline.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>

          </div>
        </div>
      </div>

      {/* ── MODALS ── */}
      <AnimatePresence>
        {modal !== "none" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setModal("none"); setSelectedTx(null); } }}
          >
            <motion.div
              initial={{ opacity: 0, y: 60, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.96 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl"
            >

              {/* Edit / Add Transaction Modal */}
              {(modal === "addTx" || modal === "editTx") && (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-slate-800">{selectedTx ? "Edit Transaksi" : "Transaksi Baru"}</h3>
                    <button onClick={() => { setModal("none"); setSelectedTx(null); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-2 mb-4">
                    {(["expense", "income", "transfer"] as const).map((t) => (
                      <button key={t} onClick={() => setTxForm((p) => ({ ...p, type: t }))}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${txForm.type === t ? t === "income" ? "bg-emerald-500 text-white" : t === "expense" ? "bg-rose-500 text-white" : "bg-indigo-500 text-white" : "bg-slate-50 text-slate-500"}`}>
                        {t === "income" ? "Masuk" : t === "expense" ? "Keluar" : "Transfer"}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-3">
                    <input type="text" placeholder="Nominal (Rp)" value={txForm.amount ? `Rp ${Number(txForm.amount.replace(/\D/g, "")).toLocaleString("id-ID")}` : ""} onChange={(e) => setTxForm((p) => ({ ...p, amount: e.target.value.replace(/\D/g, "") }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-4 py-3 text-slate-700 font-bold text-lg transition-all" />
                    <select value={txForm.accountId} onChange={(e) => setTxForm((p) => ({ ...p, accountId: e.target.value }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all">
                      <option value="">Pilih Akun</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    {txForm.type === "transfer" ? (
                      <select value={txForm.toAccountId} onChange={(e) => setTxForm((p) => ({ ...p, toAccountId: e.target.value }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all">
                        <option value="">Ke Akun</option>
                        {accounts.filter((a) => a.id !== txForm.accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    ) : (
                      <select value={txForm.categoryId} onChange={(e) => setTxForm((p) => ({ ...p, categoryId: e.target.value }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all">
                        <option value="">Pilih Kategori</option>
                        {categories.filter((c) => c.type === txForm.type).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                      </select>
                    )}
                    <input type="date" value={txForm.date} onChange={(e) => setTxForm((p) => ({ ...p, date: e.target.value }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all" />
                    <input type="text" placeholder="Catatan" value={txForm.note} onChange={(e) => setTxForm((p) => ({ ...p, note: e.target.value }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all" />
                  </div>
                  <button onClick={handleSaveTx} className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" /> {selectedTx ? "Perbarui" : "Simpan"}
                  </button>
                </>
              )}

              {/* Add Goal */}
              {modal === "addGoal" && (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-slate-800">Buat Goal Baru 🎯</h3>
                    <button onClick={() => setModal("none")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="space-y-3">
                    <input type="text" placeholder="Nama Goal (misal: Laptop Baru)" value={goalForm.name} onChange={(e) => setGoalForm((p) => ({ ...p, name: e.target.value }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-700 font-medium transition-all" />
                    <input type="text" placeholder="Target (Rp)" value={goalForm.targetAmount ? `Rp ${Number(goalForm.targetAmount.replace(/\D/g, "")).toLocaleString("id-ID")}` : ""} onChange={(e) => setGoalForm((p) => ({ ...p, targetAmount: e.target.value.replace(/\D/g, "") }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-700 font-bold transition-all" />
                    <input type="date" placeholder="Deadline (opsional)" value={goalForm.deadline} onChange={(e) => setGoalForm((p) => ({ ...p, deadline: e.target.value }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all" />
                    <select value={goalForm.linkedAccountId} onChange={(e) => setGoalForm((p) => ({ ...p, linkedAccountId: e.target.value }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all">
                      <option value="">Link ke Akun (opsional)</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <button onClick={handleSaveGoal} className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2">
                    <Target className="w-4 h-4" /> Buat Goal
                  </button>
                </>
              )}

              {/* Deposit Goal */}
              {modal === "depositGoal" && selectedGoal && (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-slate-800">Setor ke "{selectedGoal.name}"</h3>
                    <button onClick={() => { setModal("none"); setSelectedGoal(null); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="mb-4 p-4 bg-indigo-50 rounded-2xl">
                    <p className="text-xs text-indigo-500 font-medium mb-1">Progress saat ini</p>
                    <p className="text-xl font-extrabold text-indigo-700">{fmt(selectedGoal.currentAmount)} <span className="text-sm font-medium text-indigo-400">/ {fmt(selectedGoal.targetAmount)}</span></p>
                    <div className="mt-2 h-2 bg-indigo-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${Math.min((selectedGoal.currentAmount / selectedGoal.targetAmount) * 100, 100)}%` }} />
                    </div>
                  </div>
                  <input type="text" placeholder="Nominal setor (Rp)" value={depositAmount ? `Rp ${Number(depositAmount.replace(/\D/g, "")).toLocaleString("id-ID")}` : ""} onChange={(e) => setDepositAmount(e.target.value.replace(/\D/g, ""))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-4 py-3 text-slate-700 font-bold text-lg transition-all mb-4" />
                  <button onClick={handleDeposit} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2">
                    <PiggyBank className="w-4 h-4" /> Setor Sekarang
                  </button>
                </>
              )}

              {/* Add Portfolio Snapshot */}
              {modal === "addSnapshot" && (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-slate-800">Update Portofolio 📈</h3>
                    <button onClick={() => setModal("none")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="space-y-3">
                    <select value={snapshotForm.accountId} onChange={(e) => setSnapshotForm((p) => ({ ...p, accountId: e.target.value }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all">
                      <option value="">Pilih Akun Investasi</option>
                      {accounts.filter((a) => a.type === "mutual_fund" || a.type === "stock").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <input type="text" placeholder="Nilai Saat Ini (Rp)" value={snapshotForm.totalValue ? `Rp ${Number(snapshotForm.totalValue.replace(/\D/g, "")).toLocaleString("id-ID")}` : ""} onChange={(e) => setSnapshotForm((p) => ({ ...p, totalValue: e.target.value.replace(/\D/g, "") }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-4 py-3 text-slate-700 font-bold transition-all" />
                    <input type="text" placeholder="Total Modal (Rp)" value={snapshotForm.totalInvested ? `Rp ${Number(snapshotForm.totalInvested.replace(/\D/g, "")).toLocaleString("id-ID")}` : ""} onChange={(e) => setSnapshotForm((p) => ({ ...p, totalInvested: e.target.value.replace(/\D/g, "") }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-4 py-3 text-slate-700 font-bold transition-all" />
                    {snapshotForm.totalValue && snapshotForm.totalInvested && (
                      <div className={`p-3 rounded-xl text-sm font-bold flex items-center gap-2 ${Number(snapshotForm.totalValue.replace(/\D/g, "")) >= Number(snapshotForm.totalInvested.replace(/\D/g, "")) ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                        {Number(snapshotForm.totalValue.replace(/\D/g, "")) >= Number(snapshotForm.totalInvested.replace(/\D/g, "")) ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        Return: {(((Number(snapshotForm.totalValue.replace(/\D/g, "")) - Number(snapshotForm.totalInvested.replace(/\D/g, ""))) / Number(snapshotForm.totalInvested.replace(/\D/g, ""))) * 100).toFixed(2)}%
                      </div>
                    )}
                  </div>
                  <button onClick={handleSaveSnapshot} className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" /> Simpan Snapshot
                  </button>
                </>
              )}

              {/* Add Account */}
              {modal === "addAccount" && (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-slate-800">Tambah Akun Baru</h3>
                    <button onClick={() => setModal("none")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="space-y-3">
                    <input type="text" placeholder="Nama Akun (misal: Bank Jago)" value={accountForm.name} onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-700 font-medium transition-all" />
                    <select value={accountForm.type} onChange={(e) => setAccountForm((p) => ({ ...p, type: e.target.value as Account["type"] }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all">
                      <option value="bank">🏦 Bank</option>
                      <option value="mutual_fund">📊 Reksa Dana</option>
                      <option value="stock">📈 Saham</option>
                      <option value="cash">💵 Tunai</option>
                    </select>
                    <input type="text" placeholder="Saldo Awal (Rp)" value={accountForm.balance ? `Rp ${Number(accountForm.balance.replace(/\D/g, "")).toLocaleString("id-ID")}` : ""} onChange={(e) => setAccountForm((p) => ({ ...p, balance: e.target.value.replace(/\D/g, "") }))} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-4 py-3 text-slate-700 font-bold transition-all" />
                  </div>
                  <button onClick={handleSaveAccount} className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" /> Tambah Akun
                  </button>
                </>
              )}

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
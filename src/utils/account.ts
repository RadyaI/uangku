import {
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/utils/firebase";
import { Account, Transaction, PortfolioSnapshot, COLLECTIONS } from "@/types";

export async function getAccountDetail(id: string): Promise<Account | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.accounts, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Account;
  } catch (err) {
    console.error("[getAccountDetail] id:", id, err);
    throw err;
  }
}

export async function updateAccountBalance(id: string, newBalance: number): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.accounts, id), { balance: newBalance });
  } catch (err) {
    console.error("[updateAccountBalance] id:", id, "newBalance:", newBalance, err);
    throw err;
  }
}

export async function updateAccountInfo(id: string, data: Partial<Pick<Account, "name" | "type" | "currency">>): Promise<void> {
  try {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    await updateDoc(doc(db, COLLECTIONS.accounts, id), clean);
  } catch (err) {
    console.error("[updateAccountInfo] id:", id, err);
    throw err;
  }
}

export async function getAccountTransactions(accountId: string, options?: {
  month?: number;
  year?: number;
  limitCount?: number;
}): Promise<Transaction[]> {
  try {
    const results: Transaction[] = [];
    const seen = new Set<string>();

    const baseConstraints = [orderBy("date", "desc")];
    if (options?.month !== undefined && options?.year !== undefined) {
      const start = new Date(options.year, options.month, 1);
      const end = new Date(options.year, options.month + 1, 0, 23, 59, 59);
      baseConstraints.push(where("date", ">=", Timestamp.fromDate(start)) as any);
      baseConstraints.push(where("date", "<=", Timestamp.fromDate(end)) as any);
    }
    if (options?.limitCount) baseConstraints.push(limit(options.limitCount) as any);

    const q1 = query(
      collection(db, COLLECTIONS.transactions),
      where("accountId", "==", accountId),
      ...baseConstraints
    );
    const snap1 = await getDocs(q1);
    snap1.docs.forEach((d) => {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        results.push({ id: d.id, ...d.data() } as Transaction);
      }
    });

    const q2 = query(
      collection(db, COLLECTIONS.transactions),
      where("toAccountId", "==", accountId),
      orderBy("date", "desc"),
      ...(options?.limitCount ? [limit(options.limitCount)] : [])
    );
    const snap2 = await getDocs(q2);
    snap2.docs.forEach((d) => {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        results.push({ id: d.id, ...d.data() } as Transaction);
      }
    });

    return results.sort((a, b) => b.date.toMillis() - a.date.toMillis());
  } catch (err) {
    console.error("[getAccountTransactions] accountId:", accountId, err);
    throw err;
  }
}

export async function getAccountMonthlyHistory(accountId: string, months: number = 6): Promise<{
  label: string;
  month: number;
  year: number;
  income: number;
  expense: number;
  transferOut: number;
  transferIn: number;
  net: number;
}[]> {
  try {
    const now = new Date();
    const result = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const start = Timestamp.fromDate(new Date(y, m, 1));
      const end = Timestamp.fromDate(new Date(y, m + 1, 0, 23, 59, 59));

      const q = query(
        collection(db, COLLECTIONS.transactions),
        where("accountId", "==", accountId),
        where("date", ">=", start),
        where("date", "<=", end),
        orderBy("date", "desc")
      );
      const snap = await getDocs(q);
      const txs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction));

      const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
      const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
      const transferOut = txs.filter((t) => t.type === "transfer").reduce((s, t) => s + t.amount + (t.fee ?? 0), 0);

      const q2 = query(
        collection(db, COLLECTIONS.transactions),
        where("toAccountId", "==", accountId),
        where("date", ">=", start),
        where("date", "<=", end),
        orderBy("date", "desc")
      );
      const snap2 = await getDocs(q2);
      const txs2 = snap2.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction));
      const transferIn = txs2.reduce((s, t) => s + t.amount, 0);

      const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      result.push({
        label: `${MONTHS[m]} '${String(y).slice(2)}`,
        month: m,
        year: y,
        income,
        expense,
        transferOut,
        transferIn,
        net: income + transferIn - expense - transferOut,
      });
    }

    return result;
  } catch (err) {
    console.error("[getAccountMonthlyHistory] accountId:", accountId, err);
    throw err;
  }
}

export async function getAccountPortfolioHistory(accountId: string): Promise<PortfolioSnapshot[]> {
  try {
    const q = query(
      collection(db, COLLECTIONS.portfolioSnapshots),
      where("accountId", "==", accountId),
      orderBy("snapshotDate", "asc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PortfolioSnapshot));
  } catch (err) {
    console.error("[getAccountPortfolioHistory] accountId:", accountId, err);
    throw err;
  }
}

export async function recalculateAccountBalance(accountId: string): Promise<number> {
  try {
    const txs = await getAccountTransactions(accountId);
    let balance = 0;
    for (const tx of txs) {
      if (tx.accountId === accountId) {
        if (tx.type === "income") balance += tx.amount;
        else if (tx.type === "expense") balance -= tx.amount;
        else if (tx.type === "transfer") balance -= tx.amount + (tx.fee ?? 0);
      }
      if (tx.toAccountId === accountId && tx.type === "transfer") {
        balance += tx.amount;
      }
    }
    return balance;
  } catch (err) {
    console.error("[recalculateAccountBalance] accountId:", accountId, err);
    throw err;
  }
}
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/utils/firebase";
import {
  Account,
  Category,
  Transaction,
  Goal,
  PortfolioSnapshot,
  NetWorthSnapshot,
  CreateAccount,
  CreateCategory,
  CreateTransaction,
  CreateGoal,
  CreatePortfolioSnapshot,
  CreateNetWorthSnapshot,
  COLLECTIONS,
} from "@/types";

export async function getAccounts(): Promise<Account[]> {
  try {
    const q = query(collection(db, COLLECTIONS.accounts), where("isActive", "==", true));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Account));
  } catch (err) {
    console.error("[getAccounts]", err);
    throw err;
  }
}

export async function getAccountById(id: string): Promise<Account | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.accounts, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Account;
  } catch (err) {
    console.error("[getAccountById] id:", id, err);
    throw err;
  }
}

export async function createAccount(data: CreateAccount): Promise<string> {
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.accounts), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.error("[createAccount] data:", data, err);
    throw err;
  }
}

export async function updateAccount(id: string, data: Partial<Account>): Promise<void> {
  try {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    await updateDoc(doc(db, COLLECTIONS.accounts, id), clean);
  } catch (err) {
    console.error("[updateAccount] id:", id, "data:", data, err);
    throw err;
  }
}

export async function deleteAccount(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.accounts, id), { isActive: false });
  } catch (err) {
    console.error("[deleteAccount] id:", id, err);
    throw err;
  }
}

export async function updateAccountBalance(id: string, amount: number): Promise<void> {
  try {
    const account = await getAccountById(id);
    if (!account) {
      console.warn("[updateAccountBalance] akun tidak ditemukan, id:", id);
      return;
    }
    await updateDoc(doc(db, COLLECTIONS.accounts, id), {
      balance: account.balance + amount,
    });
  } catch (err) {
    console.error("[updateAccountBalance] id:", id, "amount:", amount, err);
    throw err;
  }
}

export async function getCategories(): Promise<Category[]> {
  try {
    const snap = await getDocs(collection(db, COLLECTIONS.categories));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Category));
  } catch (err) {
    console.error("[getCategories]", err);
    throw err;
  }
}

export async function createCategory(data: CreateCategory): Promise<string> {
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.categories), data);
    return ref.id;
  } catch (err) {
    console.error("[createCategory] data:", data, err);
    throw err;
  }
}

export async function updateCategory(id: string, data: Partial<Category>): Promise<void> {
  try {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    await updateDoc(doc(db, COLLECTIONS.categories, id), clean);
  } catch (err) {
    console.error("[updateCategory] id:", id, "data:", data, err);
    throw err;
  }
}

export async function deleteCategory(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTIONS.categories, id));
  } catch (err) {
    console.error("[deleteCategory] id:", id, err);
    throw err;
  }
}

export async function getTransactions(options?: {
  accountId?: string;
  categoryId?: string;
  type?: string;
  month?: number;
  year?: number;
  limitCount?: number;
}): Promise<Transaction[]> {
  try {
    const constraints: Parameters<typeof query>[1][] = [orderBy("date", "desc")];

    if (options?.accountId) constraints.push(where("accountId", "==", options.accountId));
    if (options?.categoryId) constraints.push(where("categoryId", "==", options.categoryId));
    if (options?.type) constraints.push(where("type", "==", options.type));
    if (options?.month !== undefined && options?.year !== undefined) {
      const start = new Date(options.year, options.month, 1);
      const end = new Date(options.year, options.month + 1, 0, 23, 59, 59);
      constraints.push(where("date", ">=", Timestamp.fromDate(start)));
      constraints.push(where("date", "<=", Timestamp.fromDate(end)));
    }
    if (options?.limitCount) constraints.push(limit(options.limitCount));

    const q = query(collection(db, COLLECTIONS.transactions), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction));
  } catch (err) {
    console.error("[getTransactions] options:", options, err);
    throw err;
  }
}

export async function getTransactionById(id: string): Promise<Transaction | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.transactions, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Transaction;
  } catch (err) {
    console.error("[getTransactionById] id:", id, err);
    throw err;
  }
}

export async function createTransaction(data: CreateTransaction & { fee?: number }): Promise<string> {
  try {
    const batch = writeBatch(db);

    const txRef = doc(collection(db, COLLECTIONS.transactions));
    const payload = Object.fromEntries(Object.entries({ ...data, createdAt: serverTimestamp() }).filter(([, v]) => v !== undefined));
    batch.set(txRef, payload);

    const fee = data.fee ?? 0;
    const accountRef = doc(db, COLLECTIONS.accounts, data.accountId);
    const accountSnap = await getDoc(accountRef);
    if (accountSnap.exists()) {
      const account = accountSnap.data() as Account;
      let delta = 0;
      if (data.type === "income") delta = data.amount;
      else if (data.type === "expense") delta = -data.amount;
      else if (data.type === "transfer") delta = -(data.amount + fee);
      batch.update(accountRef, { balance: account.balance + delta });
    } else {
      console.warn("[createTransaction] akun asal tidak ditemukan, accountId:", data.accountId);
    }

    if (data.type === "transfer" && data.toAccountId) {
      const toRef = doc(db, COLLECTIONS.accounts, data.toAccountId);
      const toSnap = await getDoc(toRef);
      if (toSnap.exists()) {
        const toAccount = toSnap.data() as Account;
        batch.update(toRef, { balance: toAccount.balance + data.amount });
      } else {
        console.warn("[createTransaction] akun tujuan tidak ditemukan, toAccountId:", data.toAccountId);
      }
    }

    await batch.commit();
    return txRef.id;
  } catch (err) {
    console.error("[createTransaction] data:", data, err);
    throw err;
  }
}

export async function updateTransaction(id: string, data: Partial<Transaction> & { fee?: number }): Promise<void> {
  try {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    await updateDoc(doc(db, COLLECTIONS.transactions, id), clean);
  } catch (err) {
    console.error("[updateTransaction] id:", id, "data:", data, err);
    throw err;
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  try {
    const tx = await getTransactionById(id);
    if (!tx) {
      console.warn("[deleteTransaction] transaksi tidak ditemukan, id:", id);
      return;
    }

    const batch = writeBatch(db);
    batch.delete(doc(db, COLLECTIONS.transactions, id));

    const accountRef = doc(db, COLLECTIONS.accounts, tx.accountId);
    const accountSnap = await getDoc(accountRef);
    if (accountSnap.exists()) {
      const account = accountSnap.data() as Account;
      let delta = 0;
      if (tx.type === "income") delta = -tx.amount;
      else if (tx.type === "expense") delta = tx.amount;
      else if (tx.type === "transfer") delta = tx.amount + (tx.fee ?? 0);
      batch.update(accountRef, { balance: account.balance + delta });
    } else {
      console.warn("[deleteTransaction] akun tidak ditemukan, accountId:", tx.accountId);
    }

    if (tx.type === "transfer" && tx.toAccountId) {
      const toRef = doc(db, COLLECTIONS.accounts, tx.toAccountId);
      const toSnap = await getDoc(toRef);
      if (toSnap.exists()) {
        const toAccount = toSnap.data() as Account;
        batch.update(toRef, { balance: toAccount.balance - tx.amount });
      } else {
        console.warn("[deleteTransaction] akun tujuan tidak ditemukan, toAccountId:", tx.toAccountId);
      }
    }

    await batch.commit();
  } catch (err) {
    console.error("[deleteTransaction] id:", id, err);
    throw err;
  }
}

export async function getMonthlyStats(month: number, year: number) {
  try {
    const txs = await getTransactions({ month, year });
    const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { income, expense, balance: income - expense, transactions: txs };
  } catch (err) {
    console.error("[getMonthlyStats] month:", month, "year:", year, err);
    throw err;
  }
}

export async function getExpenseByCategory(month: number, year: number) {
  try {
    const txs = await getTransactions({ month, year });
    const expenses = txs.filter((t) => t.type === "expense");
    const map: Record<string, number> = {};
    for (const tx of expenses) {
      const key = tx.categoryId ?? "uncategorized";
      map[key] = (map[key] ?? 0) + tx.amount;
    }
    return map;
  } catch (err) {
    console.error("[getExpenseByCategory] month:", month, "year:", year, err);
    throw err;
  }
}

export async function getGoals(): Promise<Goal[]> {
  try {
    const q = query(collection(db, COLLECTIONS.goals), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Goal));
  } catch (err) {
    console.error("[getGoals]", err);
    throw err;
  }
}

export async function createGoal(data: CreateGoal): Promise<string> {
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.goals), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.error("[createGoal] data:", data, err);
    throw err;
  }
}

export async function updateGoal(id: string, data: Partial<Goal>): Promise<void> {
  try {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    await updateDoc(doc(db, COLLECTIONS.goals, id), clean);
  } catch (err) {
    console.error("[updateGoal] id:", id, "data:", data, err);
    throw err;
  }
}

export async function depositToGoal(id: string, amount: number): Promise<void> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.goals, id));
    if (!snap.exists()) {
      console.warn("[depositToGoal] goal tidak ditemukan, id:", id);
      return;
    }
    const goal = snap.data() as Goal;
    const newAmount = goal.currentAmount + amount;
    await updateDoc(doc(db, COLLECTIONS.goals, id), {
      currentAmount: newAmount,
      isDone: newAmount >= goal.targetAmount,
    });
  } catch (err) {
    console.error("[depositToGoal] id:", id, "amount:", amount, err);
    throw err;
  }
}

export async function deleteGoal(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTIONS.goals, id));
  } catch (err) {
    console.error("[deleteGoal] id:", id, err);
    throw err;
  }
}

export async function getPortfolioSnapshots(accountId?: string): Promise<PortfolioSnapshot[]> {
  try {
    const constraints: Parameters<typeof query>[1][] = [orderBy("snapshotDate", "desc")];
    if (accountId) constraints.push(where("accountId", "==", accountId));
    const q = query(collection(db, COLLECTIONS.portfolioSnapshots), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PortfolioSnapshot));
  } catch (err) {
    console.error("[getPortfolioSnapshots] accountId:", accountId, err);
    throw err;
  }
}

export async function getLatestPortfolioSnapshot(accountId: string): Promise<PortfolioSnapshot | null> {
  try {
    const q = query(
      collection(db, COLLECTIONS.portfolioSnapshots),
      where("accountId", "==", accountId),
      orderBy("snapshotDate", "desc"),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as PortfolioSnapshot;
  } catch (err) {
    console.error("[getLatestPortfolioSnapshot] accountId:", accountId, err);
    throw err;
  }
}

export async function createPortfolioSnapshot(data: CreatePortfolioSnapshot): Promise<string> {
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.portfolioSnapshots), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.error("[createPortfolioSnapshot] data:", data, err);
    throw err;
  }
}

export async function deletePortfolioSnapshot(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTIONS.portfolioSnapshots, id));
  } catch (err) {
    console.error("[deletePortfolioSnapshot] id:", id, err);
    throw err;
  }
}

export async function getNetWorthSnapshots(): Promise<NetWorthSnapshot[]> {
  try {
    const q = query(collection(db, COLLECTIONS.netWorthSnapshots), orderBy("snapshotDate", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as NetWorthSnapshot));
  } catch (err) {
    console.error("[getNetWorthSnapshots]", err);
    throw err;
  }
}

export async function createNetWorthSnapshot(data: CreateNetWorthSnapshot): Promise<string> {
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.netWorthSnapshots), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.error("[createNetWorthSnapshot] data:", data, err);
    throw err;
  }
}

export async function deleteNetWorthSnapshot(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTIONS.netWorthSnapshots, id));
  } catch (err) {
    console.error("[deleteNetWorthSnapshot] id:", id, err);
    throw err;
  }
}

export async function getBudgetUsage(
  budgets: Record<string, number>,
  month: number,
  year: number
): Promise<Record<string, { used: number; limit: number; percent: number }>> {
  try {
    const byCategory = await getExpenseByCategory(month, year);
    const result: Record<string, { used: number; limit: number; percent: number }> = {};
    for (const [catId, limitAmount] of Object.entries(budgets)) {
      const used = byCategory[catId] ?? 0;
      result[catId] = { used, limit: limitAmount, percent: Math.min((used / limitAmount) * 100, 100) };
    }
    return result;
  } catch (err) {
    console.error("[getBudgetUsage] month:", month, "year:", year, err);
    throw err;
  }
}
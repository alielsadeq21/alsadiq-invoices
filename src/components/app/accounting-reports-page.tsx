'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { ChartOfAccount, JournalEntry, JournalEntryLine } from '@/lib/types';
import { formatCurrency, formatDate, getAccountTypeLabel, getAccountTypeColor } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  BookOpen,
  FileText,
  Scale,
  TrendingUp,
  PieChart,
  Download,
  Search,
  Calendar,
  Printer,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

// Extended line type for queries that include account_id
interface JournalEntryLineWithAccount extends JournalEntryLine {
  account_id: string | null;
}

// Account balance summary for trial balance & reports
interface AccountBalanceSummary {
  account_id: string | null;
  account_name: string;
  account_type: string;
  total_debit: number;
  total_credit: number;
  net_balance: number;
}

// Ledger line with running balance
interface LedgerLine {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string | null;
  debit: number;
  credit: number;
  running_balance: number;
}

export default function AccountingReportsPage() {
  const { hasPermission, isAdmin } = useAppStore();

  const [activeTab, setActiveTab] = useState('journal');
  const [loading, setLoading] = useState(false);

  // Permission checks
  const canView = hasPermission('accounting_reports', 'view');
  const canExport = hasPermission('accounting_reports', 'export');

  // ==================== GENERAL JOURNAL STATE ====================
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalLines, setJournalLines] = useState<Record<string, JournalEntryLine[]>>({});
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalSearch, setJournalSearch] = useState('');
  const [journalDateFrom, setJournalDateFrom] = useState('');
  const [journalDateTo, setJournalDateTo] = useState('');
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  // ==================== GENERAL LEDGER STATE ====================
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [ledgerLines, setLedgerLines] = useState<LedgerLine[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerDateFrom, setLedgerDateFrom] = useState('');
  const [ledgerDateTo, setLedgerDateTo] = useState('');

  // ==================== TRIAL BALANCE STATE ====================
  const [trialBalanceData, setTrialBalanceData] = useState<AccountBalanceSummary[]>([]);
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialDateFrom, setTrialDateFrom] = useState('');
  const [trialDateTo, setTrialDateTo] = useState('');

  // ==================== INCOME STATEMENT STATE ====================
  const [incomeData, setIncomeData] = useState<AccountBalanceSummary[]>([]);
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [incomeDateFrom, setIncomeDateFrom] = useState('');
  const [incomeDateTo, setIncomeDateTo] = useState('');

  // ==================== BALANCE SHEET STATE ====================
  const [balanceSheetData, setBalanceSheetData] = useState<AccountBalanceSummary[]>([]);
  const [balanceSheetLoading, setBalanceSheetLoading] = useState(false);
  const [balanceSheetDate, setBalanceSheetDate] = useState('');

  // ==================== LOAD ACCOUNTS ====================
  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('is_active', true)
        .order('code', { ascending: true });

      if (!error && data) {
        setAccounts(data as ChartOfAccount[]);
      }
    } catch (err) {
      console.error('Error loading accounts:', err);
    }
  };

  // ==================== GENERAL JOURNAL ====================
  useEffect(() => {
    if (activeTab === 'journal') {
      loadJournalEntries();
    }
  }, [activeTab, journalSearch, journalDateFrom, journalDateTo]);

  const loadJournalEntries = async () => {
    setJournalLoading(true);
    try {
      let query = supabase
        .from('journal_entries')
        .select('*')
        .eq('is_posted', true)
        .order('entry_date', { ascending: false });

      if (journalSearch) {
        query = query.or(
          `entry_number.ilike.%${journalSearch}%,description.ilike.%${journalSearch}%`
        );
      }
      if (journalDateFrom) {
        query = query.gte('entry_date', journalDateFrom);
      }
      if (journalDateTo) {
        query = query.lte('entry_date', journalDateTo);
      }

      const { data, error } = await query;
      if (!error && data) {
        const entries = data as JournalEntry[];
        setJournalEntries(entries);

        // Load lines for all entries
        if (entries.length > 0) {
          const entryIds = entries.map((e) => e.id);
          const { data: linesData, error: linesError } = await supabase
            .from('journal_entry_lines')
            .select('*')
            .in('journal_entry_id', entryIds)
            .order('created_at', { ascending: true });

          if (!linesError && linesData) {
            const linesMap: Record<string, JournalEntryLine[]> = {};
            (linesData as JournalEntryLine[]).forEach((line) => {
              if (!linesMap[line.journal_entry_id]) {
                linesMap[line.journal_entry_id] = [];
              }
              linesMap[line.journal_entry_id].push(line);
            });
            setJournalLines(linesMap);
          }
        }
      }
    } catch (err) {
      console.error('Error loading journal entries:', err);
      toast.error('حدث خطأ أثناء تحميل بيانات دفتر اليومية');
    } finally {
      setJournalLoading(false);
    }
  };

  const toggleEntryExpand = (entryId: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  // ==================== GENERAL LEDGER ====================
  useEffect(() => {
    if (activeTab === 'ledger' && selectedAccountId) {
      loadLedgerData();
    }
  }, [activeTab, selectedAccountId, ledgerDateFrom, ledgerDateTo]);

  const loadLedgerData = async () => {
    if (!selectedAccountId) return;

    const account = accounts.find((a) => a.id === selectedAccountId);
    if (!account) return;

    setLedgerLoading(true);
    try {
      // Get journal entry lines for this account
      let entryQuery = supabase
        .from('journal_entries')
        .select('id, entry_number, entry_date, is_posted')
        .eq('is_posted', true);

      if (ledgerDateFrom) {
        entryQuery = entryQuery.gte('entry_date', ledgerDateFrom);
      }
      if (ledgerDateTo) {
        entryQuery = entryQuery.lte('entry_date', ledgerDateTo);
      }

      const { data: entries, error: entriesError } = await entryQuery;

      if (entriesError || !entries) {
        throw entriesError;
      }

      if (entries.length === 0) {
        setLedgerLines([]);
        setLedgerLoading(false);
        return;
      }

      const entryIds = entries.map((e) => e.id);

      // Get lines for these entries that match the account
      const { data: linesData, error: linesError } = await supabase
        .from('journal_entry_lines')
        .select('*')
        .in('journal_entry_id', entryIds)
        .order('created_at', { ascending: true });

      if (!linesError && linesData) {
        // Filter lines by account name (matching by account_name since account_id may be null)
        const accountName = account.name;
        const filteredLines = (linesData as JournalEntryLineWithAccount[]).filter(
          (line) => line.account_name === accountName || line.account_id === account.id
        );

        // Build entry map
        const entryMap = new Map(entries.map((e) => [e.id, e]));

        // Build ledger lines with running balance
        const ledgerData: LedgerLine[] = [];
        let runningBalance = 0;

        // Sort by entry date
        filteredLines.sort((a, b) => {
          const entryA = entryMap.get(a.journal_entry_id);
          const entryB = entryMap.get(b.journal_entry_id);
          if (entryA && entryB) {
            const dateCompare = entryA.entry_date.localeCompare(entryB.entry_date);
            if (dateCompare !== 0) return dateCompare;
          }
          return a.created_at.localeCompare(b.created_at);
        });

        for (const line of filteredLines) {
          const entry = entryMap.get(line.journal_entry_id);
          // For asset/expense: debit increases, credit decreases
          // For liability/equity/revenue: credit increases, debit decreases
          const isDebitNature = account.account_type === 'asset' || account.account_type === 'expense';
          if (isDebitNature) {
            runningBalance += line.debit - line.credit;
          } else {
            runningBalance += line.credit - line.debit;
          }

          ledgerData.push({
            id: line.id,
            entry_number: entry?.entry_number || '',
            entry_date: entry?.entry_date || '',
            description: line.description,
            debit: line.debit,
            credit: line.credit,
            running_balance: runningBalance,
          });
        }

        setLedgerLines(ledgerData);
      }
    } catch (err) {
      console.error('Error loading ledger data:', err);
      toast.error('حدث خطأ أثناء تحميل بيانات دفتر الأستاذ');
    } finally {
      setLedgerLoading(false);
    }
  };

  // ==================== TRIAL BALANCE ====================
  useEffect(() => {
    if (activeTab === 'trial') {
      loadTrialBalance();
    }
  }, [activeTab, trialDateFrom, trialDateTo]);

  const loadTrialBalance = async () => {
    setTrialLoading(true);
    try {
      let entryQuery = supabase
        .from('journal_entries')
        .select('id')
        .eq('is_posted', true);

      if (trialDateFrom) {
        entryQuery = entryQuery.gte('entry_date', trialDateFrom);
      }
      if (trialDateTo) {
        entryQuery = entryQuery.lte('entry_date', trialDateTo);
      }

      const { data: entries, error: entriesError } = await entryQuery;
      if (entriesError || !entries || entries.length === 0) {
        setTrialBalanceData([]);
        setTrialLoading(false);
        return;
      }

      const entryIds = entries.map((e) => e.id);

      // Get all lines grouped by account
      const { data: linesData, error: linesError } = await supabase
        .from('journal_entry_lines')
        .select('account_name, account_id, debit, credit')
        .in('journal_entry_id', entryIds);

      if (!linesError && linesData) {
        // Group by account_name
        const accountMap = new Map<
          string,
          {
            account_id: string | null;
            account_name: string;
            total_debit: number;
            total_credit: number;
          }
        >();

        for (const line of linesData as JournalEntryLineWithAccount[]) {
          const key = line.account_name;
          const existing = accountMap.get(key);
          if (existing) {
            existing.total_debit += line.debit;
            existing.total_credit += line.credit;
          } else {
            accountMap.set(key, {
              account_id: line.account_id,
              account_name: line.account_name,
              total_debit: line.debit,
              total_credit: line.credit,
            });
          }
        }

        // Map to account types
        const accountNameToType = new Map<string, string>();
        accounts.forEach((a) => {
          accountNameToType.set(a.name, a.account_type);
        });

        const summary: AccountBalanceSummary[] = [];
        accountMap.forEach((value) => {
          const accountType = accountNameToType.get(value.account_name) || 'expense';
          summary.push({
            account_id: value.account_id,
            account_name: value.account_name,
            account_type: accountType,
            total_debit: value.total_debit,
            total_credit: value.total_credit,
            net_balance: value.total_debit - value.total_credit,
          });
        });

        // Sort by account type then name
        const typeOrder = ['asset', 'liability', 'equity', 'revenue', 'expense'];
        summary.sort((a, b) => {
          const typeA = typeOrder.indexOf(a.account_type);
          const typeB = typeOrder.indexOf(b.account_type);
          if (typeA !== typeB) return typeA - typeB;
          return a.account_name.localeCompare(b.account_name, 'ar');
        });

        setTrialBalanceData(summary);
      }
    } catch (err) {
      console.error('Error loading trial balance:', err);
      toast.error('حدث خطأ أثناء تحميل ميزان المراجعة');
    } finally {
      setTrialLoading(false);
    }
  };

  // ==================== INCOME STATEMENT ====================
  useEffect(() => {
    if (activeTab === 'income') {
      loadIncomeStatement();
    }
  }, [activeTab, incomeDateFrom, incomeDateTo]);

  const loadIncomeStatement = async () => {
    setIncomeLoading(true);
    try {
      let entryQuery = supabase
        .from('journal_entries')
        .select('id')
        .eq('is_posted', true);

      if (incomeDateFrom) {
        entryQuery = entryQuery.gte('entry_date', incomeDateFrom);
      }
      if (incomeDateTo) {
        entryQuery = entryQuery.lte('entry_date', incomeDateTo);
      }

      const { data: entries, error: entriesError } = await entryQuery;
      if (entriesError || !entries || entries.length === 0) {
        setIncomeData([]);
        setIncomeLoading(false);
        return;
      }

      const entryIds = entries.map((e) => e.id);

      const { data: linesData, error: linesError } = await supabase
        .from('journal_entry_lines')
        .select('account_name, account_id, debit, credit')
        .in('journal_entry_id', entryIds);

      if (!linesError && linesData) {
        const accountMap = new Map<
          string,
          {
            account_id: string | null;
            account_name: string;
            total_debit: number;
            total_credit: number;
          }
        >();

        for (const line of linesData as JournalEntryLineWithAccount[]) {
          const key = line.account_name;
          const existing = accountMap.get(key);
          if (existing) {
            existing.total_debit += line.debit;
            existing.total_credit += line.credit;
          } else {
            accountMap.set(key, {
              account_id: line.account_id,
              account_name: line.account_name,
              total_debit: line.debit,
              total_credit: line.credit,
            });
          }
        }

        const accountNameToType = new Map<string, string>();
        accounts.forEach((a) => {
          accountNameToType.set(a.name, a.account_type);
        });

        // Filter only revenue and expense accounts
        const summary: AccountBalanceSummary[] = [];
        accountMap.forEach((value) => {
          const accountType = accountNameToType.get(value.account_name);
          if (accountType === 'revenue' || accountType === 'expense') {
            summary.push({
              account_id: value.account_id,
              account_name: value.account_name,
              account_type: accountType || 'expense',
              total_debit: value.total_debit,
              total_credit: value.total_credit,
              net_balance: value.total_debit - value.total_credit,
            });
          }
        });

        // Sort: revenue first, then expenses
        summary.sort((a, b) => {
          if (a.account_type === 'revenue' && b.account_type !== 'revenue') return -1;
          if (a.account_type !== 'revenue' && b.account_type === 'revenue') return 1;
          return a.account_name.localeCompare(b.account_name, 'ar');
        });

        setIncomeData(summary);
      }
    } catch (err) {
      console.error('Error loading income statement:', err);
      toast.error('حدث خطأ أثناء تحميل قائمة الدخل');
    } finally {
      setIncomeLoading(false);
    }
  };

  // ==================== BALANCE SHEET ====================
  useEffect(() => {
    if (activeTab === 'balance-sheet') {
      loadBalanceSheet();
    }
  }, [activeTab, balanceSheetDate]);

  const loadBalanceSheet = async () => {
    setBalanceSheetLoading(true);
    try {
      let entryQuery = supabase
        .from('journal_entries')
        .select('id')
        .eq('is_posted', true);

      if (balanceSheetDate) {
        entryQuery = entryQuery.lte('entry_date', balanceSheetDate);
      }

      const { data: entries, error: entriesError } = await entryQuery;
      if (entriesError || !entries || entries.length === 0) {
        setBalanceSheetData([]);
        setBalanceSheetLoading(false);
        return;
      }

      const entryIds = entries.map((e) => e.id);

      const { data: linesData, error: linesError } = await supabase
        .from('journal_entry_lines')
        .select('account_name, account_id, debit, credit')
        .in('journal_entry_id', entryIds);

      if (!linesError && linesData) {
        const accountMap = new Map<
          string,
          {
            account_id: string | null;
            account_name: string;
            total_debit: number;
            total_credit: number;
          }
        >();

        for (const line of linesData as JournalEntryLineWithAccount[]) {
          const key = line.account_name;
          const existing = accountMap.get(key);
          if (existing) {
            existing.total_debit += line.debit;
            existing.total_credit += line.credit;
          } else {
            accountMap.set(key, {
              account_id: line.account_id,
              account_name: line.account_name,
              total_debit: line.debit,
              total_credit: line.credit,
            });
          }
        }

        const accountNameToType = new Map<string, string>();
        accounts.forEach((a) => {
          accountNameToType.set(a.name, a.account_type);
        });

        // Filter asset, liability, equity accounts
        const summary: AccountBalanceSummary[] = [];
        accountMap.forEach((value) => {
          const accountType = accountNameToType.get(value.account_name);
          if (
            accountType === 'asset' ||
            accountType === 'liability' ||
            accountType === 'equity'
          ) {
            summary.push({
              account_id: value.account_id,
              account_name: value.account_name,
              account_type: accountType || 'asset',
              total_debit: value.total_debit,
              total_credit: value.total_credit,
              net_balance: value.total_debit - value.total_credit,
            });
          }
        });

        // Sort by type
        const typeOrder = ['asset', 'liability', 'equity'];
        summary.sort((a, b) => {
          const typeA = typeOrder.indexOf(a.account_type);
          const typeB = typeOrder.indexOf(b.account_type);
          if (typeA !== typeB) return typeA - typeB;
          return a.account_name.localeCompare(b.account_name, 'ar');
        });

        setBalanceSheetData(summary);
      }
    } catch (err) {
      console.error('Error loading balance sheet:', err);
      toast.error('حدث خطأ أثناء تحميل الميزانية العمومية');
    } finally {
      setBalanceSheetLoading(false);
    }
  };

  // ==================== COMPUTED VALUES ====================
  const totalJournalDebit = journalEntries.reduce((s, e) => s + e.total_debit, 0);
  const totalJournalCredit = journalEntries.reduce((s, e) => s + e.total_credit, 0);

  const trialTotalDebit = trialBalanceData.reduce((s, a) => s + a.total_debit, 0);
  const trialTotalCredit = trialBalanceData.reduce((s, a) => s + a.total_credit, 0);

  const revenueAccounts = incomeData.filter((a) => a.account_type === 'revenue');
  const expenseAccounts = incomeData.filter((a) => a.account_type === 'expense');
  const totalRevenue = revenueAccounts.reduce((s, a) => s + (a.total_credit - a.total_debit), 0);
  const totalExpenses = expenseAccounts.reduce((s, a) => s + (a.total_debit - a.total_credit), 0);
  const netProfit = totalRevenue - totalExpenses;

  const assetAccounts = balanceSheetData.filter((a) => a.account_type === 'asset');
  const liabilityAccounts = balanceSheetData.filter((a) => a.account_type === 'liability');
  const equityAccounts = balanceSheetData.filter((a) => a.account_type === 'equity');
  const totalAssets = assetAccounts.reduce((s, a) => s + (a.total_debit - a.total_credit), 0);
  const totalLiabilities = liabilityAccounts.reduce((s, a) => s + (a.total_credit - a.total_debit), 0);
  const totalEquity = equityAccounts.reduce((s, a) => s + (a.total_credit - a.total_debit), 0);

  // Balance sheet check: need to include net profit from income statement
  const balanceSheetNetProfit = (() => {
    // Recalculate net profit for balance sheet date range
    const revAccounts = balanceSheetData.filter(
      (a) => a.account_type === 'revenue'
    );
    const expAccounts = balanceSheetData.filter(
      (a) => a.account_type === 'expense'
    );
    const rev = revAccounts.reduce((s, a) => s + (a.total_credit - a.total_debit), 0);
    const exp = expAccounts.reduce((s, a) => s + (a.total_debit - a.total_credit), 0);
    return rev - exp;
  })();
  const liabilitiesEquityProfit = totalLiabilities + totalEquity + balanceSheetNetProfit;
  const balanceSheetBalanced = Math.abs(totalAssets - liabilitiesEquityProfit) < 0.01;

  // ==================== EXPORT FUNCTIONS ====================
  const exportCSV = (headers: string[], rows: string[][], filename: string) => {
    const BOM = '\uFEFF';
    const csvRows = [headers.join(',')];
    rows.forEach((row) => {
      csvRows.push(row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob([BOM + csvRows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('تم تصدير البيانات بنجاح');
  };

  const exportJournal = () => {
    if (journalEntries.length === 0) {
      toast.error('لا توجد بيانات للتصدير');
      return;
    }
    const headers = ['رقم القيد', 'التاريخ', 'البيان', 'مدين', 'دائن', 'ملاحظات'];
    const rows: string[][] = [];
    journalEntries.forEach((entry) => {
      rows.push([
        entry.entry_number,
        entry.entry_date,
        entry.description,
        entry.total_debit.toFixed(2),
        entry.total_credit.toFixed(2),
        entry.notes || '',
      ]);
      const lines = journalLines[entry.id] || [];
      lines.forEach((line) => {
        rows.push([
          '',
          '',
          line.account_name,
          line.debit.toFixed(2),
          line.credit.toFixed(2),
          line.description || '',
        ]);
      });
      rows.push(['', '', '', '', '', '']);
    });
    exportCSV(headers, rows, 'دفتر_اليومية');
  };

  const exportLedger = () => {
    if (ledgerLines.length === 0) {
      toast.error('لا توجد بيانات للتصدير');
      return;
    }
    const account = accounts.find((a) => a.id === selectedAccountId);
    const headers = ['رقم القيد', 'التاريخ', 'البيان', 'مدين', 'دائن', 'الرصيد'];
    const rows = ledgerLines.map((line) => [
      line.entry_number,
      line.entry_date,
      line.description || '',
      line.debit.toFixed(2),
      line.credit.toFixed(2),
      line.running_balance.toFixed(2),
    ]);
    exportCSV(headers, rows, `دفتر_الأستاذ_${account?.name || ''}`);
  };

  const exportTrialBalance = () => {
    if (trialBalanceData.length === 0) {
      toast.error('لا توجد بيانات للتصدير');
      return;
    }
    const headers = ['اسم الحساب', 'نوع الحساب', 'إجمالي المدين', 'إجمالي الدائن', 'صافي الرصيد'];
    const rows = trialBalanceData.map((a) => [
      a.account_name,
      getAccountTypeLabel(a.account_type),
      a.total_debit.toFixed(2),
      a.total_credit.toFixed(2),
      a.net_balance.toFixed(2),
    ]);
    rows.push(['الإجمالي', '', trialTotalDebit.toFixed(2), trialTotalCredit.toFixed(2), '']);
    exportCSV(headers, rows, 'ميزان_المراجعة');
  };

  const exportIncomeStatement = () => {
    if (incomeData.length === 0) {
      toast.error('لا توجد بيانات للتصدير');
      return;
    }
    const headers = ['اسم الحساب', 'نوع الحساب', 'إجمالي المدين', 'إجمالي الدائن', 'صافي الرصيد'];
    const rows = incomeData.map((a) => [
      a.account_name,
      getAccountTypeLabel(a.account_type),
      a.total_debit.toFixed(2),
      a.total_credit.toFixed(2),
      a.net_balance.toFixed(2),
    ]);
    rows.push(['', '', '', '', '']);
    rows.push(['صافي الربح/الخسارة', '', '', '', netProfit.toFixed(2)]);
    exportCSV(headers, rows, 'قائمة_الدخل');
  };

  const exportBalanceSheet = () => {
    if (balanceSheetData.length === 0) {
      toast.error('لا توجد بيانات للتصدير');
      return;
    }
    const headers = ['اسم الحساب', 'نوع الحساب', 'إجمالي المدين', 'إجمالي الدائن', 'صافي الرصيد'];
    const rows = balanceSheetData.map((a) => [
      a.account_name,
      getAccountTypeLabel(a.account_type),
      a.total_debit.toFixed(2),
      a.total_credit.toFixed(2),
      a.net_balance.toFixed(2),
    ]);
    rows.push(['', '', '', '', '']);
    rows.push(['إجمالي الأصول', '', '', '', totalAssets.toFixed(2)]);
    rows.push(['إجمالي الخصوم', '', '', '', totalLiabilities.toFixed(2)]);
    rows.push(['إجمالي حقوق الملكية', '', '', '', totalEquity.toFixed(2)]);
    rows.push(['صافي الربح', '', '', '', balanceSheetNetProfit.toFixed(2)]);
    exportCSV(headers, rows, 'الميزانية_العمومية');
  };

  const handlePrint = () => {
    window.print();
  };

  // ==================== PERMISSION CHECK ====================
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-24 h-24 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-5">
          <BookOpen className="w-12 h-12 text-red-500" />
        </div>
        <h3 className="text-xl font-bold mb-2">غير مصرح بالوصول</h3>
        <p className="text-muted-foreground text-sm text-center">
          ليس لديك صلاحية لعرض هذه الصفحة
        </p>
      </div>
    );
  }

  // ==================== RENDER ====================
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-primary" />
              التقارير المحاسبية
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              دفتر اليومية • دفتر الأستاذ • ميزان المراجعة • قائمة الدخل • الميزانية العمومية
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canExport && (
              <>
                <Button
                  variant="outline"
                  onClick={handlePrint}
                  className="gap-2"
                >
                  <Printer className="w-4 h-4" />
                  طباعة
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (activeTab === 'journal') exportJournal();
                    else if (activeTab === 'ledger') exportLedger();
                    else if (activeTab === 'trial') exportTrialBalance();
                    else if (activeTab === 'income') exportIncomeStatement();
                    else if (activeTab === 'balance-sheet') exportBalanceSheet();
                  }}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  تصدير CSV
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto gap-1">
            <TabsTrigger value="journal" className="gap-1.5 text-xs sm:text-sm py-2">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">دفتر اليومية</span>
              <span className="sm:hidden">اليومية</span>
            </TabsTrigger>
            <TabsTrigger value="ledger" className="gap-1.5 text-xs sm:text-sm py-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">دفتر الأستاذ</span>
              <span className="sm:hidden">الأستاذ</span>
            </TabsTrigger>
            <TabsTrigger value="trial" className="gap-1.5 text-xs sm:text-sm py-2">
              <Scale className="w-4 h-4" />
              <span className="hidden sm:inline">ميزان المراجعة</span>
              <span className="sm:hidden">المراجعة</span>
            </TabsTrigger>
            <TabsTrigger value="income" className="gap-1.5 text-xs sm:text-sm py-2">
              <TrendingUp className="w-4 h-4" />
              <span className="hidden sm:inline">قائمة الدخل</span>
              <span className="sm:hidden">الدخل</span>
            </TabsTrigger>
            <TabsTrigger value="balance-sheet" className="gap-1.5 text-xs sm:text-sm py-2 col-span-2 sm:col-span-1">
              <PieChart className="w-4 h-4" />
              <span className="hidden sm:inline">الميزانية العمومية</span>
              <span className="sm:hidden">الميزانية</span>
            </TabsTrigger>
          </TabsList>

          {/* ==================== GENERAL JOURNAL TAB ==================== */}
          <TabsContent value="journal" className="space-y-4 mt-4">
            {/* Filters */}
            <Card className="border-0 shadow-md">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث برقم القيد أو البيان..."
                      value={journalSearch}
                      onChange={(e) => setJournalSearch(e.target.value)}
                      className="pr-10"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">من تاريخ</Label>
                    <Input
                      type="date"
                      value={journalDateFrom}
                      onChange={(e) => setJournalDateFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</Label>
                    <Input
                      type="date"
                      value={journalDateTo}
                      onChange={(e) => setJournalDateTo(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setJournalSearch('');
                        setJournalDateFrom('');
                        setJournalDateTo('');
                      }}
                      className="gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                      مسح الفلاتر
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-0 shadow-md">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">عدد القيود</p>
                  <p className="text-2xl font-bold text-primary mt-1">{journalEntries.length}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-md">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">إجمالي المدين</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">
                    {formatCurrency(totalJournalDebit)}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-md">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">إجمالي الدائن</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">
                    {formatCurrency(totalJournalCredit)}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-md bg-primary/5">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">الفرق</p>
                  <p className="text-2xl font-bold text-primary mt-1">
                    {formatCurrency(Math.abs(totalJournalDebit - totalJournalCredit))}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Journal Entries Table */}
            <Card className="border-0 shadow-md">
              <CardContent className="p-0">
                {journalLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : journalEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 px-4">
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                      <BookOpen className="w-12 h-12 text-primary/60" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">لا توجد قيود مرحلة</h3>
                    <p className="text-muted-foreground text-sm text-center max-w-xs">
                      لم يتم العثور على قيود محاسبية مرحلة تطابق معايير البحث
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[600px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right w-10"></TableHead>
                          <TableHead className="text-right">رقم القيد</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">التاريخ</TableHead>
                          <TableHead className="text-right">البيان</TableHead>
                          <TableHead className="text-right">مدين</TableHead>
                          <TableHead className="text-right">دائن</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {journalEntries.map((entry) => {
                          const isExpanded = expandedEntries.has(entry.id);
                          const lines = journalLines[entry.id] || [];
                          return (
                            <>
                              <TableRow
                                key={entry.id}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => toggleEntryExpand(entry.id)}
                              >
                                <TableCell>
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </TableCell>
                                <TableCell className="font-medium">
                                  {entry.entry_number}
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">
                                  {formatDate(entry.entry_date)}
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate">
                                  {entry.description}
                                </TableCell>
                                <TableCell className="font-semibold text-emerald-600">
                                  {formatCurrency(entry.total_debit)}
                                </TableCell>
                                <TableCell className="font-semibold text-orange-600">
                                  {formatCurrency(entry.total_credit)}
                                </TableCell>
                              </TableRow>
                              {isExpanded &&
                                lines.map((line) => (
                                  <TableRow
                                    key={line.id}
                                    className="bg-muted/30"
                                  >
                                    <TableCell></TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                      └
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell"></TableCell>
                                    <TableCell className="text-sm pr-6">
                                      <span className="text-muted-foreground ml-1">
                                        {line.account_name}
                                      </span>
                                      {line.description && (
                                        <span className="text-xs text-muted-foreground">
                                          ({line.description})
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {line.debit > 0 ? formatCurrency(line.debit) : ''}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {line.credit > 0 ? formatCurrency(line.credit) : ''}
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== GENERAL LEDGER TAB ==================== */}
          <TabsContent value="ledger" className="space-y-4 mt-4">
            {/* Account Selector & Filters */}
            <Card className="border-0 shadow-md">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">اختر الحساب</Label>
                    <Select
                      value={selectedAccountId}
                      onValueChange={setSelectedAccountId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الحساب" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            <span className="flex items-center gap-2">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] px-1.5 py-0 ${getAccountTypeColor(account.account_type)}`}
                              >
                                {account.code}
                              </Badge>
                              {account.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">من تاريخ</Label>
                    <Input
                      type="date"
                      value={ledgerDateFrom}
                      onChange={(e) => setLedgerDateFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</Label>
                    <Input
                      type="date"
                      value={ledgerDateTo}
                      onChange={(e) => setLedgerDateTo(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLedgerDateFrom('');
                        setLedgerDateTo('');
                      }}
                      className="gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                      مسح الفلاتر
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Account Info Card */}
            {selectedAccountId && (() => {
              const account = accounts.find((a) => a.id === selectedAccountId);
              if (!account) return null;
              const totalDebit = ledgerLines.reduce((s, l) => s + l.debit, 0);
              const totalCredit = ledgerLines.reduce((s, l) => s + l.credit, 0);
              const currentBalance = ledgerLines.length > 0
                ? ledgerLines[ledgerLines.length - 1].running_balance
                : 0;
              return (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  <Card className="border-0 shadow-md col-span-2 lg:col-span-1">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${getAccountTypeColor(account.account_type)}`}
                        >
                          {account.code}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${getAccountTypeColor(account.account_type)}`}
                        >
                          {getAccountTypeLabel(account.account_type)}
                        </Badge>
                      </div>
                      <p className="font-bold text-lg">{account.name}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-md">
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">عدد الحركات</p>
                      <p className="text-2xl font-bold text-primary mt-1">{ledgerLines.length}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-md">
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">إجمالي المدين</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">
                        {formatCurrency(totalDebit)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-md">
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">إجمالي الدائن</p>
                      <p className="text-2xl font-bold text-orange-600 mt-1">
                        {formatCurrency(totalCredit)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-md bg-primary/5">
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">الرصيد الحالي</p>
                      <p className="text-2xl font-bold text-primary mt-1">
                        {formatCurrency(Math.abs(currentBalance))}
                        {currentBalance < 0 && (
                          <span className="text-xs text-red-500 mr-1">(دائن)</span>
                        )}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

            {/* Ledger Table */}
            <Card className="border-0 shadow-md">
              <CardContent className="p-0">
                {!selectedAccountId ? (
                  <div className="flex flex-col items-center justify-center py-20 px-4">
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                      <FileText className="w-12 h-12 text-primary/60" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">اختر حساباً</h3>
                    <p className="text-muted-foreground text-sm text-center max-w-xs">
                      اختر حساباً من القائمة أعلاه لعرض حركاته في دفتر الأستاذ
                    </p>
                  </div>
                ) : ledgerLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : ledgerLines.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 px-4">
                    <div className="w-24 h-24 rounded-full bg-muted/50 flex items-center justify-center mb-5">
                      <FileText className="w-12 h-12 text-muted-foreground/60" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">لا توجد حركات</h3>
                    <p className="text-muted-foreground text-sm text-center max-w-xs">
                      لا توجد حركات مسجلة لهذا الحساب في الفترة المحددة
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">رقم القيد</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">التاريخ</TableHead>
                          <TableHead className="text-right">البيان</TableHead>
                          <TableHead className="text-right">مدين</TableHead>
                          <TableHead className="text-right">دائن</TableHead>
                          <TableHead className="text-right">الرصيد</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledgerLines.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell className="font-medium">
                              {line.entry_number}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {formatDate(line.entry_date)}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {line.description || '—'}
                            </TableCell>
                            <TableCell className="font-semibold text-emerald-600">
                              {line.debit > 0 ? formatCurrency(line.debit) : '—'}
                            </TableCell>
                            <TableCell className="font-semibold text-orange-600">
                              {line.credit > 0 ? formatCurrency(line.credit) : '—'}
                            </TableCell>
                            <TableCell
                              className={`font-bold ${
                                line.running_balance >= 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-red-600'
                              }`}
                            >
                              {formatCurrency(Math.abs(line.running_balance))}
                              {line.running_balance < 0 && (
                                <span className="text-xs mr-1">(د)</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Totals Row */}
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell colSpan={3} className="text-left">
                            الإجمالي
                          </TableCell>
                          <TableCell className="text-emerald-600">
                            {formatCurrency(
                              ledgerLines.reduce((s, l) => s + l.debit, 0)
                            )}
                          </TableCell>
                          <TableCell className="text-orange-600">
                            {formatCurrency(
                              ledgerLines.reduce((s, l) => s + l.credit, 0)
                            )}
                          </TableCell>
                          <TableCell className="text-primary">
                            {formatCurrency(
                              Math.abs(
                                ledgerLines[ledgerLines.length - 1]?.running_balance || 0
                              )
                            )}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== TRIAL BALANCE TAB ==================== */}
          <TabsContent value="trial" className="space-y-4 mt-4">
            {/* Filters */}
            <Card className="border-0 shadow-md">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">من تاريخ</Label>
                    <Input
                      type="date"
                      value={trialDateFrom}
                      onChange={(e) => setTrialDateFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</Label>
                    <Input
                      type="date"
                      value={trialDateTo}
                      onChange={(e) => setTrialDateTo(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTrialDateFrom('');
                        setTrialDateTo('');
                      }}
                      className="gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                      مسح الفلاتر
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="border-0 shadow-md">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">عدد الحسابات</p>
                  <p className="text-2xl font-bold text-primary mt-1">
                    {trialBalanceData.length}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-md">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">إجمالي المدين</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">
                    {formatCurrency(trialTotalDebit)}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-md">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">إجمالي الدائن</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">
                    {formatCurrency(trialTotalCredit)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Balance Check */}
            {trialBalanceData.length > 0 && (
              <div
                className={`flex items-center gap-2 p-3 rounded-lg border ${
                  Math.abs(trialTotalDebit - trialTotalCredit) < 0.01
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}
              >
                {Math.abs(trialTotalDebit - trialTotalCredit) < 0.01 ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                )}
                <span
                  className={`text-sm font-medium ${
                    Math.abs(trialTotalDebit - trialTotalCredit) < 0.01
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {Math.abs(trialTotalDebit - trialTotalCredit) < 0.01
                    ? 'ميزان المراجعة متوازن - إجمالي المدين يساوي إجمالي الدائن'
                    : `ميزان المراجعة غير متوازن - الفرق: ${formatCurrency(Math.abs(trialTotalDebit - trialTotalCredit))}`}
                </span>
              </div>
            )}

            {/* Trial Balance Table */}
            <Card className="border-0 shadow-md">
              <CardContent className="p-0">
                {trialLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : trialBalanceData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 px-4">
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                      <Scale className="w-12 h-12 text-primary/60" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">لا توجد بيانات</h3>
                    <p className="text-muted-foreground text-sm text-center max-w-xs">
                      لم يتم العثور على بيانات حسابات في الفترة المحددة
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">اسم الحساب</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">نوع الحساب</TableHead>
                          <TableHead className="text-right">إجمالي المدين</TableHead>
                          <TableHead className="text-right">إجمالي الدائن</TableHead>
                          <TableHead className="text-right">صافي الرصيد</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          let currentType = '';
                          const rows: React.ReactNode[] = [];
                          trialBalanceData.forEach((account, index) => {
                            // Add type group header
                            if (account.account_type !== currentType) {
                              currentType = account.account_type;
                              rows.push(
                                <TableRow key={`type-${account.account_type}-${index}`} className="bg-muted/30">
                                  <TableCell
                                    colSpan={5}
                                    className="font-bold text-sm"
                                  >
                                    <Badge
                                      variant="secondary"
                                      className={`text-xs ${getAccountTypeColor(account.account_type)}`}
                                    >
                                      {getAccountTypeLabel(account.account_type)}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              );
                            }
                            rows.push(
                              <TableRow key={account.account_name}>
                                <TableCell className="font-medium pr-6">
                                  {account.account_name}
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">
                                  <Badge
                                    variant="secondary"
                                    className={`text-[10px] ${getAccountTypeColor(account.account_type)}`}
                                  >
                                    {getAccountTypeLabel(account.account_type)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-emerald-600">
                                  {formatCurrency(account.total_debit)}
                                </TableCell>
                                <TableCell className="text-orange-600">
                                  {formatCurrency(account.total_credit)}
                                </TableCell>
                                <TableCell
                                  className={`font-bold ${
                                    account.net_balance >= 0
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-red-600'
                                  }`}
                                >
                                  {formatCurrency(Math.abs(account.net_balance))}
                                  {account.net_balance < 0 && (
                                    <span className="text-xs mr-1">(د)</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          });
                          return rows;
                        })()}
                        {/* Grand Total Row */}
                        <TableRow className="bg-primary/10 font-bold border-t-2 border-primary">
                          <TableCell colSpan={2} className="text-lg">
                            الإجمالي الكلي
                          </TableCell>
                          <TableCell className="text-emerald-600 text-lg">
                            {formatCurrency(trialTotalDebit)}
                          </TableCell>
                          <TableCell className="text-orange-600 text-lg">
                            {formatCurrency(trialTotalCredit)}
                          </TableCell>
                          <TableCell
                            className={`text-lg ${
                              Math.abs(trialTotalDebit - trialTotalCredit) < 0.01
                                ? 'text-emerald-600'
                                : 'text-red-600'
                            }`}
                          >
                            {formatCurrency(
                              Math.abs(trialTotalDebit - trialTotalCredit)
                            )}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== INCOME STATEMENT TAB ==================== */}
          <TabsContent value="income" className="space-y-4 mt-4">
            {/* Filters */}
            <Card className="border-0 shadow-md">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">من تاريخ</Label>
                    <Input
                      type="date"
                      value={incomeDateFrom}
                      onChange={(e) => setIncomeDateFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</Label>
                    <Input
                      type="date"
                      value={incomeDateTo}
                      onChange={(e) => setIncomeDateTo(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIncomeDateFrom('');
                        setIncomeDateTo('');
                      }}
                      className="gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                      مسح الفلاتر
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border-0 shadow-md">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">الإيرادات</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">
                    {formatCurrency(totalRevenue)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {revenueAccounts.length} حساب
                  </p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-md">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">المصروفات</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">
                    {formatCurrency(totalExpenses)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {expenseAccounts.length} حساب
                  </p>
                </CardContent>
              </Card>
              <Card
                className={`border-0 shadow-md ${
                  netProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'
                }`}
              >
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    {netProfit >= 0 ? 'صافي الربح' : 'صافي الخسارة'}
                  </p>
                  <p
                    className={`text-2xl font-bold mt-1 ${
                      netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(Math.abs(netProfit))}
                  </p>
                  <Badge
                    variant="secondary"
                    className={`mt-1 ${
                      netProfit >= 0
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}
                  >
                    {netProfit >= 0 ? 'ربح' : 'خسارة'}
                  </Badge>
                </CardContent>
              </Card>
            </div>

            {/* Income Statement Detail */}
            <Card className="border-0 shadow-md">
              <CardContent className="p-0">
                {incomeLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : incomeData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 px-4">
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                      <TrendingUp className="w-12 h-12 text-primary/60" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">لا توجد بيانات</h3>
                    <p className="text-muted-foreground text-sm text-center max-w-xs">
                      لم يتم العثور على بيانات إيرادات أو مصروفات في الفترة المحددة
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">اسم الحساب</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">النوع</TableHead>
                          <TableHead className="text-right">مدين</TableHead>
                          <TableHead className="text-right">دائن</TableHead>
                          <TableHead className="text-right">الرصيد</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Revenue Section Header */}
                        <TableRow className="bg-emerald-50 dark:bg-emerald-900/20">
                          <TableCell colSpan={5} className="font-bold text-emerald-700 dark:text-emerald-400">
                            الإيرادات
                          </TableCell>
                        </TableRow>
                        {revenueAccounts.map((account) => (
                          <TableRow key={account.account_name}>
                            <TableCell className="font-medium pr-6">
                              {account.account_name}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${getAccountTypeColor('revenue')}`}
                              >
                                إيرادات
                              </Badge>
                            </TableCell>
                            <TableCell>{formatCurrency(account.total_debit)}</TableCell>
                            <TableCell>{formatCurrency(account.total_credit)}</TableCell>
                            <TableCell className="font-semibold text-emerald-600">
                              {formatCurrency(account.total_credit - account.total_debit)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Revenue Total */}
                        <TableRow className="bg-emerald-50/50 dark:bg-emerald-900/10 font-semibold">
                          <TableCell colSpan={4} className="text-left text-emerald-700 dark:text-emerald-400">
                            إجمالي الإيرادات
                          </TableCell>
                          <TableCell className="text-emerald-700 dark:text-emerald-400">
                            {formatCurrency(totalRevenue)}
                          </TableCell>
                        </TableRow>

                        {/* Expense Section Header */}
                        <TableRow className="bg-red-50 dark:bg-red-900/20">
                          <TableCell colSpan={5} className="font-bold text-red-700 dark:text-red-400">
                            المصروفات
                          </TableCell>
                        </TableRow>
                        {expenseAccounts.map((account) => (
                          <TableRow key={account.account_name}>
                            <TableCell className="font-medium pr-6">
                              {account.account_name}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${getAccountTypeColor('expense')}`}
                              >
                                مصروفات
                              </Badge>
                            </TableCell>
                            <TableCell>{formatCurrency(account.total_debit)}</TableCell>
                            <TableCell>{formatCurrency(account.total_credit)}</TableCell>
                            <TableCell className="font-semibold text-red-600">
                              {formatCurrency(account.total_debit - account.total_credit)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Expense Total */}
                        <TableRow className="bg-red-50/50 dark:bg-red-900/10 font-semibold">
                          <TableCell colSpan={4} className="text-left text-red-700 dark:text-red-400">
                            إجمالي المصروفات
                          </TableCell>
                          <TableCell className="text-red-700 dark:text-red-400">
                            {formatCurrency(totalExpenses)}
                          </TableCell>
                        </TableRow>

                        {/* Net Profit/Loss */}
                        <TableRow
                          className={`font-bold text-lg border-t-2 ${
                            netProfit >= 0
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-400'
                              : 'bg-red-100 dark:bg-red-900/30 border-red-400'
                          }`}
                        >
                          <TableCell
                            colSpan={4}
                            className={netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}
                          >
                            {netProfit >= 0 ? 'صافي الربح' : 'صافي الخسارة'}
                          </TableCell>
                          <TableCell
                            className={netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}
                          >
                            {formatCurrency(Math.abs(netProfit))}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== BALANCE SHEET TAB ==================== */}
          <TabsContent value="balance-sheet" className="space-y-4 mt-4">
            {/* Filters */}
            <Card className="border-0 shadow-md">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">حتى تاريخ</Label>
                    <Input
                      type="date"
                      value={balanceSheetDate}
                      onChange={(e) => setBalanceSheetDate(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setBalanceSheetDate('')}
                      className="gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                      مسح الفلتر
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Balance Check */}
            {balanceSheetData.length > 0 && (
              <div
                className={`flex items-center gap-2 p-3 rounded-lg border ${
                  balanceSheetBalanced
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}
              >
                {balanceSheetBalanced ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                )}
                <span
                  className={`text-sm font-medium ${
                    balanceSheetBalanced
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {balanceSheetBalanced
                    ? 'الميزانية متوازنة - الأصول = الخصوم + حقوق الملكية + صافي الربح'
                    : `الميزانية غير متوازنة - الفرق: ${formatCurrency(Math.abs(totalAssets - liabilitiesEquityProfit))}`}
                </span>
              </div>
            )}

            {/* Balance Sheet Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Assets Side */}
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={`text-xs ${getAccountTypeColor('asset')}`}
                    >
                      الأصول
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {balanceSheetLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : assetAccounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      لا توجد حسابات أصول
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {assetAccounts.map((account) => {
                        const balance = account.total_debit - account.total_credit;
                        return (
                          <div
                            key={account.account_name}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                          >
                            <span className="text-sm font-medium">{account.account_name}</span>
                            <span className="font-semibold text-emerald-600">
                              {formatCurrency(Math.abs(balance))}
                            </span>
                          </div>
                        );
                      })}
                      <Separator />
                      <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 font-bold">
                        <span className="text-emerald-700 dark:text-emerald-400">إجمالي الأصول</span>
                        <span className="text-emerald-700 dark:text-emerald-400 text-lg">
                          {formatCurrency(Math.abs(totalAssets))}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Liabilities + Equity Side */}
              <div className="space-y-4">
                <Card className="border-0 shadow-md">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`text-xs ${getAccountTypeColor('liability')}`}
                      >
                        الخصوم
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {balanceSheetLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : liabilityAccounts.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        لا توجد حسابات خصوم
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {liabilityAccounts.map((account) => {
                          const balance = account.total_credit - account.total_debit;
                          return (
                            <div
                              key={account.account_name}
                              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                            >
                              <span className="text-sm font-medium">{account.account_name}</span>
                              <span className="font-semibold text-red-600">
                                {formatCurrency(Math.abs(balance))}
                              </span>
                            </div>
                          );
                        })}
                        <Separator />
                        <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/20 font-bold">
                          <span className="text-red-700 dark:text-red-400">إجمالي الخصوم</span>
                          <span className="text-red-700 dark:text-red-400">
                            {formatCurrency(Math.abs(totalLiabilities))}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-md">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`text-xs ${getAccountTypeColor('equity')}`}
                      >
                        حقوق الملكية
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {balanceSheetLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {equityAccounts.map((account) => {
                          const balance = account.total_credit - account.total_debit;
                          return (
                            <div
                              key={account.account_name}
                              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                            >
                              <span className="text-sm font-medium">{account.account_name}</span>
                              <span className="font-semibold text-purple-600">
                                {formatCurrency(Math.abs(balance))}
                              </span>
                            </div>
                          );
                        })}
                        {/* Net Profit Line */}
                        {balanceSheetNetProfit !== 0 && (
                          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                            <span className="text-sm font-medium">
                              {balanceSheetNetProfit >= 0 ? 'صافي الربح' : 'صافي الخسارة'}
                            </span>
                            <span
                              className={`font-semibold ${
                                balanceSheetNetProfit >= 0 ? 'text-emerald-600' : 'text-red-600'
                              }`}
                            >
                              {formatCurrency(Math.abs(balanceSheetNetProfit))}
                            </span>
                          </div>
                        )}
                        <Separator />
                        <div className="flex items-center justify-between p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 font-bold">
                          <span className="text-purple-700 dark:text-purple-400">
                            إجمالي حقوق الملكية + صافي الربح
                          </span>
                          <span className="text-purple-700 dark:text-purple-400">
                            {formatCurrency(Math.abs(totalEquity + balanceSheetNetProfit))}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Grand Total Liabilities + Equity */}
                <Card className="border-0 shadow-md bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between font-bold text-lg">
                      <span>الخصوم + حقوق الملكية + صافي الربح</span>
                      <span className="text-primary">
                        {formatCurrency(Math.abs(liabilitiesEquityProfit))}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Empty State */}
            {!balanceSheetLoading && balanceSheetData.length === 0 && (
              <Card className="border-0 shadow-md">
                <CardContent className="p-0">
                  <div className="flex flex-col items-center justify-center py-20 px-4">
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                      <PieChart className="w-12 h-12 text-primary/60" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">لا توجد بيانات</h3>
                    <p className="text-muted-foreground text-sm text-center max-w-xs">
                      لم يتم العثور على بيانات أصول أو خصوم أو حقوق ملكية
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}

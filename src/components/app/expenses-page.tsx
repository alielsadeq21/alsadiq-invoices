'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Expense, ExpenseCategory, Branch, PaymentMethod } from '@/lib/types';
import { formatCurrency, formatDate, generateExpenseNumber, generateJournalEntryNumber, getCurrentYear, getTodayISO } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Receipt,
  Plus,
  Search,
  ChevronRight,
  ChevronLeft,
  Printer,
  Pencil,
  Trash2,
  Loader2,
  Building2,
  Tags,
  Calendar,
  Banknote,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const PAGE_SIZE = 10;

const defaultMethodLabels: Record<string, string> = {
  cash: 'كاش',
  bank_transfer: 'تحويل بنكي',
  cheque: 'شيك',
};

const defaultMethodColors: Record<string, string> = {
  cash: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  bank_transfer: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  cheque: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

interface ExpenseFormData {
  id: string;
  expense_number: string;
  branch_id: string;
  category_id: string;
  description: string;
  amount: string;
  expense_date: string;
  payment_method: string;
  notes: string;
}

const emptyFormData: ExpenseFormData = {
  id: '',
  expense_number: '',
  branch_id: '',
  category_id: '',
  description: '',
  amount: '',
  expense_date: '',
  payment_method: 'cash',
  notes: '',
};

export default function ExpensesPage() {
  const { user, isAdmin, hasPermission, settings } = useAppStore();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ExpenseFormData>(emptyFormData);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadBranches();
    loadCategories();
    loadPaymentMethods();
  }, []);

  useEffect(() => {
    loadExpenses();
  }, [page, search, branchFilter, categoryFilter, dateFrom, dateTo]);

  const loadBranches = async () => {
    let query = supabase.from('branches').select('*').eq('is_active', true).order('name');
    if (!isAdmin && user?.branch_id) query = query.eq('id', user.branch_id);
    const { data } = await query;
    if (data) setBranches(data as Branch[]);
  };

  const loadCategories = async () => {
    const { data } = await supabase
      .from('expense_categories')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (data) setCategories(data as ExpenseCategory[]);
  };

  const loadPaymentMethods = async () => {
    try {
      const { data, error } = await supabase.from('payment_methods').select('*').order('sort_order');
      if (!error && data && data.length > 0) {
        setPaymentMethods(data as PaymentMethod[]);
      } else {
        setPaymentMethods([
          { id: 'cash', name: 'كاش', is_default: true, sort_order: 1, created_at: '' },
          { id: 'bank_transfer', name: 'تحويل بنكي', is_default: false, sort_order: 2, created_at: '' },
          { id: 'cheque', name: 'شيك', is_default: false, sort_order: 3, created_at: '' },
        ]);
      }
    } catch {
      setPaymentMethods([
        { id: 'cash', name: 'كاش', is_default: true, sort_order: 1, created_at: '' },
        { id: 'bank_transfer', name: 'تحويل بنكي', is_default: false, sort_order: 2, created_at: '' },
        { id: 'cheque', name: 'شيك', is_default: false, sort_order: 3, created_at: '' },
      ]);
    }
  };

  const getMethodLabel = (method: string): string => {
    const found = paymentMethods.find(m => m.id === method || m.name === method);
    if (found) return found.name;
    return defaultMethodLabels[method] || method;
  };

  const getMethodColor = (method: string): string => {
    if (defaultMethodColors[method]) return defaultMethodColors[method];
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  const loadExpenses = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('expenses')
        .select('*, branches(name), expense_categories(name)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`expense_number.ilike.%${search}%,description.ilike.%${search}%`);
      }
      if (branchFilter !== 'all') {
        query = query.eq('branch_id', branchFilter);
      }
      if (categoryFilter !== 'all') {
        query = query.eq('category_id', categoryFilter);
      }
      if (dateFrom) {
        query = query.gte('expense_date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('expense_date', dateTo);
      }

      // Branch user: always filter by their branch
      if (!isAdmin && user?.branch_id) {
        query = query.eq('branch_id', user.branch_id);
      }

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (!error && data) {
        setExpenses(data as unknown as Expense[]);
        setTotalCount(count || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = async () => {
    setIsEditing(false);
    const year = getCurrentYear();
    const { data: lastExp } = await supabase
      .from('expenses')
      .select('expense_number')
      .like('expense_number', `EXP-${year}-%`)
      .order('expense_number', { ascending: false })
      .limit(1);

    let lastNum = 0;
    if (lastExp && lastExp.length > 0) {
      const parts = lastExp[0].expense_number.split('-');
      lastNum = parseInt(parts[parts.length - 1]) || 0;
    }

    const defaultMethod = paymentMethods.find(m => m.is_default);

    setFormData({
      id: '',
      expense_number: generateExpenseNumber(lastNum, year),
      branch_id: !isAdmin && user?.branch_id ? user.branch_id : '',
      category_id: '',
      description: '',
      amount: '',
      expense_date: getTodayISO(),
      payment_method: defaultMethod?.id || 'cash',
      notes: '',
    });
    setDialogOpen(true);
  };

  const openEditDialog = (expense: Expense) => {
    setIsEditing(true);
    setFormData({
      id: expense.id,
      expense_number: expense.expense_number,
      branch_id: expense.branch_id,
      category_id: expense.category_id || '',
      description: expense.description,
      amount: String(expense.amount),
      expense_date: expense.expense_date,
      payment_method: expense.payment_method,
      notes: expense.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.branch_id) {
      toast.error('يرجى اختيار الفرع');
      return;
    }
    if (!formData.description.trim()) {
      toast.error('يرجى إدخال الوصف');
      return;
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح');
      return;
    }
    if (!formData.expense_date) {
      toast.error('يرجى تحديد التاريخ');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        branch_id: formData.branch_id,
        category_id: formData.category_id || null,
        description: formData.description.trim(),
        amount: Number(formData.amount),
        expense_date: formData.expense_date,
        payment_method: formData.payment_method,
        notes: formData.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (isEditing) {
        const { error } = await supabase
          .from('expenses')
          .update(payload)
          .eq('id', formData.id);

        if (error) throw error;

        await supabase.from('audit_log').insert({
          action: 'edit_expense',
          details: { expense_number: formData.expense_number, amount: Number(formData.amount) },
        });

        toast.success('تم تعديل المصروف بنجاح');
      } else {
        const { error } = await supabase.from('expenses').insert({
          expense_number: formData.expense_number,
          ...payload,
          created_by: user?.id || null,
        });

        if (error) throw error;

        await supabase.from('audit_log').insert({
          action: 'create_expense',
          details: { expense_number: formData.expense_number, amount: Number(formData.amount), branch_id: formData.branch_id },
        });

        // ===== ربط المصروفات بالقيود المحاسبية: إنشاء قيد تلقائي =====
        try {
          const year = getCurrentYear();
          const { data: lastEntry } = await supabase
            .from('journal_entries')
            .select('entry_number')
            .like('entry_number', `JE-${year}-%`)
            .order('entry_number', { ascending: false })
            .limit(1);

          let lastNum = 0;
          if (lastEntry && lastEntry.length > 0) {
            const parts = lastEntry[0].entry_number.split('-');
            lastNum = parseInt(parts[parts.length - 1]) || 0;
          }

          const categoryName = categories.find(c => c.id === formData.category_id)?.name || 'مصروفات عامة';
          const entryNumber = generateJournalEntryNumber(lastNum, year);
          const amount = Number(formData.amount);

          // Create journal entry: debit the expense account, credit the cash/bank account
          const { data: newEntry, error: jeError } = await supabase
            .from('journal_entries')
            .insert({
              entry_number: entryNumber,
              entry_date: formData.expense_date,
              description: `قيد مصروف: ${formData.description} (${categoryName})`,
              total_debit: amount,
              total_credit: amount,
              is_posted: true,
              notes: `قيد تلقائي من مصروف رقم ${formData.expense_number}`,
              created_by: user?.id || null,
            })
            .select('id')
            .single();

          if (!jeError && newEntry) {
            // Create journal entry lines
            const methodLabel = formData.payment_method === 'cash' ? 'الصندوق' :
                              formData.payment_method === 'bank_transfer' ? 'البنك' : 'الشيكات';
            await supabase.from('journal_entry_lines').insert([
              {
                journal_entry_id: newEntry.id,
                account_name: categoryName,
                debit: amount,
                credit: 0,
                description: formData.description,
              },
              {
                journal_entry_id: newEntry.id,
                account_name: methodLabel,
                debit: 0,
                credit: amount,
                description: `مقابل مصروف: ${formData.description}`,
              },
            ]);

            // Link expense to journal entry
            await supabase
              .from('expenses')
              .update({ journal_entry_id: newEntry.id })
              .eq('id', (await supabase.from('expenses').select('id').eq('expense_number', formData.expense_number).single()).data?.id);

            toast.success('تم تسجيل المصروف وإنشاء القيد المحاسبي تلقائياً');
          } else {
            toast.success('تم تسجيل المصروف (لم يتم إنشاء قيد محاسبي)');
          }
        } catch (jeErr) {
          console.error('Journal entry error:', jeErr);
          toast.success('تم تسجيل المصروف (خطأ في إنشاء القيد المحاسبي)');
        }
      }

      setDialogOpen(false);
      loadExpenses();
    } catch (err) {
      console.error(err);
      toast.error(isEditing ? 'حدث خطأ أثناء تعديل المصروف' : 'حدث خطأ أثناء حفظ المصروف');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!expenseToDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseToDelete.id);

      if (error) throw error;

      await supabase.from('audit_log').insert({
        action: 'delete_expense',
        details: { expense_number: expenseToDelete.expense_number, amount: Number(expenseToDelete.amount) },
      });

      toast.success('تم حذف المصروف بنجاح');
      setDeleteDialogOpen(false);
      setExpenseToDelete(null);
      loadExpenses();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء حذف المصروف');
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = (expense: Expense) => {
    setExpenseToDelete(expense);
    setDeleteDialogOpen(true);
  };

  const handlePrint = (expense: Expense) => {
    const branchName = (expense as any).branches?.name || '—';
    const categoryName = (expense as any).expense_categories?.name || '—';
    const factoryName = settings?.factory_name || 'مصنع الصادق';
    const methodLabel = getMethodLabel(expense.payment_method);

    const htmlDoc = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>إيصال مصروف - ${expense.expense_number}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Cairo', sans-serif; background: #fff; color: #1a1a1a; padding: 20px; }
    .rcpt-container { max-width: 700px; margin: 0 auto; border: 2px solid #1a1a1a; padding: 30px; }
    .header { text-align: center; border-bottom: 2px solid #1a1a1a; padding-bottom: 15px; margin-bottom: 20px; }
    .header h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .header p { font-size: 13px; color: #555; }
    .title-row { text-align: center; margin-bottom: 20px; }
    .title-row h2 { font-size: 20px; font-weight: 700; background: #1a1a1a; color: #fff; display: inline-block; padding: 6px 24px; border-radius: 4px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 30px; margin-bottom: 20px; }
    .info-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #ccc; }
    .info-item .label { color: #666; font-size: 13px; }
    .info-item .value { font-weight: 600; font-size: 14px; }
    .amount-section { text-align: center; padding: 20px; border: 2px solid #1a1a1a; border-radius: 8px; margin: 20px 0; background: #f9f9f9; }
    .amount-label { font-size: 14px; color: #666; margin-bottom: 6px; }
    .amount-value { font-size: 28px; font-weight: 700; color: #c0392b; }
    .notes-section { margin-top: 15px; padding: 10px; background: #f5f5f5; border-radius: 4px; }
    .notes-section .notes-label { font-weight: 600; margin-bottom: 4px; font-size: 13px; }
    .notes-section .notes-text { font-size: 13px; color: #555; }
    .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
    @media print { body { padding: 0; } .rcpt-container { border: none; } }
  </style>
</head>
<body>
  <div class="rcpt-container">
    <div class="header">
      <h1>${factoryName}</h1>
      <p>إيصال صرف مصروفات</p>
    </div>
    <div class="title-row">
      <h2>${expense.expense_number}</h2>
    </div>
    <div class="info-grid">
      <div class="info-item">
        <span class="label">الفرع</span>
        <span class="value">${branchName}</span>
      </div>
      <div class="info-item">
        <span class="label">التصنيف</span>
        <span class="value">${categoryName}</span>
      </div>
      <div class="info-item">
        <span class="label">التاريخ</span>
        <span class="value">${formatDate(expense.expense_date)}</span>
      </div>
      <div class="info-item">
        <span class="label">طريقة الدفع</span>
        <span class="value">${methodLabel}</span>
      </div>
    </div>
    <div class="info-item" style="margin-bottom:10px;">
      <span class="label">الوصف</span>
      <span class="value">${expense.description}</span>
    </div>
    <div class="amount-section">
      <div class="amount-label">المبلغ</div>
      <div class="amount-value">${formatCurrency(expense.amount)}</div>
    </div>
    ${expense.notes ? `
    <div class="notes-section">
      <div class="notes-label">ملاحظات:</div>
      <div class="notes-text">${expense.notes}</div>
    </div>` : ''}
    <div class="footer">
      تم الطباعة بتاريخ ${new Date().toLocaleDateString('ar-EG')} - ${factoryName}
    </div>
  </div>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=800,height=1000');
    if (!printWindow) {
      toast.error('يرجى السماح بالنوافذ المنبثقة للطباعة');
      return;
    }

    printWindow.document.write(htmlDoc);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 1200);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const clearFilters = () => {
    setSearch('');
    setBranchFilter('all');
    setCategoryFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const hasActiveFilters = search || branchFilter !== 'all' || categoryFilter !== 'all' || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
            <Receipt className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">المصروفات</h1>
            <p className="text-muted-foreground text-sm mt-1">
              إجمالي المصروفات ({totalCount} مصروف)
            </p>
          </div>
        </div>
        {hasPermission('expenses', 'create') && (
          <Button onClick={openCreateDialog} className="gap-2 shadow-lg text-white" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
            <Plus className="w-4 h-4" />
            مصروف جديد
          </Button>
        )}
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="h-1" style={{ background: 'linear-gradient(90deg, #f97316, #fb923c, #f97316)' }} />
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="relative col-span-2 sm:col-span-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="بحث برقم المصروف أو الوصف..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pr-10"
                />
              </div>
              {isAdmin && (
                <div>
                  <Select value={branchFilter} onValueChange={(v) => { setBranchFilter(v); setPage(1); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="كل الفروع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل الفروع</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="كل التصنيفات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل التصنيفات</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  placeholder="من تاريخ"
                />
              </div>
              <div>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  placeholder="إلى تاريخ"
                />
              </div>
              {hasActiveFilters && (
                <div className="flex items-end col-span-2 sm:col-span-1">
                  <Button variant="outline" onClick={clearFilters} className="gap-2 w-full">
                    مسح الفلاتر
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Expenses Table / Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Card className="border-0 shadow-md overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="mr-2 text-muted-foreground">جاري التحميل...</span>
              </div>
            ) : expenses.length === 0 ? (
              /* Empty State */
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="w-24 h-24 rounded-2xl flex items-center justify-center mb-5 shadow-lg" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                  <Receipt className="w-12 h-12 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-2">لا توجد مصروفات</h3>
                <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs">
                  لم يتم تسجيل أي مصروفات بعد. ابدأ بتسجيل أول مصروف لتتبع نفقات المصنع.
                </p>
                {hasPermission('expenses', 'create') && (
                  <Button onClick={openCreateDialog} className="gap-2 shadow-lg text-white" size="lg" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                    <Plus className="w-5 h-5" />
                    تسجيل مصروف جديد
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block">
                  {/* Gradient accent bar */}
                  <div className="h-1" style={{ background: 'linear-gradient(90deg, #f97316, #fb923c, #f97316)' }} />
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="text-right font-semibold">رقم المصروف</TableHead>
                          <TableHead className="text-right hidden md:table-cell font-semibold">الفرع</TableHead>
                          <TableHead className="text-right hidden sm:table-cell font-semibold">التصنيف</TableHead>
                          <TableHead className="text-right font-semibold">الوصف</TableHead>
                          <TableHead className="text-right font-semibold">المبلغ</TableHead>
                          <TableHead className="text-right hidden lg:table-cell font-semibold">التاريخ</TableHead>
                          <TableHead className="text-center hidden md:table-cell font-semibold">طريقة الدفع</TableHead>
                          <TableHead className="text-center font-semibold">إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expenses.map((expense) => (
                          <TableRow key={expense.id} className="transition-colors hover:bg-orange-50/50 dark:hover:bg-orange-950/10">
                            <TableCell>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                                  <Receipt className="w-3.5 h-3.5 text-white" />
                                </div>
                                <span className="font-medium text-sm">{expense.expense_number}</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">{(expense as any).branches?.name || '—'}</TableCell>
                            <TableCell className="hidden sm:table-cell">{(expense as any).expense_categories?.name || '—'}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{expense.description}</TableCell>
                            <TableCell>
                              <span className="font-bold text-orange-600 dark:text-orange-400">{formatCurrency(expense.amount)}</span>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">{formatDate(expense.expense_date)}</TableCell>
                            <TableCell className="text-center hidden md:table-cell">
                              <Badge variant="secondary" className={`text-[10px] font-medium ${getMethodColor(expense.payment_method)}`}>
                                {getMethodLabel(expense.payment_method)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                {hasPermission('expenses', 'print') && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-600"
                                    onClick={() => handlePrint(expense)}
                                    title="طباعة"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {hasPermission('expenses', 'edit') && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-600"
                                    onClick={() => openEditDialog(expense)}
                                    title="تعديل"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {hasPermission('expenses', 'delete') && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-red-50 dark:hover:bg-red-950/30"
                                    onClick={() => confirmDelete(expense)}
                                    title="حذف"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Mobile Card Layout */}
                <div className="sm:hidden p-3 space-y-3">
                  {expenses.map((expense) => (
                    <motion.div
                      key={expense.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5"
                      style={{ borderRight: '4px solid #f97316' }}
                    >
                      <div className="p-3 sm:p-4 space-y-3">
                        {/* Top row: expense number + amount */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                              <Receipt className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <p className="font-bold text-sm">{expense.expense_number}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(expense.expense_date)}</p>
                            </div>
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-lg text-orange-600 dark:text-orange-400">{formatCurrency(expense.amount)}</p>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-sm text-foreground/80 line-clamp-2 leading-relaxed">
                          {expense.description}
                        </p>

                        {/* Info badges row */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} className="rounded-md bg-muted/50 px-2 py-1">
                            <Building2 className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{(expense as any).branches?.name || '—'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} className="rounded-md bg-muted/50 px-2 py-1">
                            <Tags className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{(expense as any).expense_categories?.name || '—'}</span>
                          </div>
                          <Badge variant="secondary" className={`text-[10px] font-medium h-6 ${getMethodColor(expense.payment_method)}`}>
                            {getMethodLabel(expense.payment_method)}
                          </Badge>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', paddingTop: '4px', borderTop: '1px solid', borderTopColor: 'var(--border)' }}>
                          {hasPermission('expenses', 'print') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-xs hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-600 hover:border-blue-200"
                              onClick={() => handlePrint(expense)}
                            >
                              <Printer className="w-3 h-3" />
                              طباعة
                            </Button>
                          )}
                          {hasPermission('expenses', 'edit') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-xs hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-600 hover:border-amber-200"
                              onClick={() => openEditDialog(expense)}
                            >
                              <Pencil className="w-3 h-3" />
                              تعديل
                            </Button>
                          )}
                          {hasPermission('expenses', 'delete') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-200"
                              onClick={() => confirmDelete(expense)}
                            >
                              <Trash2 className="w-3 h-3" />
                              حذف
                            </Button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-sm text-muted-foreground">
                      صفحة {page} من {totalPages}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page <= 1}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page >= totalPages}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Create/Edit Expense Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                <Receipt className="w-4 h-4 text-white" />
              </div>
              {isEditing ? 'تعديل المصروف' : 'تسجيل مصروف جديد'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>رقم المصروف</Label>
                <Input value={formData.expense_number} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>الفرع *</Label>
                <Select
                  value={formData.branch_id}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, branch_id: v }))}
                  disabled={!isAdmin && !!user?.branch_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>التصنيف</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, category_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر التصنيف" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>طريقة الدفع</Label>
                <Select
                  value={formData.payment_method}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, payment_method: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>الوصف *</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="وصف المصروف..."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>المبلغ (ج.م) *</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                  className="text-left"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label>التاريخ *</Label>
                <Input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, expense_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="ملاحظات إضافية..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving} className="text-white" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  جاري الحفظ...
                </>
              ) : isEditing ? 'حفظ التعديلات' : 'حفظ المصروف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-destructive/10">
                <Trash2 className="w-4 h-4 text-destructive" />
              </div>
              تأكيد حذف المصروف
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد من حذف المصروف رقم &quot;{expenseToDelete?.expense_number}&quot; بمبلغ {expenseToDelete ? formatCurrency(expenseToDelete.amount) : ''}؟
              لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  جاري الحذف...
                </>
              ) : 'حذف'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

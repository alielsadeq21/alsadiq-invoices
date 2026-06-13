'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { JournalEntry, JournalEntryLine } from '@/lib/types';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  generateJournalEntryNumber,
  getCurrentYear,
} from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import {
  BookOpen,
  Plus,
  Search,
  ChevronRight,
  ChevronLeft,
  Eye,
  Edit,
  Trash2,
  CheckCircle2,
  Loader2,
  ArrowUpDown,
  X,
  CircleDot,
  FileText,
  Calendar,
  Hash,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const PAGE_SIZE = 10;

interface FormLine {
  account_name: string;
  debit: string;
  credit: string;
  description: string;
}

const emptyLine: FormLine = {
  account_name: '',
  debit: '',
  credit: '',
  description: '',
};

export default function AccountingPage() {
  const { user, isAdmin, hasPermission } = useAppStore();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [entryNumber, setEntryNumber] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<FormLine[]>([{ ...emptyLine }, { ...emptyLine }]);

  // View detail dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewEntry, setViewEntry] = useState<JournalEntry | null>(null);
  const [viewLines, setViewLines] = useState<JournalEntryLine[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  // Post confirmation
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [postingEntry, setPostingEntry] = useState<JournalEntry | null>(null);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<JournalEntry | null>(null);

  const canView = hasPermission('accounting', 'view');
  const canCreate = hasPermission('accounting', 'create');
  const canEdit = hasPermission('accounting', 'edit');
  const canExport = hasPermission('accounting', 'export');

  useEffect(() => {
    loadEntries();
  }, [page, search, statusFilter, dateFrom, dateTo]);

  const loadEntries = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('journal_entries')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`entry_number.ilike.%${search}%,description.ilike.%${search}%`);
      }
      if (statusFilter === 'posted') {
        query = query.eq('is_posted', true);
      } else if (statusFilter === 'draft') {
        query = query.eq('is_posted', false);
      }
      if (dateFrom) {
        query = query.gte('entry_date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('entry_date', dateTo);
      }

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (!error && data) {
        setEntries(data as JournalEntry[]);
        setTotalCount(count || 0);
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const logAction = async (action: string, details: Record<string, unknown>) => {
    try {
      await supabase.from('audit_log').insert({ action, details });
    } catch {
      // Silent fail for audit logging
    }
  };

  const openCreateDialog = async () => {
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
    setEntryNumber(generateJournalEntryNumber(lastNum, year));
    setEntryDate(new Date().toISOString().split('T')[0]);
    setDescription('');
    setNotes('');
    setLines([{ ...emptyLine }, { ...emptyLine }]);
    setEditingEntry(null);
    setDialogOpen(true);
  };

  const openEditDialog = async (entry: JournalEntry) => {
    setEditingEntry(entry);
    setEntryNumber(entry.entry_number);
    setEntryDate(entry.entry_date);
    setDescription(entry.description);
    setNotes(entry.notes || '');
    setSaving(false);

    // Load lines for the entry
    try {
      const { data, error } = await supabase
        .from('journal_entry_lines')
        .select('*')
        .eq('journal_entry_id', entry.id)
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        setLines(
          data.map((line) => ({
            account_name: line.account_name,
            debit: line.debit.toString(),
            credit: line.credit.toString(),
            description: line.description || '',
          }))
        );
      } else {
        setLines([{ ...emptyLine }, { ...emptyLine }]);
      }
    } catch {
      setLines([{ ...emptyLine }, { ...emptyLine }]);
    }

    setDialogOpen(true);
  };

  const openViewDialog = async (entry: JournalEntry) => {
    setViewEntry(entry);
    setViewDialogOpen(true);
    setViewLoading(true);
    setViewLines([]);

    try {
      const { data, error } = await supabase
        .from('journal_entry_lines')
        .select('*')
        .eq('journal_entry_id', entry.id)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setViewLines(data as JournalEntryLine[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setViewLoading(false);
    }
  };

  const addLine = () => {
    setLines([...lines, { ...emptyLine }]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 2) {
      toast.error('يجب أن يحتوي القيد على سطرين على الأقل');
      return;
    }
    setLines(lines.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof FormLine, value: string) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  };

  const getTotalDebit = useCallback((): number => {
    return lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
  }, [lines]);

  const getTotalCredit = useCallback((): number => {
    return lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
  }, [lines]);

  const handleSave = async () => {
    if (!entryDate) {
      toast.error('يرجى تحديد تاريخ القيد');
      return;
    }
    if (!description.trim()) {
      toast.error('يرجى إدخال وصف القيد');
      return;
    }

    // Validate lines
    const validLines = lines.filter(
      (l) => l.account_name.trim() && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0)
    );

    if (validLines.length < 2) {
      toast.error('يجب أن يحتوي القيد على سطرين صالحين على الأقل');
      return;
    }

    // Check each line has either debit or credit but not both
    for (const line of validLines) {
      const d = parseFloat(line.debit) || 0;
      const c = parseFloat(line.credit) || 0;
      if (d > 0 && c > 0) {
        toast.error('لا يمكن أن يحتوي السطر الواحد على مدين ودائن معاً');
        return;
      }
      if (d === 0 && c === 0) {
        toast.error('يجب إدخال قيمة مدينة أو دائنة في كل سطر');
        return;
      }
    }

    const totalDebit = validLines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const totalCredit = validLines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      toast.error('إجمالي المدين يجب أن يساوي إجمالي الدائن');
      return;
    }

    setSaving(true);
    try {
      if (editingEntry) {
        // Update existing entry
        const { error: updateError } = await supabase
          .from('journal_entries')
          .update({
            entry_date: entryDate,
            description: description.trim(),
            total_debit: totalDebit,
            total_credit: totalCredit,
            notes: notes.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingEntry.id);

        if (updateError) throw updateError;

        // Delete existing lines
        const { error: deleteLinesError } = await supabase
          .from('journal_entry_lines')
          .delete()
          .eq('journal_entry_id', editingEntry.id);

        if (deleteLinesError) throw deleteLinesError;

        // Insert new lines
        const linesData = validLines.map((l) => ({
          journal_entry_id: editingEntry.id,
          account_name: l.account_name.trim(),
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          description: l.description.trim() || null,
        }));

        const { error: insertLinesError } = await supabase
          .from('journal_entry_lines')
          .insert(linesData);

        if (insertLinesError) throw insertLinesError;

        await logAction('update_journal_entry', {
          entry_id: editingEntry.id,
          entry_number: editingEntry.entry_number,
          updated_by: user?.id,
        });

        toast.success('تم تحديث القيد بنجاح');
      } else {
        // Create new entry
        const { data: newEntry, error: insertError } = await supabase
          .from('journal_entries')
          .insert({
            entry_number: entryNumber,
            entry_date: entryDate,
            description: description.trim(),
            total_debit: totalDebit,
            total_credit: totalCredit,
            is_posted: false,
            notes: notes.trim() || null,
            created_by: user?.id || null,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Insert lines
        if (newEntry) {
          const linesData = validLines.map((l) => ({
            journal_entry_id: newEntry.id,
            account_name: l.account_name.trim(),
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0,
            description: l.description.trim() || null,
          }));

          const { error: insertLinesError } = await supabase
            .from('journal_entry_lines')
            .insert(linesData);

          if (insertLinesError) throw insertLinesError;
        }

        await logAction('create_journal_entry', {
          entry_number: entryNumber,
          total_debit: totalDebit,
          total_credit: totalCredit,
          created_by: user?.id,
        });

        toast.success('تم إنشاء القيد بنجاح');
      }

      setDialogOpen(false);
      loadEntries();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async () => {
    if (!postingEntry) return;

    try {
      const { error } = await supabase
        .from('journal_entries')
        .update({
          is_posted: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postingEntry.id);

      if (error) throw error;

      await logAction('post_journal_entry', {
        entry_id: postingEntry.id,
        entry_number: postingEntry.entry_number,
        posted_by: user?.id,
      });

      toast.success('تم ترحيل القيد بنجاح');
      setPostDialogOpen(false);
      setPostingEntry(null);
      loadEntries();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء ترحيل القيد');
    }
  };

  const handleDelete = async () => {
    if (!deletingEntry) return;

    try {
      // Lines will be cascade deleted
      const { error } = await supabase
        .from('journal_entries')
        .delete()
        .eq('id', deletingEntry.id);

      if (error) throw error;

      await logAction('delete_journal_entry', {
        entry_id: deletingEntry.id,
        entry_number: deletingEntry.entry_number,
        deleted_by: user?.id,
      });

      toast.success('تم حذف القيد بنجاح');
      setDeleteDialogOpen(false);
      setDeletingEntry(null);
      loadEntries();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الحذف');
    }
  };

  const handleExport = () => {
    if (entries.length === 0) {
      toast.error('لا توجد بيانات للتصدير');
      return;
    }

    const headers = ['رقم القيد', 'التاريخ', 'الوصف', 'إجمالي المدين', 'إجمالي الدائن', 'الحالة', 'ملاحظات'];
    const csvRows = [headers.join(',')];

    entries.forEach((entry) => {
      const row = [
        entry.entry_number,
        entry.entry_date,
        `"${entry.description.replace(/"/g, '""')}"`,
        entry.total_debit.toFixed(2),
        entry.total_credit.toFixed(2),
        entry.is_posted ? 'مرحل' : 'مسودة',
        `"${(entry.notes || '').replace(/"/g, '""')}"`,
      ];
      csvRows.push(row.join(','));
    });

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `journal_entries_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success('تم تصدير البيانات بنجاح');
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const hasActiveFilters = search || statusFilter !== 'all' || dateFrom || dateTo;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-24 h-24 rounded-full flex items-center justify-center mb-5" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
          <BookOpen className="w-12 h-12 text-white" />
        </div>
        <h3 className="text-xl font-bold mb-2">غير مصرح بالوصول</h3>
        <p className="text-muted-foreground text-sm text-center">
          ليس لديك صلاحية لعرض هذه الصفحة
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">القيود المحاسبية</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                إجمالي القيود: {totalCount}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canExport && (
              <Button variant="outline" onClick={handleExport} className="gap-2">
                <ArrowUpDown className="w-4 h-4" />
                تصدير
              </Button>
            )}
            {canCreate && (
              <Button onClick={openCreateDialog} className="gap-2 shadow-md" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
                <Plus className="w-4 h-4" />
                قيد جديد
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="h-1" style={{ background: 'linear-gradient(90deg, #8b5cf6, #6d28d9, #4c1d95)' }} />
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="بحث برقم القيد أو الوصف..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pr-10"
                />
              </div>
              <div>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="حالة القيد" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="posted">مرحل</SelectItem>
                    <SelectItem value="draft">مسودة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Input
                  type="date"
                  placeholder="من تاريخ"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                />
              </div>
              <div>
                <Input
                  type="date"
                  placeholder="إلى تاريخ"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                />
              </div>
            </div>
            {hasActiveFilters && (
              <div className="flex items-center justify-end mt-3">
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                  مسح الفلاتر
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Entries Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <Card className="border-0 shadow-md overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="w-24 h-24 rounded-full flex items-center justify-center mb-5" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
                  <BookOpen className="w-12 h-12 text-white/80" />
                </div>
                <h3 className="text-xl font-bold mb-2">لا توجد قيود</h3>
                <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs">
                  لم يتم إنشاء أي قيود محاسبية بعد. ابدأ بإنشاء أول قيد.
                </p>
                {canCreate && (
                  <Button onClick={openCreateDialog} className="gap-2 shadow-md" size="lg" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
                    <Plus className="w-5 h-5" />
                    إنشاء قيد جديد
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Mobile Card Layout */}
                <div className="sm:hidden divide-y">
                  {entries.map((entry) => (
                    <div key={entry.id} className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
                            <Hash className="w-4 h-4 text-white" />
                          </div>
                          <span className="font-semibold text-sm">{entry.entry_number}</span>
                        </div>
                        {entry.is_posted ? (
                          <Badge
                            variant="secondary"
                            className="text-[11px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                          >
                            <CheckCircle2 className="w-3 h-3 ml-1" />
                            مرحل
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                          >
                            <CircleDot className="w-3 h-3 ml-1" />
                            مسودة
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(entry.entry_date)}
                      </div>
                      {entry.description && (
                        <p className="text-sm text-muted-foreground truncate">{entry.description}</p>
                      )}
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">مدين</p>
                          <p className="text-sm font-bold text-primary">{formatCurrency(entry.total_debit)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">دائن</p>
                          <p className="text-sm font-bold">{formatCurrency(entry.total_credit)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 pt-1">
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => openViewDialog(entry)}>
                          <Eye className="w-3.5 h-3.5" />
                          عرض
                        </Button>
                        {canEdit && !entry.is_posted && (
                          <>
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => openEditDialog(entry)}>
                              <Edit className="w-3.5 h-3.5" />
                              تعديل
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-emerald-600" onClick={() => { setPostingEntry(entry); setPostDialogOpen(true); }}>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              ترحيل
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-destructive" onClick={() => { setDeletingEntry(entry); setDeleteDialogOpen(true); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table */}
                <div className="hidden sm:block">
                  <div className="h-1" style={{ background: 'linear-gradient(90deg, #8b5cf6, #6d28d9, #4c1d95)' }} />
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-right font-bold">رقم القيد</TableHead>
                          <TableHead className="text-right font-bold">التاريخ</TableHead>
                          <TableHead className="text-right font-bold hidden md:table-cell">الوصف</TableHead>
                          <TableHead className="text-right font-bold">إجمالي المدين</TableHead>
                          <TableHead className="text-right font-bold">إجمالي الدائن</TableHead>
                          <TableHead className="text-center font-bold">الحالة</TableHead>
                          <TableHead className="text-center font-bold">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.map((entry) => (
                          <TableRow key={entry.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
                                  <FileText className="w-3 h-3 text-white" />
                                </div>
                                {entry.entry_number}
                              </div>
                            </TableCell>
                            <TableCell>{formatDate(entry.entry_date)}</TableCell>
                            <TableCell className="hidden md:table-cell max-w-[200px] truncate">
                              {entry.description}
                            </TableCell>
                            <TableCell className="font-semibold text-primary">
                              {formatCurrency(entry.total_debit)}
                            </TableCell>
                            <TableCell className="font-semibold">
                              {formatCurrency(entry.total_credit)}
                            </TableCell>
                            <TableCell className="text-center">
                              {entry.is_posted ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[11px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                                >
                                  <CheckCircle2 className="w-3 h-3 ml-1" />
                                  مرحل
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                >
                                  <CircleDot className="w-3 h-3 ml-1" />
                                  مسودة
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openViewDialog(entry)}
                                  title="عرض التفاصيل"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                {canEdit && !entry.is_posted && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => openEditDialog(entry)}
                                      title="تعديل"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                                      onClick={() => {
                                        setPostingEntry(entry);
                                        setPostDialogOpen(true);
                                      }}
                                      title="ترحيل"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={() => {
                                        setDeletingEntry(entry);
                                        setDeleteDialogOpen(true);
                                      }}
                                      title="حذف"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-sm text-muted-foreground">
                      صفحة {page} من {totalPages} ({totalCount} قيد)
                    </p>
                    <div className="flex items-center gap-1">
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-auto sm:max-w-3xl max-h-[90dvh] p-0 gap-0" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 shrink-0 border-b">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
                  <BookOpen className="w-4 h-4 text-white" />
                </div>
                {editingEntry ? 'تعديل القيد' : 'إنشاء قيد جديد'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6" style={{ minHeight: 0 }}>
            <div className="space-y-5 py-4">
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>رقم القيد</Label>
                  <Input value={entryNumber} disabled className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>تاريخ القيد *</Label>
                  <Input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>الحالة</Label>
                  <Input
                    value={editingEntry?.is_posted ? 'مرحل' : 'مسودة'}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>الوصف *</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="وصف القيد المحاسبي..."
                />
              </div>

              <div className="space-y-2">
                <Label>ملاحظات</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات إضافية..."
                  rows={2}
                />
              </div>

              <Separator />

              {/* Lines */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">بنود القيد</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLine}
                    className="gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    إضافة سطر
                  </Button>
                </div>

                <div className="rounded-lg border overflow-hidden">
                  {/* Lines Header */}
                  <div className="bg-muted/50 grid grid-cols-[1fr_120px_120px_1fr_40px] gap-2 p-3 text-xs font-medium">
                    <div className="text-right">اسم الحساب</div>
                    <div className="text-right">مدين</div>
                    <div className="text-right">دائن</div>
                    <div className="text-right">البيان</div>
                    <div></div>
                  </div>

                  {/* Lines Body */}
                  <div className="divide-y">
                    {lines.map((line, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-[1fr_120px_120px_1fr_40px] gap-2 p-2 items-center hover:bg-muted/20 transition-colors"
                      >
                        <Input
                          value={line.account_name}
                          onChange={(e) => updateLine(index, 'account_name', e.target.value)}
                          placeholder="اسم الحساب"
                          className="h-9 text-sm"
                        />
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={line.debit}
                          onChange={(e) => updateLine(index, 'debit', e.target.value)}
                          placeholder="0.00"
                          className="h-9 text-sm text-left"
                          min="0"
                          step="0.01"
                        />
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={line.credit}
                          onChange={(e) => updateLine(index, 'credit', e.target.value)}
                          placeholder="0.00"
                          className="h-9 text-sm text-left"
                          min="0"
                          step="0.01"
                        />
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(index, 'description', e.target.value)}
                          placeholder="البيان"
                          className="h-9 text-sm"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeLine(index)}
                          title="حذف السطر"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="bg-muted/50 grid grid-cols-[1fr_120px_120px_1fr_40px] gap-2 p-3 text-sm font-semibold border-t">
                    <div className="text-right">الإجمالي</div>
                    <div className="text-right text-primary">
                      {formatCurrency(getTotalDebit())}
                    </div>
                    <div className="text-right">
                      {formatCurrency(getTotalCredit())}
                    </div>
                    <div></div>
                    <div></div>
                  </div>
                </div>

                {/* Balance indicator */}
                {Math.abs(getTotalDebit() - getTotalCredit()) > 0.01 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <X className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-sm text-red-700 dark:text-red-400">
                      الفرق بين المدين والدائن: {formatCurrency(Math.abs(getTotalDebit() - getTotalCredit()))}
                    </span>
                  </div>
                )}
                {getTotalDebit() > 0 && Math.abs(getTotalDebit() - getTotalCredit()) <= 0.01 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-sm text-emerald-700 dark:text-emerald-400">
                      القيد متوازن
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-3 shrink-0 border-t bg-background">
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleSave} disabled={saving} style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
                {saving && <Loader2 className="w-4 h-4 animate-spin ml-1" />}
                {editingEntry ? 'تحديث القيد' : 'حفظ القيد'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Detail Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-auto sm:max-w-3xl max-h-[90dvh] p-0 gap-0" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 shrink-0 border-b">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
                  <FileText className="w-4 h-4 text-white" />
                </div>
                تفاصيل القيد {viewEntry?.entry_number}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6" style={{ minHeight: 0 }}>
            {viewEntry && (
              <div className="space-y-5 py-4">
                {/* Entry Info */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">رقم القيد</p>
                    <p className="font-semibold text-sm">{viewEntry.entry_number}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">التاريخ</p>
                    <p className="font-semibold text-sm">{formatDate(viewEntry.entry_date)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">الحالة</p>
                    {viewEntry.is_posted ? (
                      <Badge
                        variant="secondary"
                        className="text-[11px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                      >
                        <CheckCircle2 className="w-3 h-3 ml-1" />
                        مرحل
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                      >
                        <CircleDot className="w-3 h-3 ml-1" />
                        مسودة
                      </Badge>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">تاريخ الإنشاء</p>
                    <p className="font-semibold text-sm">{formatDateTime(viewEntry.created_at)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">الوصف</p>
                  <p className="font-medium text-sm">{viewEntry.description}</p>
                </div>

                {viewEntry.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
                    <p className="text-sm text-muted-foreground">{viewEntry.notes}</p>
                  </div>
                )}

                <Separator />

                {/* Lines Table */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">بنود القيد</h3>
                  {viewLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : viewLines.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">لا توجد بنود</p>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="text-right text-xs font-bold">اسم الحساب</TableHead>
                            <TableHead className="text-right text-xs font-bold">مدين</TableHead>
                            <TableHead className="text-right text-xs font-bold">دائن</TableHead>
                            <TableHead className="text-right text-xs font-bold hidden sm:table-cell">البيان</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {viewLines.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell className="text-sm font-medium">
                                {line.account_name}
                              </TableCell>
                              <TableCell className="text-sm text-primary font-semibold">
                                {line.debit > 0 ? formatCurrency(line.debit) : '—'}
                              </TableCell>
                              <TableCell className="text-sm font-semibold">
                                {line.credit > 0 ? formatCurrency(line.credit) : '—'}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                                {line.description || '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {/* Totals */}
                      <div className="bg-muted/50 grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 p-3 text-sm font-semibold border-t">
                        <div className="text-right">الإجمالي</div>
                        <div className="text-right text-primary">
                          {formatCurrency(viewEntry.total_debit)}
                        </div>
                        <div className="text-right">
                          {formatCurrency(viewEntry.total_credit)}
                        </div>
                        <div className="hidden sm:block"></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-3 shrink-0 border-t bg-background">
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                إغلاق
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post Confirmation Dialog */}
      <AlertDialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ترحيل القيد
            </AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من ترحيل القيد &quot;{postingEntry?.entry_number}&quot;؟
              بعد الترحيل لا يمكن تعديل القيد أو حذفه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPostingEntry(null)}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handlePost} className="bg-emerald-600 hover:bg-emerald-700">
              ترحيل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              حذف القيد
            </AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف القيد &quot;{deletingEntry?.entry_number}&quot;؟ لا يمكن التراجع عن هذا الإجراء وسيتم حذف جميع بنود القيد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingEntry(null)}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

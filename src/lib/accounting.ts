/**
 * accounting.ts - أدوات المحاسبة التلقائية
 * وظائف مساعدة لإنشاء القيود المحاسبية تلقائياً وتحديث أرصدة الحسابات
 */

import { supabase } from '@/lib/supabase';
import { generateJournalEntryNumber, getCurrentYear } from '@/lib/utils';

// ─── كودات الحسابات الافتراضية ────────────────────────────────────────────
export const ACCOUNT_CODES: Record<string, string> = {
  CASH: '1101',              // الصندوق (كاش)
  BANK: '1102',              // البنك
  CUSTOMERS: '1103',         // العملاء
  FACTORY_INVENTORY: '1104', // مخزون المصنع
  BRANCH_INVENTORY: '1105',  // مخزون الفروع
  SUPPLIERS: '2101',         // الموردين
  BRANCH_ACCOUNTS: '2102',   // حسابات الفروع
  SALES: '4100',             // المبيعات
  BRANCH_SALES: '4101',      // مبيعات الفروع
  SALES_RETURNS: '4201',     // مبيعات مرتجعة
  COST_OF_SALES: '5100',     // تكلفة المبيعات
  OPERATING_EXPENSES: '5200', // مصروفات تشغيلية
  ADMIN_EXPENSES: '5300',     // مصروفات إدارية
  TAX: '5400',               // الضريبة
};

// ─── الحصول على حساب من شجرة الحسابات ─────────────────────────────────────
export async function getAccountByCode(code: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('id, name')
    .eq('code', code)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  return { id: data.id, name: data.name };
}

// ─── إنشاء قيد محاسبي تلقائي ──────────────────────────────────────────────
interface AutoJournalEntryParams {
  entryDate: string;
  description: string;
  sourceType: string;
  sourceId: string;
  lines: {
    accountCode: string;   // كود الحساب من شجرة الحسابات
    accountName: string;   // اسم الحساب (fallback)
    debit: number;
    credit: number;
    lineDescription?: string;
  }[];
  createdBy?: string | null;
}

export async function createAutoJournalEntry(params: AutoJournalEntryParams) {
  const totalDebit = params.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = params.lines.reduce((s, l) => s + l.credit, 0);

  // Generate entry number
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

  const entryNumber = generateJournalEntryNumber(lastNum, year);

  // Create the journal entry
  const { data: newEntry, error: jeError } = await supabase
    .from('journal_entries')
    .insert({
      entry_number: entryNumber,
      entry_date: params.entryDate,
      description: params.description,
      total_debit: totalDebit,
      total_credit: totalCredit,
      is_posted: true,
      notes: `قيد تلقائي: ${params.description}`,
      created_by: params.createdBy || null,
      source_type: params.sourceType,
      source_id: params.sourceId,
    })
    .select('id')
    .single();

  if (jeError || !newEntry) {
    console.error('Error creating journal entry:', jeError);
    return { success: false, entryId: null, entryNumber: null };
  }

  // Create journal entry lines with account_id
  const linesPayload: Record<string, unknown>[] = [];
  for (const line of params.lines) {
    const account = await getAccountByCode(line.accountCode);
    linesPayload.push({
      journal_entry_id: newEntry.id,
      account_id: account?.id || null,
      account_name: account?.name || line.accountName,
      debit: line.debit,
      credit: line.credit,
      description: line.lineDescription || params.description,
    });
  }

  const { error: linesError } = await supabase
    .from('journal_entry_lines')
    .insert(linesPayload);

  if (linesError) {
    console.error('Error creating journal entry lines:', linesError);
    return { success: false, entryId: newEntry.id, entryNumber };
  }

  // Update account balances
  await updateAccountBalances(params.lines);

  return { success: true, entryId: newEntry.id, entryNumber };
}

// ─── تحديث أرصدة الحسابات ─────────────────────────────────────────────────
async function updateAccountBalances(
  lines: { accountCode: string; debit: number; credit: number }[]
) {
  // Group by account code
  const balanceChanges = new Map<string, { debit: number; credit: number }>();

  for (const line of lines) {
    const existing = balanceChanges.get(line.accountCode) || { debit: 0, credit: 0 };
    existing.debit += line.debit;
    existing.credit += line.credit;
    balanceChanges.set(line.accountCode, existing);
  }

  // Update each account's balance
  for (const [code, changes] of balanceChanges) {
    const { data: account } = await supabase
      .from('chart_of_accounts')
      .select('id, account_type, balance')
      .eq('code', code)
      .single();

    if (!account) continue;

    // For asset/expense: debit increases, credit decreases
    // For liability/equity/revenue: credit increases, debit decreases
    const isDebitNature = account.account_type === 'asset' || account.account_type === 'expense';
    const currentBalance = Number(account.balance) || 0;
    const change = isDebitNature
      ? changes.debit - changes.credit
      : changes.credit - changes.debit;

    await supabase
      .from('chart_of_accounts')
      .update({
        balance: currentBalance + change,
        updated_at: new Date().toISOString(),
      })
      .eq('id', account.id);
  }
}

// ─── قيد تلقائي: بيع (فاتورة) ─────────────────────────────────────────────
export async function createSaleJournalEntry(params: {
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  totalAmount: number;
  costAmount: number;
  branchId: string;
  isFactory: boolean;
  createdBy?: string | null;
}) {
  // قيد البيع:
  // مدين: العملاء أو حسابات الفروع
  // دائن: المبيعات

  const customerAccountCode = params.isFactory ? ACCOUNT_CODES.CUSTOMERS : ACCOUNT_CODES.BRANCH_ACCOUNTS;
  const salesAccountCode = params.isFactory ? ACCOUNT_CODES.SALES : ACCOUNT_CODES.BRANCH_SALES;

  const lines = [
    {
      accountCode: customerAccountCode,
      accountName: params.isFactory ? 'العملاء' : 'حسابات الفروع',
      debit: params.totalAmount,
      credit: 0,
      lineDescription: `مدين - فاتورة بيع رقم ${params.invoiceNumber}`,
    },
    {
      accountCode: salesAccountCode,
      accountName: params.isFactory ? 'المبيعات' : 'مبيعات الفروع',
      debit: 0,
      credit: params.totalAmount,
      lineDescription: `دائن - فاتورة بيع رقم ${params.invoiceNumber}`,
    },
  ];

  // If there's cost, add cost of sales entry
  if (params.costAmount > 0) {
    lines.push(
      {
        accountCode: ACCOUNT_CODES.COST_OF_SALES,
        accountName: 'تكلفة المبيعات',
        debit: params.costAmount,
        credit: 0,
        lineDescription: `تكلفة بضاعة مباعة - فاتورة رقم ${params.invoiceNumber}`,
      },
      {
        accountCode: params.isFactory ? ACCOUNT_CODES.FACTORY_INVENTORY : ACCOUNT_CODES.BRANCH_INVENTORY,
        accountName: params.isFactory ? 'مخزون المصنع' : 'مخزون الفروع',
        debit: 0,
        credit: params.costAmount,
        lineDescription: `تخفيض المخزون - فاتورة رقم ${params.invoiceNumber}`,
      }
    );
  }

  return createAutoJournalEntry({
    entryDate: params.date,
    description: `فاتورة بيع رقم ${params.invoiceNumber}`,
    sourceType: 'sale',
    sourceId: params.invoiceId,
    lines,
    createdBy: params.createdBy,
  });
}

// ─── قيد تلقائي: قبض (دفعة من فرع) ──────────────────────────────────────
export async function createPaymentJournalEntry(params: {
  paymentId: string;
  paymentNumber: string;
  date: string;
  amount: number;
  paymentMethod: string;
  branchId: string;
  createdBy?: string | null;
}) {
  // قيد القبض:
  // مدين: الصندوق أو البنك (حسب طريقة الدفع)
  // دائن: حسابات الفروع

  const cashAccountCode = params.paymentMethod === 'bank_transfer'
    ? ACCOUNT_CODES.BANK
    : ACCOUNT_CODES.CASH;

  const cashAccountName = params.paymentMethod === 'bank_transfer'
    ? 'البنك'
    : 'الصندوق (كاش)';

  return createAutoJournalEntry({
    entryDate: params.date,
    description: `إيصال قبض رقم ${params.paymentNumber}`,
    sourceType: 'payment',
    sourceId: params.paymentId,
    lines: [
      {
        accountCode: cashAccountCode,
        accountName: cashAccountName,
        debit: params.amount,
        credit: 0,
        lineDescription: `مدين - قبض من فرع - إيصال رقم ${params.paymentNumber}`,
      },
      {
        accountCode: ACCOUNT_CODES.BRANCH_ACCOUNTS,
        accountName: 'حسابات الفروع',
        debit: 0,
        credit: params.amount,
        lineDescription: `دائن - سداد فرع - إيصال رقم ${params.paymentNumber}`,
      },
    ],
    createdBy: params.createdBy,
  });
}

// ─── قيد تلقائي: مرتجع ────────────────────────────────────────────────────
export async function createReturnJournalEntry(params: {
  returnId: string;
  returnNumber: string;
  date: string;
  totalAmount: number;
  invoiceNumber: string;
  createdBy?: string | null;
}) {
  // قيد المرتجع:
  // مدين: مبيعات مرتجعة (أو المبيعات)
  // دائن: العملاء أو حسابات الفروع

  return createAutoJournalEntry({
    entryDate: params.date,
    description: `مرتجع رقم ${params.returnNumber} - فاتورة أصلية ${params.invoiceNumber}`,
    sourceType: 'return',
    sourceId: params.returnId,
    lines: [
      {
        accountCode: ACCOUNT_CODES.SALES_RETURNS,
        accountName: 'مبيعات مرتجعة',
        debit: params.totalAmount,
        credit: 0,
        lineDescription: `مدين - مرتجع بيع رقم ${params.returnNumber}`,
      },
      {
        accountCode: ACCOUNT_CODES.BRANCH_ACCOUNTS,
        accountName: 'حسابات الفروع',
        debit: 0,
        credit: params.totalAmount,
        lineDescription: `دائن - مرتجع من فرع - مرتجع رقم ${params.returnNumber}`,
      },
    ],
    createdBy: params.createdBy,
  });
}

// ─── قيد تلقائي: مصروف ────────────────────────────────────────────────────
export async function createExpenseJournalEntry(params: {
  expenseId: string;
  expenseNumber: string;
  date: string;
  amount: number;
  description: string;
  categoryName: string;
  paymentMethod: string;
  createdBy?: string | null;
}) {
  // قيد المصروف:
  // مدين: المصروف (حسب التصنيف)
  // دائن: الصندوق أو البنك

  const cashAccountCode = params.paymentMethod === 'bank_transfer'
    ? ACCOUNT_CODES.BANK
    : ACCOUNT_CODES.CASH;

  const cashAccountName = params.paymentMethod === 'bank_transfer'
    ? 'البنك'
    : 'الصندوق (كاش)';

  // Try to find the expense category in chart of accounts, default to مصروفات تشغيلية
  const expenseAccountCode = ACCOUNT_CODES.COST_OF_SALES; // Default, will be refined

  return createAutoJournalEntry({
    entryDate: params.date,
    description: `مصروف: ${params.description} (${params.categoryName})`,
    sourceType: 'expense',
    sourceId: params.expenseId,
    lines: [
      {
        accountCode: expenseAccountCode,
        accountName: params.categoryName,
        debit: params.amount,
        credit: 0,
        lineDescription: params.description,
      },
      {
        accountCode: cashAccountCode,
        accountName: cashAccountName,
        debit: 0,
        credit: params.amount,
        lineDescription: `مقابل مصروف: ${params.description}`,
      },
    ],
    createdBy: params.createdBy,
  });
}

// ─── قيد تلقائي: تصبين (تحويل مخزون من المصنع للفرع) ─────────────────────
export async function createTasbeebJournalEntry(params: {
  transferId: string;
  transferNumber: string;
  date: string;
  totalAmount: number;
  createdBy?: string | null;
}) {
  // قيد التصبين:
  // مدين: حسابات الفروع (الفرع المدين)
  // دائن: مخزون المصنع

  return createAutoJournalEntry({
    entryDate: params.date,
    description: `قيد تصبين - تحويل رقم ${params.transferNumber}`,
    sourceType: 'inventory_transfer',
    sourceId: params.transferId,
    lines: [
      {
        accountCode: ACCOUNT_CODES.BRANCH_ACCOUNTS,
        accountName: 'حسابات الفروع',
        debit: params.totalAmount,
        credit: 0,
        lineDescription: `مدين - تصبين إلى فرع - تحويل رقم ${params.transferNumber}`,
      },
      {
        accountCode: ACCOUNT_CODES.FACTORY_INVENTORY,
        accountName: 'مخزون المصنع',
        debit: 0,
        credit: params.totalAmount,
        lineDescription: `دائن - تصبين من المصنع - تحويل رقم ${params.transferNumber}`,
      },
    ],
    createdBy: params.createdBy,
  });
}

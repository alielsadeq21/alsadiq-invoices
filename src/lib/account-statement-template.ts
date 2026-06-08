import { formatCurrency, formatDate, numberToArabicWords } from './utils';
import type { Settings } from './types';

/**
 * Account Statement Template Generator
 * Generates a professional, self-contained HTML document for printing and PDF export.
 * Optimized for B&W printing with high-contrast colors.
 */

export interface StatementTransaction {
  type: 'invoice' | 'return' | 'payment';
  number: string;
  date: string;
  debit: number;   // Amount owed (invoices)
  credit: number;  // Amount paid (returns + payments)
  notes: string;
}

export interface AccountStatementData {
  branchName: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  settings: Settings | null;
  transactions: StatementTransaction[];
  totalInvoiced: number;
  totalReturned: number;
  totalPaid: number;
  balance: number;
  dateFrom?: string;
  dateTo?: string;
  generatedAt: string;
}

function getStatementCSS(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&display=swap');

    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    body {
      font-family: 'Cairo', 'Noto Sans Arabic', sans-serif;
      color: #1a1a2e;
      background: #ffffff;
      direction: rtl;
      line-height: 1.6;
      margin: 0;
      padding: 0;
    }

    @page {
      size: A4;
      margin: 8mm;
    }

    .stmt-container {
      width: 100%;
      max-width: 210mm;
      margin: 0 auto;
      padding: 4mm 6mm;
      position: relative;
    }

    /* ===== HEADER ===== */
    .stmt-header {
      display: flex;
      align-items: stretch;
      border: 2.5px solid #0D7C66;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 14px;
    }

    .stmt-header-logo {
      background: #0D7C66;
      padding: 18px 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 110px;
    }

    .stmt-header-logo .logo-text {
      font-size: 56px;
      font-weight: 800;
      color: #D4A843;
      line-height: 1;
      user-select: none;
    }

    .stmt-header-logo img {
      width: 70px;
      height: 70px;
      object-fit: contain;
    }

    .stmt-header-info {
      flex: 1;
      padding: 12px 20px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .stmt-header-info h1 {
      font-size: 22px;
      font-weight: 700;
      color: #0D7C66;
      margin-bottom: 4px;
    }

    .stmt-header-info .contact-line {
      font-size: 11px;
      color: #555;
      line-height: 1.8;
    }

    .stmt-header-info .contact-line span {
      margin-left: 18px;
      white-space: nowrap;
    }

    .stmt-header-title {
      background: linear-gradient(135deg, #0D7C66, #0A5E4D);
      padding: 16px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 170px;
    }

    .stmt-header-title h2 {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 3px;
    }

    .stmt-header-title .stmt-period {
      font-size: 11px;
      color: #D4A843;
      font-weight: 600;
    }

    .stmt-header-title .stmt-date {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.85);
      margin-top: 3px;
    }

    /* ===== GOLD DIVIDER ===== */
    .gold-divider {
      height: 3px;
      background: linear-gradient(90deg, #0D7C66, #D4A843, #0D7C66);
      border-radius: 2px;
      margin-bottom: 14px;
    }

    /* ===== BRANCH INFO BOX ===== */
    .stmt-branch-info {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0;
      border: 1.5px solid #0D7C66;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 14px;
    }

    .stmt-branch-cell {
      padding: 10px 14px;
      border-left: 1px solid #e0e0e0;
    }

    .stmt-branch-cell:last-child {
      border-left: none;
    }

    .stmt-branch-cell .label {
      font-size: 10px;
      color: #888;
      font-weight: 600;
      margin-bottom: 3px;
    }

    .stmt-branch-cell .value {
      font-size: 13px;
      color: #1a1a2e;
      font-weight: 600;
    }

    /* ===== SUMMARY CARDS ===== */
    .stmt-summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }

    .stmt-summary-card {
      border: 1.5px solid #ddd;
      border-radius: 10px;
      padding: 12px 10px;
      text-align: center;
    }

    .stmt-summary-card .card-label {
      font-size: 10px;
      color: #888;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .stmt-summary-card .card-value {
      font-size: 15px;
      font-weight: 800;
    }

    .stmt-summary-card.card-invoiced .card-value {
      color: #0D7C66;
    }

    .stmt-summary-card.card-returned .card-value {
      color: #dc2626;
    }

    .stmt-summary-card.card-paid .card-value {
      color: #2563eb;
    }

    .stmt-summary-card.card-balance {
      border-color: #0D7C66;
      background: #0D7C66;
    }

    .stmt-summary-card.card-balance .card-label {
      color: rgba(255,255,255,0.85);
    }

    .stmt-summary-card.card-balance .card-value {
      color: #ffffff;
      font-size: 17px;
    }

    /* ===== TRANSACTIONS TABLE ===== */
    .stmt-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      border-radius: 10px;
      overflow: hidden;
      border: 1.5px solid #0D7C66;
    }

    .stmt-table thead tr {
      background: #0D7C66;
    }

    .stmt-table thead th {
      padding: 11px 10px;
      color: #ffffff;
      font-size: 11px;
      font-weight: 600;
      text-align: center;
      border-left: 1px solid rgba(255, 255, 255, 0.2);
    }

    .stmt-table thead th:last-child {
      border-left: none;
    }

    .stmt-table thead th.col-type { text-align: right; }
    .stmt-table thead th.col-number { text-align: center; }
    .stmt-table thead th.col-date { text-align: center; }
    .stmt-table thead th.col-debit { text-align: left; }
    .stmt-table thead th.col-credit { text-align: left; }
    .stmt-table thead th.col-balance { text-align: left; }

    .stmt-table tbody td {
      padding: 8px 10px;
      font-size: 11px;
      border-bottom: 1px solid #e5e5e5;
      border-left: 1px solid #e5e5e5;
      text-align: center;
    }

    .stmt-table tbody td:last-child {
      border-left: none;
    }

    .stmt-table tbody tr.even-row {
      background: #f7faf9;
    }

    .stmt-table tbody td.col-type {
      text-align: right;
      font-weight: 600;
    }

    .stmt-table tbody td.col-number {
      font-weight: 500;
      color: #555;
    }

    .stmt-table tbody td.col-date {
      color: #555;
      font-size: 10px;
    }

    .stmt-table tbody td.col-debit {
      text-align: left;
      font-weight: 700;
      color: #dc2626;
    }

    .stmt-table tbody td.col-credit {
      text-align: left;
      font-weight: 700;
      color: #0D7C66;
    }

    .stmt-table tbody td.col-balance {
      text-align: left;
      font-weight: 800;
      color: #1a1a2e;
    }

    /* Type badges */
    .type-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 700;
    }

    .type-badge.invoice {
      background: #e0f2e9;
      color: #0D7C66;
    }

    .type-badge.return {
      background: #fee2e2;
      color: #dc2626;
    }

    .type-badge.payment {
      background: #dbeafe;
      color: #2563eb;
    }

    /* ===== TOTALS ROW ===== */
    .stmt-table tfoot tr {
      background: #f0f0f0;
      border-top: 2px solid #0D7C66;
    }

    .stmt-table tfoot td {
      padding: 10px;
      font-size: 12px;
      font-weight: 700;
      border-bottom: none;
      border-left: 1px solid #ddd;
    }

    .stmt-table tfoot td:last-child {
      border-left: none;
    }

    /* ===== AMOUNT IN WORDS ===== */
    .stmt-amount-words {
      padding: 10px 14px;
      background: #f0faf7;
      border: 1px solid #b8e0d5;
      border-radius: 8px;
      margin-bottom: 14px;
      font-size: 12px;
    }

    .stmt-amount-words .amount-label {
      font-weight: 700;
      color: #0D7C66;
    }

    .stmt-amount-words .amount-text {
      color: #1a1a2e;
      font-weight: 500;
    }

    /* ===== SIGNATURES ===== */
    .stmt-signatures {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 16px;
      margin-top: 20px;
    }

    .sig-box {
      border: 1px solid #ccc;
      border-radius: 8px;
      padding: 10px;
      text-align: center;
    }

    .sig-box .sig-label {
      font-size: 11px;
      color: #0D7C66;
      font-weight: 700;
      margin-bottom: 30px;
    }

    .sig-box .sig-line {
      border-top: 1px dashed #999;
      padding-top: 6px;
      font-size: 10px;
      color: #888;
    }

    /* ===== FOOTER ===== */
    .stmt-footer {
      text-align: center;
      padding-top: 10px;
      border-top: 2px solid #0D7C66;
    }

    .stmt-footer .footer-text {
      font-size: 11px;
      color: #888;
    }

    .stmt-footer .footer-brand {
      font-size: 10px;
      color: #aaa;
      margin-top: 4px;
    }

    /* ===== NO TRANSACTIONS ===== */
    .stmt-empty {
      text-align: center;
      padding: 40px 20px;
      color: #888;
    }

    .stmt-empty .empty-icon {
      font-size: 40px;
      margin-bottom: 10px;
      opacity: 0.3;
    }

    /* ===== PRINT MEDIA — HIGH-CONTRAST B&W ===== */
    @media print {
      body {
        margin: 0;
        background: white !important;
      }
      .stmt-container {
        padding: 0;
        max-width: 100%;
      }

      /* B&W Overrides */
      .stmt-header {
        border-color: #000 !important;
        border-width: 3px !important;
      }
      .stmt-header-logo {
        background: #000 !important;
      }
      .stmt-header-logo .logo-text {
        color: #fff !important;
      }
      .stmt-header-logo img {
        filter: brightness(0) invert(1) !important;
      }
      .stmt-header-info h1 {
        color: #000 !important;
      }
      .stmt-header-title {
        background: #222 !important;
      }
      .stmt-header-title h2 {
        color: #fff !important;
      }
      .stmt-header-title .stmt-period {
        color: #ccc !important;
      }
      .stmt-header-title .stmt-date {
        color: #999 !important;
      }
      .gold-divider {
        background: #333 !important;
      }
      .stmt-branch-info {
        border-color: #333 !important;
      }
      .stmt-branch-cell {
        border-left-color: #ccc !important;
      }
      .stmt-branch-cell .label {
        color: #555 !important;
      }
      .stmt-branch-cell .value {
        color: #000 !important;
      }
      .stmt-summary-card {
        border-color: #666 !important;
      }
      .stmt-summary-card .card-label {
        color: #555 !important;
      }
      .stmt-summary-card .card-value {
        color: #000 !important;
      }
      .stmt-summary-card.card-invoiced .card-value {
        color: #000 !important;
      }
      .stmt-summary-card.card-returned .card-value {
        color: #000 !important;
      }
      .stmt-summary-card.card-paid .card-value {
        color: #000 !important;
      }
      .stmt-summary-card.card-balance {
        border-color: #000 !important;
        background: #000 !important;
      }
      .stmt-summary-card.card-balance .card-label {
        color: #ccc !important;
      }
      .stmt-summary-card.card-balance .card-value {
        color: #fff !important;
      }
      .stmt-table {
        border-color: #000 !important;
      }
      .stmt-table thead tr {
        background: #000 !important;
      }
      .stmt-table thead th {
        color: #fff !important;
        border-left-color: rgba(255,255,255,0.3) !important;
      }
      .stmt-table tbody td {
        border-bottom-color: #999 !important;
        border-left-color: #999 !important;
        color: #000 !important;
      }
      .stmt-table tbody tr.even-row {
        background: #f0f0f0 !important;
      }
      .stmt-table tbody td.col-type {
        color: #000 !important;
      }
      .stmt-table tbody td.col-number {
        color: #333 !important;
      }
      .stmt-table tbody td.col-date {
        color: #333 !important;
      }
      .stmt-table tbody td.col-debit {
        color: #000 !important;
        font-weight: 800 !important;
      }
      .stmt-table tbody td.col-credit {
        color: #000 !important;
        font-weight: 800 !important;
      }
      .stmt-table tbody td.col-balance {
        color: #000 !important;
        font-weight: 800 !important;
      }
      .type-badge {
        border: 1px solid #666 !important;
        background: #f0f0f0 !important;
        color: #000 !important;
      }
      .type-badge.invoice {
        background: #eee !important;
        color: #000 !important;
        border-color: #555 !important;
      }
      .type-badge.return {
        background: #e0e0e0 !important;
        color: #000 !important;
        border-color: #555 !important;
      }
      .type-badge.payment {
        background: #e8e8e8 !important;
        color: #000 !important;
        border-color: #555 !important;
      }
      .stmt-table tfoot tr {
        border-top-color: #000 !important;
        background: #e0e0e0 !important;
      }
      .stmt-table tfoot td {
        color: #000 !important;
        border-left-color: #999 !important;
      }
      .stmt-amount-words {
        background: #eee !important;
        border-color: #999 !important;
      }
      .stmt-amount-words .amount-label {
        color: #000 !important;
      }
      .stmt-amount-words .amount-text {
        color: #000 !important;
      }
      .stmt-signatures .sig-box {
        border-color: #666 !important;
      }
      .stmt-signatures .sig-label {
        color: #000 !important;
      }
      .stmt-signatures .sig-line {
        border-top-color: #666 !important;
        color: #333 !important;
      }
      .stmt-footer {
        border-top-color: #000 !important;
      }
      .stmt-footer .footer-text {
        color: #333 !important;
      }
      .stmt-footer .footer-brand {
        color: #666 !important;
      }
    }
  `;
}

export function generateAccountStatementDocument(data: AccountStatementData): string {
  const {
    branchName,
    branchAddress,
    branchPhone,
    settings,
    transactions,
    totalInvoiced,
    totalReturned,
    totalPaid,
    balance,
    dateFrom,
    dateTo,
    generatedAt,
  } = data;

  const factoryName = settings?.factory_name || 'مصنع الصادق';
  const factoryAddress = settings?.address || '';
  const factoryPhone = settings?.phone || '';
  const factoryEmail = settings?.email || '';
  const taxNumber = settings?.tax_number || '';
  const commercialRegister = settings?.commercial_register || '';

  const logoSection = settings?.logo_url
    ? `<img src="${settings.logo_url}" alt="شعار" style="width:70px;height:70px;object-fit:contain;" />`
    : `<span class="logo-text">ص</span>`;

  // Period label
  const periodLabel = dateFrom && dateTo
    ? `من ${formatDate(dateFrom)} إلى ${formatDate(dateTo)}`
    : dateTo
    ? `حتى ${formatDate(dateTo)}`
    : 'كشف حساب شامل';

  // Calculate running balance
  let runningBalance = 0;
  const rowsWithBalance = transactions.map((txn) => {
    runningBalance += txn.debit - txn.credit;
    return { ...txn, runningBalance };
  });

  // Type badge helper
  const typeBadge = (type: string, notes: string) => {
    const labels: Record<string, string> = {
      invoice: 'فاتورة',
      return: 'مرتجع',
      payment: 'دفعة',
    };
    return `<span class="type-badge ${type}">${labels[type] || notes}</span>`;
  };

  // Transaction rows
  const transactionRows = rowsWithBalance.length > 0
    ? rowsWithBalance.map((txn, index) => `
      <tr class="${index % 2 === 1 ? 'even-row' : ''}">
        <td class="col-type">${typeBadge(txn.type, txn.notes)}</td>
        <td class="col-number">${txn.number}</td>
        <td class="col-date">${formatDate(txn.date)}</td>
        <td class="col-debit">${txn.debit > 0 ? formatCurrency(txn.debit) : '—'}</td>
        <td class="col-credit">${txn.credit > 0 ? formatCurrency(txn.credit) : '—'}</td>
        <td class="col-balance">${formatCurrency(txn.runningBalance)}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="6" class="stmt-empty"><div class="empty-icon">📋</div><p>لا توجد حركات على هذا الحساب</p></td></tr>`;

  // Totals footer row
  const totalsFooter = rowsWithBalance.length > 0 ? `
    <tfoot>
      <tr>
        <td colspan="3" style="text-align: center; font-weight: 800;">الإجمالي</td>
        <td class="col-debit" style="text-align: left; font-weight: 800;">${formatCurrency(totalInvoiced)}</td>
        <td class="col-credit" style="text-align: left; font-weight: 800;">${formatCurrency(totalReturned + totalPaid)}</td>
        <td class="col-balance" style="text-align: left; font-weight: 800;">${formatCurrency(balance)}</td>
      </tr>
    </tfoot>
  ` : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>كشف حساب - ${branchName}</title>
  <style>${getStatementCSS()}</style>
</head>
<body>
  <div class="stmt-container">
    <!-- HEADER -->
    <div class="stmt-header">
      <div class="stmt-header-logo">
        ${logoSection}
      </div>
      <div class="stmt-header-info">
        <h1>${factoryName}</h1>
        <div class="contact-line">
          ${factoryAddress ? `<span>${factoryAddress}</span>` : ''}
          ${factoryPhone ? `<span>هاتف: ${factoryPhone}</span>` : ''}
          ${factoryEmail ? `<span>${factoryEmail}</span>` : ''}
        </div>
        <div class="contact-line">
          ${taxNumber ? `<span>الرقم الضريبي: ${taxNumber}</span>` : ''}
          ${commercialRegister ? `<span>السجل التجاري: ${commercialRegister}</span>` : ''}
        </div>
      </div>
      <div class="stmt-header-title">
        <h2>كشف حساب فرع</h2>
        <span class="stmt-period">${periodLabel}</span>
        <span class="stmt-date">تاريخ الإصدار: ${formatDate(generatedAt)}</span>
      </div>
    </div>

    <!-- GOLD DIVIDER -->
    <div class="gold-divider"></div>

    <!-- BRANCH INFO -->
    <div class="stmt-branch-info">
      <div class="stmt-branch-cell">
        <div class="label">اسم الفرع</div>
        <div class="value">${branchName}</div>
      </div>
      <div class="stmt-branch-cell">
        <div class="label">العنوان</div>
        <div class="value">${branchAddress || '—'}</div>
      </div>
      <div class="stmt-branch-cell">
        <div class="label">الهاتف</div>
        <div class="value">${branchPhone || '—'}</div>
      </div>
    </div>

    <!-- SUMMARY CARDS -->
    <div class="stmt-summary">
      <div class="stmt-summary-card card-invoiced">
        <div class="card-label">إجمالي الفواتير</div>
        <div class="card-value">${formatCurrency(totalInvoiced)}</div>
      </div>
      <div class="stmt-summary-card card-returned">
        <div class="card-label">إجمالي المرتجعات</div>
        <div class="card-value">${formatCurrency(totalReturned)}</div>
      </div>
      <div class="stmt-summary-card card-paid">
        <div class="card-label">إجمالي المدفوعات</div>
        <div class="card-value">${formatCurrency(totalPaid)}</div>
      </div>
      <div class="stmt-summary-card card-balance">
        <div class="card-label">الرصيد المتبقي</div>
        <div class="card-value">${formatCurrency(balance)}</div>
      </div>
    </div>

    <!-- TRANSACTIONS TABLE -->
    <table class="stmt-table">
      <thead>
        <tr>
          <th class="col-type">البيان</th>
          <th class="col-number">الرقم</th>
          <th class="col-date">التاريخ</th>
          <th class="col-debit">مدين (عليه)</th>
          <th class="col-credit">دائن (له)</th>
          <th class="col-balance">الرصيد</th>
        </tr>
      </thead>
      <tbody>
        ${transactionRows}
      </tbody>
      ${totalsFooter}
    </table>

    <!-- AMOUNT IN WORDS -->
    <div class="stmt-amount-words">
      <span class="amount-label">الرصيد المتبقي: </span>
      <span class="amount-text">${numberToArabicWords(Math.abs(balance))}${balance < 0 ? ' (دائن)' : balance > 0 ? ' (مدين)' : ''}</span>
    </div>

    <!-- SIGNATURES -->
    <div class="stmt-signatures">
      <div class="sig-box">
        <div class="sig-label">المحاسب</div>
        <div class="sig-line"></div>
      </div>
      <div class="sig-box">
        <div class="sig-label">مدير الفرع</div>
        <div class="sig-line"></div>
      </div>
      <div class="sig-box">
        <div class="sig-label">المراجع</div>
        <div class="sig-line"></div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="stmt-footer">
      <p class="footer-text">هذا الكشف صادر من ${factoryName} ويعتبر مستند رسمي للمراجعة</p>
      <p class="footer-brand">${factoryName} - نظام كشف الحسابات</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Extracts the body content and CSS from the generated document.
 * Used for the PDF approach where we inject into a hidden div.
 */
export function extractStatementParts(htmlDoc: string): { css: string; body: string } {
  const styleMatch = htmlDoc.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  const bodyMatch = htmlDoc.match(/<body[^>]*>([\s\S]*?)<\/body>/);

  return {
    css: styleMatch ? styleMatch[1] : '',
    body: bodyMatch ? bodyMatch[1] : '',
  };
}

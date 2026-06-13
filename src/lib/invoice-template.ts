import { formatCurrency, formatDate, numberToArabicWords, escapeHtml } from './utils';
import type { Invoice, InvoiceItem, Settings, Branch } from './types';

/**
 * Invoice Template Generator
 * Generates a complete, self-contained HTML document for printing and PDF export.
 * Uses pure CSS (no Tailwind dependency) so it works in any context.
 * 
 * Supports branch-specific data: each branch can have its own logo, address,
 * phone, tax number, commercial register, etc. that appear on invoices.
 */

interface InvoiceDocumentData {
  invoice: Invoice;
  items: InvoiceItem[];
  branchName: string;
  branch?: Branch | null;
  customerName?: string;
  settings: Settings | null;
  userFullName: string;
  showSignatures?: boolean;
}

function formatTime(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'م' : 'ص';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

/**
 * Checks if any item has unit_count > 1, meaning we should show the unit_count columns
 */
function hasUnitCount(items: InvoiceItem[]): boolean {
  return items.some(item => Number(item.unit_count) > 1);
}

/**
 * Resolves a value: branch-specific data takes priority over global settings.
 * This allows each branch to override global settings with its own details.
 */
function resolveBranchValue(
  branchValue: string | null | undefined,
  settingsValue: string | null | undefined,
  fallback: string = ''
): string {
  if (branchValue && branchValue.trim()) return branchValue.trim();
  if (settingsValue && settingsValue.trim()) return settingsValue.trim();
  return fallback;
}

function getInvoiceCSS(showUnitCount: boolean): string {
  const unitCountColWidth = showUnitCount ? '70px' : '0px';
  const totalPiecesColWidth = showUnitCount ? '90px' : '0px';

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

    .invoice-container {
      width: 100%;
      max-width: 210mm;
      margin: 0 auto;
      padding: 4mm 6mm;
      position: relative;
    }

    /* ===== HEADER ===== */
    .inv-header {
      display: flex;
      align-items: stretch;
      border: 2.5px solid #0D7C66;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 14px;
    }

    .inv-header-logo {
      background: #0D7C66;
      padding: 18px 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 110px;
    }

    .inv-header-logo .logo-text {
      font-size: 56px;
      font-weight: 800;
      color: #D4A843;
      line-height: 1;
      user-select: none;
    }

    .inv-header-logo img {
      width: 70px;
      height: 70px;
      object-fit: contain;
    }

    .inv-header-info {
      flex: 1;
      padding: 12px 20px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .inv-header-info h1 {
      font-size: 22px;
      font-weight: 700;
      color: #0D7C66;
      margin-bottom: 4px;
    }

    .inv-header-info .contact-line {
      font-size: 11px;
      color: #555;
      line-height: 1.8;
    }

    .inv-header-info .contact-line span {
      margin-left: 18px;
      white-space: nowrap;
    }

    .inv-header-title {
      background: linear-gradient(135deg, #0D7C66, #0A5E4D);
      padding: 16px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 170px;
    }

    .inv-header-title h2 {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 3px;
    }

    .inv-header-title .inv-num {
      font-size: 14px;
      color: #D4A843;
      font-weight: 600;
    }

    .inv-header-title .inv-date {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.85);
      margin-top: 3px;
    }

    /* ===== BRANCH INFO BAR ===== */
    .inv-branch-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
      background: linear-gradient(135deg, rgba(13,124,102,0.06), rgba(212,168,67,0.04));
      border: 1px solid rgba(13,124,102,0.15);
      border-radius: 8px;
      padding: 8px 16px;
      margin-bottom: 10px;
      font-size: 11px;
      color: #444;
    }

    .inv-branch-bar .branch-label {
      font-weight: 700;
      color: #0D7C66;
    }

    .inv-branch-bar .branch-sep {
      color: #ccc;
    }

    /* ===== GOLD DIVIDER ===== */
    .gold-divider {
      height: 3px;
      background: linear-gradient(90deg, #0D7C66, #D4A843, #0D7C66);
      border-radius: 2px;
      margin-bottom: 14px;
    }

    /* ===== INVOICE INFO GRID ===== */
    .inv-info-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0;
      border: 1px solid #ddd;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 14px;
    }

    .inv-info-cell {
      padding: 10px 14px;
      border-left: 1px solid #e5e5e5;
    }

    .inv-info-cell:last-child {
      border-left: none;
    }

    .inv-info-cell .label {
      font-size: 10px;
      color: #888;
      font-weight: 600;
      margin-bottom: 3px;
    }

    .inv-info-cell .value {
      font-size: 13px;
      color: #1a1a2e;
      font-weight: 600;
    }

    /* ===== ITEMS TABLE ===== */
    .inv-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      border-radius: 10px;
      overflow: hidden;
      border: 1.5px solid #0D7C66;
    }

    .inv-table thead tr {
      background: #0D7C66;
    }

    .inv-table thead th {
      padding: 11px 10px;
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      text-align: right;
      border-left: 1px solid rgba(255, 255, 255, 0.2);
    }

    .inv-table thead th:last-child {
      border-left: none;
    }

    .inv-table thead th.col-num {
      width: 40px;
      text-align: center;
    }

    .inv-table thead th.col-name {
      text-align: right;
    }

    .inv-table thead th.col-qty {
      width: 80px;
      text-align: center;
    }

    .inv-table thead th.col-unit-count {
      width: ${unitCountColWidth};
      text-align: center;
      ${showUnitCount ? '' : 'display:none;'}
    }

    .inv-table thead th.col-total-pieces {
      width: ${totalPiecesColWidth};
      text-align: center;
      ${showUnitCount ? '' : 'display:none;'}
    }

    .inv-table thead th.col-price {
      width: 120px;
      text-align: center;
    }

    .inv-table thead th.col-total {
      width: 120px;
      text-align: left;
    }

    .inv-table tbody td {
      padding: 10px 10px;
      font-size: 12px;
      border-bottom: 1px solid #e5e5e5;
      border-left: 1px solid #e5e5e5;
    }

    .inv-table tbody td:last-child {
      border-left: none;
    }

    .inv-table tbody tr.even-row {
      background: #f7faf9;
    }

    .inv-table tbody td.col-num {
      text-align: center;
      color: #888;
    }

    .inv-table tbody td.col-name {
      font-weight: 500;
      color: #1a1a2e;
    }

    .inv-table tbody td.col-qty {
      text-align: center;
    }

    .inv-table tbody td.col-unit-count {
      text-align: center;
      color: #0D7C66;
      font-weight: 600;
      ${showUnitCount ? '' : 'display:none;'}
    }

    .inv-table tbody td.col-total-pieces {
      text-align: center;
      font-weight: 700;
      color: #0D7C66;
      ${showUnitCount ? '' : 'display:none;'}
    }

    .inv-table tbody td.col-price {
      text-align: center;
    }

    .inv-table tbody td.col-total {
      text-align: left;
      font-weight: 700;
      color: #0D7C66;
    }

    /* ===== TOTALS ===== */
    .inv-totals-row {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 14px;
    }

    .inv-totals-box {
      width: 290px;
      border: 1px solid #ddd;
      border-radius: 10px;
      overflow: hidden;
    }

    .inv-totals-box .total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 14px;
      font-size: 12px;
      border-bottom: 1px solid #eee;
    }

    .inv-totals-box .total-row:last-child {
      border-bottom: none;
    }

    .inv-totals-box .total-row .total-label {
      color: #666;
    }

    .inv-totals-box .total-row .total-value {
      font-weight: 600;
      color: #1a1a2e;
    }

    .inv-totals-box .grand-total {
      background: #0D7C66;
      padding: 12px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .inv-totals-box .grand-total .total-label {
      color: #ffffff;
      font-size: 14px;
      font-weight: 700;
    }

    .inv-totals-box .grand-total .total-value {
      color: #ffffff;
      font-size: 16px;
      font-weight: 800;
    }

    /* ===== NOTES ===== */
    .inv-notes {
      padding: 10px 14px;
      background: #FFF9E6;
      border: 1px solid #F0D060;
      border-radius: 8px;
      margin-bottom: 14px;
      font-size: 12px;
    }

    .inv-notes .notes-label {
      font-weight: 700;
      color: #8B7020;
    }

    .inv-notes .notes-text {
      color: #6B5510;
      margin-top: 2px;
    }

    /* ===== CANCEL ===== */
    .inv-cancel {
      padding: 10px 14px;
      background: #FFF0F0;
      border: 1px solid #E8A0A0;
      border-radius: 8px;
      margin-bottom: 14px;
      font-size: 12px;
    }

    .inv-cancel .cancel-label {
      font-weight: 700;
      color: #8B2020;
    }

    .inv-cancel .cancel-text {
      color: #6B1010;
      margin-top: 2px;
    }

    /* ===== AMOUNT IN WORDS ===== */
    .inv-amount-words {
      padding: 10px 14px;
      background: #f0faf7;
      border: 1px solid #b8e0d5;
      border-radius: 8px;
      margin-bottom: 14px;
      font-size: 12px;
    }

    .inv-amount-words .amount-label {
      font-weight: 700;
      color: #0D7C66;
    }

    .inv-amount-words .amount-text {
      color: #1a1a2e;
      font-weight: 500;
    }

    /* ===== SIGNATURES ===== */
    .inv-signatures {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 16px;
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
    .inv-footer {
      text-align: center;
      padding-top: 10px;
      border-top: 2px solid #0D7C66;
    }

    .inv-footer .footer-text {
      font-size: 11px;
      color: #888;
    }

    .inv-footer .footer-brand {
      font-size: 10px;
      color: #aaa;
      margin-top: 4px;
    }

    /* ===== BRANCH REG INFO ===== */
    .inv-reg-info {
      display: flex;
      justify-content: center;
      gap: 24px;
      margin-top: 6px;
      font-size: 10px;
      color: #999;
    }

    .inv-reg-info span {
      white-space: nowrap;
    }

    /* ===== WATERMARK ===== */
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 80px;
      font-weight: 800;
      color: rgba(220, 50, 50, 0.08);
      pointer-events: none;
      z-index: 0;
    }

    .watermark.cancelled {
      color: rgba(220, 50, 50, 0.12);
    }

    /* ===== ITEMS COUNT ===== */
    .items-count {
      text-align: left;
      font-size: 11px;
      color: #888;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
    }

    .items-count .total-pieces {
      color: #0D7C66;
      font-weight: 600;
    }

    /* ===== PRINT MEDIA ===== */
    @media print {
      body {
        margin: 0;
        background: white !important;
      }
      .invoice-container {
        padding: 0;
        max-width: 100%;
      }

      /* ===== HIGH-CONTRAST B&W OVERRIDES ===== */
      .inv-header {
        border-color: #000 !important;
        border-width: 3px !important;
      }
      .inv-header-logo {
        background: #000 !important;
      }
      .inv-header-logo .logo-text {
        color: #fff !important;
      }
      .inv-header-logo img {
        filter: brightness(0) invert(1) !important;
      }
      .inv-header-info h1 {
        color: #000 !important;
      }
      .inv-header-title {
        background: #222 !important;
      }
      .inv-header-title h2 {
        color: #fff !important;
      }
      .inv-header-title .inv-num {
        color: #ccc !important;
      }
      .inv-header-title .inv-date {
        color: #999 !important;
      }
      .inv-branch-bar {
        background: #f5f5f5 !important;
        border-color: #999 !important;
      }
      .inv-branch-bar .branch-label {
        color: #000 !important;
      }
      .gold-divider {
        background: #333 !important;
      }
      .inv-info-grid {
        border-color: #333 !important;
      }
      .inv-info-cell {
        border-left-color: #ccc !important;
      }
      .inv-info-cell .label {
        color: #555 !important;
      }
      .inv-info-cell .value {
        color: #000 !important;
      }
      .inv-table {
        border-color: #000 !important;
      }
      .inv-table thead tr {
        background: #000 !important;
      }
      .inv-table thead th {
        color: #fff !important;
        border-left-color: rgba(255,255,255,0.3) !important;
      }
      .inv-table tbody td {
        border-bottom-color: #999 !important;
        border-left-color: #999 !important;
        color: #000 !important;
      }
      .inv-table tbody tr.even-row {
        background: #f0f0f0 !important;
      }
      .inv-table tbody td.col-unit-count,
      .inv-table tbody td.col-total-pieces {
        color: #000 !important;
        font-weight: 700 !important;
      }
      .inv-table tbody td.col-total {
        color: #000 !important;
        font-weight: 800 !important;
      }
      .inv-totals-box {
        border-color: #333 !important;
      }
      .inv-totals-box .total-row {
        border-bottom-color: #ccc !important;
      }
      .inv-totals-box .total-row .total-label {
        color: #333 !important;
      }
      .inv-totals-box .total-row .total-value {
        color: #000 !important;
      }
      .inv-totals-box .grand-total {
        background: #000 !important;
      }
      .inv-totals-box .grand-total .total-label,
      .inv-totals-box .grand-total .total-value {
        color: #fff !important;
      }
      .inv-amount-words {
        background: #eee !important;
        border-color: #999 !important;
      }
      .inv-amount-words .amount-label {
        color: #000 !important;
      }
      .inv-amount-words .amount-text {
        color: #000 !important;
      }
      .inv-notes {
        background: #f5f5f5 !important;
        border-color: #999 !important;
      }
      .inv-notes .notes-label {
        color: #333 !important;
      }
      .inv-notes .notes-text {
        color: #000 !important;
      }
      .inv-cancel {
        background: #f0f0f0 !important;
        border-color: #999 !important;
      }
      .inv-cancel .cancel-label {
        color: #000 !important;
      }
      .inv-cancel .cancel-text {
        color: #333 !important;
      }
      .inv-signatures .sig-box {
        border-color: #666 !important;
      }
      .inv-signatures .sig-label {
        color: #000 !important;
      }
      .inv-signatures .sig-line {
        border-top-color: #666 !important;
        color: #333 !important;
      }
      .inv-footer {
        border-top-color: #000 !important;
      }
      .inv-footer .footer-text {
        color: #333 !important;
      }
      .inv-footer .footer-brand {
        color: #666 !important;
      }
      .inv-reg-info {
        color: #555 !important;
      }
      .watermark.cancelled {
        color: rgba(0,0,0,0.12) !important;
      }
      .items-count {
        color: #333 !important;
      }
      .items-count .total-pieces {
        color: #000 !important;
      }
    }
  `;
}

export function generateInvoiceDocument(data: InvoiceDocumentData): string {
  const { invoice, items, branchName, branch, customerName, settings, userFullName, showSignatures = false } = data;

  const invoiceTime = formatTime(invoice.invoice_time);

  // Resolve values: branch-specific data takes priority over global settings
  const factoryName = resolveBranchValue(
    branch?.name,
    settings?.factory_name,
    'مصنع الصادق'
  );
  const factoryAddress = resolveBranchValue(branch?.address, settings?.address);
  const factoryPhone = resolveBranchValue(branch?.phone, settings?.phone);
  const factoryEmail = resolveBranchValue(branch?.email, settings?.email);
  const taxNumber = resolveBranchValue(branch?.tax_number, settings?.tax_number);
  const commercialRegister = resolveBranchValue(branch?.commercial_register, settings?.commercial_register);
  const logoUrl = resolveBranchValue(branch?.logo_url, settings?.logo_url);
  const invoiceFooter = resolveBranchValue(branch?.invoice_footer, settings?.invoice_footer, 'شكراً لتعاملكم معنا');

  const showUnitCount = hasUnitCount(items);

  const logoSection = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="شعار" style="width:70px;height:70px;object-fit:contain;" />`
    : `<span class="logo-text">ص</span>`;

  const isCancelled = invoice.status === 'cancelled';
  const watermarkHtml = isCancelled
    ? '<div class="watermark cancelled">ملغاة</div>'
    : '';

  const notesHtml = invoice.notes
    ? `<div class="inv-notes"><span class="notes-label">ملاحظات: </span><span class="notes-text">${escapeHtml(invoice.notes)}</span></div>`
    : '';

  const cancelHtml = invoice.cancel_reason
    ? `<div class="inv-cancel"><span class="cancel-label">سبب الإلغاء: </span><span class="cancel-text">${escapeHtml(invoice.cancel_reason)}</span></div>`
    : '';

  const taxRow = invoice.tax_rate > 0
    ? `<div class="total-row"><span class="total-label">الضريبة (${invoice.tax_rate}%)</span><span class="total-value">${formatCurrency(invoice.tax_amount)}</span></div>`
    : '';

  // Calculate total pieces
  const totalPieces = items.reduce((sum, item) => sum + (Number(item.quantity) * (Number(item.unit_count) || 1)), 0);

  const itemsRows = items.map((item, index) => {
    const unitCount = Number(item.unit_count) || 1;
    const itemTotalPieces = Number(item.quantity) * unitCount;
    return `
      <tr class="${index % 2 === 1 ? 'even-row' : ''}">
        <td class="col-num">${index + 1}</td>
        <td class="col-name">${escapeHtml(item.item_name)}</td>
        <td class="col-qty">${Number(item.quantity).toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
        <td class="col-unit-count">${unitCount > 1 ? unitCount.toLocaleString('ar-EG') : '—'}</td>
        <td class="col-total-pieces">${unitCount > 1 ? itemTotalPieces.toLocaleString('ar-EG') : '—'}</td>
        <td class="col-price">${formatCurrency(Number(item.unit_price))}</td>
        <td class="col-total">${formatCurrency(Number(item.total_price))}</td>
      </tr>`;
  }).join('');

  // Build branch info bar (shows branch-specific contact details)
  const branchBarParts: string[] = [];
  if (factoryAddress) branchBarParts.push(escapeHtml(factoryAddress));
  if (factoryPhone) branchBarParts.push(`هاتف: ${escapeHtml(factoryPhone)}`);
  if (factoryEmail) branchBarParts.push(escapeHtml(factoryEmail));
  const branchBarHtml = branchBarParts.length > 0
    ? `<div class="inv-branch-bar">
        <span class="branch-label">فرع ${escapeHtml(branchName)}</span>
        ${branchBarParts.map(p => `<span class="branch-sep">|</span><span>${p}</span>`).join('')}
      </div>`
    : '';

  // Registration info line at the bottom
  const regInfoParts: string[] = [];
  if (taxNumber) regInfoParts.push(`الرقم الضريبي: ${escapeHtml(taxNumber)}`);
  if (commercialRegister) regInfoParts.push(`السجل التجاري: ${escapeHtml(commercialRegister)}`);
  const regInfoHtml = regInfoParts.length > 0
    ? `<div class="inv-reg-info">${regInfoParts.map(p => `<span>${p}</span>`).join('')}</div>`
    : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>فاتورة مبيعات - ${escapeHtml(invoice.invoice_number)}</title>
  <style>${getInvoiceCSS(showUnitCount)}</style>
</head>
<body>
  ${watermarkHtml}
  <div class="invoice-container">
    <!-- HEADER -->
    <div class="inv-header">
      <div class="inv-header-logo">
        ${logoSection}
      </div>
      <div class="inv-header-info">
        <h1>${escapeHtml(factoryName)}</h1>
        <div class="contact-line">
          ${factoryAddress ? `<span>${escapeHtml(factoryAddress)}</span>` : ''}
          ${factoryPhone ? `<span>هاتف: ${escapeHtml(factoryPhone)}</span>` : ''}
          ${factoryEmail ? `<span>${escapeHtml(factoryEmail)}</span>` : ''}
        </div>
        <div class="contact-line">
          ${taxNumber ? `<span>الرقم الضريبي: ${escapeHtml(taxNumber)}</span>` : ''}
          ${commercialRegister ? `<span>السجل التجاري: ${escapeHtml(commercialRegister)}</span>` : ''}
        </div>
      </div>
      <div class="inv-header-title">
        <h2>فاتورة مبيعات</h2>
        <span class="inv-num">${escapeHtml(invoice.invoice_number)}</span>
        <span class="inv-date">${formatDate(invoice.invoice_date)}${invoiceTime ? ` - ${invoiceTime}` : ''}</span>
      </div>
    </div>

    <!-- BRANCH INFO BAR -->
    ${branchBarHtml}

    <!-- GOLD DIVIDER -->
    <div class="gold-divider"></div>

    <!-- INVOICE INFO -->
    <div class="inv-info-grid" style="grid-template-columns: repeat(4, 1fr);">
      <div class="inv-info-cell">
        <div class="label">الفرع</div>
        <div class="value">${escapeHtml(branchName)}</div>
      </div>
      <div class="inv-info-cell">
        <div class="label">العميل</div>
        <div class="value">${escapeHtml(customerName) || '—'}</div>
      </div>
      <div class="inv-info-cell">
        <div class="label">المستلم</div>
        <div class="value">${escapeHtml(invoice.receiver_name) || '—'}</div>
      </div>
      <div class="inv-info-cell">
        <div class="label">السائق</div>
        <div class="value">${escapeHtml(invoice.driver_name) || '—'}${invoice.driver_phone ? ` <span style="color:#999;font-size:11px;">(${escapeHtml(invoice.driver_phone)})</span>` : ''}</div>
      </div>
    </div>

    <!-- ITEMS TABLE -->
    <table class="inv-table">
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th class="col-name">الصنف</th>
          <th class="col-qty">الكمية</th>
          <th class="col-unit-count">عدد/وحدة</th>
          <th class="col-total-pieces">إجمالي القطع</th>
          <th class="col-price">سعر الوحدة</th>
          <th class="col-total">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <!-- ITEMS COUNT -->
    <div class="items-count">
      <span>عدد الأصناف: ${items.length}</span>
      ${showUnitCount ? `<span class="total-pieces">إجمالي القطع: ${totalPieces.toLocaleString('ar-EG')}</span>` : ''}
    </div>

    <!-- TOTALS -->
    <div class="inv-totals-row">
      <div class="inv-totals-box">
        <div class="total-row">
          <span class="total-label">المجموع الفرعي</span>
          <span class="total-value">${formatCurrency(invoice.subtotal)}</span>
        </div>
        ${taxRow}
        <div class="grand-total">
          <span class="total-label">الإجمالي النهائي</span>
          <span class="total-value">${formatCurrency(invoice.total)}</span>
        </div>
      </div>
    </div>

    <!-- NOTES -->
    ${notesHtml}

    <!-- CANCEL REASON -->
    ${cancelHtml}

    <!-- AMOUNT IN WORDS -->
    <div class="inv-amount-words">
      <span class="amount-label">المبلغ: </span>
      <span class="amount-text">${numberToArabicWords(Number(invoice.total))}</span>
    </div>

    ${showSignatures ? `<!-- SIGNATURES -->
    <div class="inv-signatures">
      <div class="sig-box">
        <div class="sig-label">المحاسب</div>
        <div class="sig-line">${escapeHtml(userFullName)}</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">المستلم</div>
        <div class="sig-line">${escapeHtml(invoice.receiver_name) || ''}</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">السائق</div>
        <div class="sig-line">${escapeHtml(invoice.driver_name) || ''}</div>
      </div>
    </div>` : ''}

    <!-- FOOTER -->
    <div class="inv-footer">
      <p class="footer-text">${escapeHtml(invoiceFooter)}</p>
      <p class="footer-brand">${escapeHtml(factoryName)} - نظام علي الصادق</p>
      ${regInfoHtml}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Extracts the body content and CSS from the generated document.
 * Used for the PDF approach where we inject into a hidden div.
 */
export function extractInvoiceParts(htmlDoc: string): { css: string; body: string } {
  const styleMatch = htmlDoc.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  const bodyMatch = htmlDoc.match(/<body[^>]*>([\s\S]*?)<\/body>/);

  return {
    css: styleMatch ? styleMatch[1] : '',
    body: bodyMatch ? bodyMatch[1] : '',
  };
}

/**
 * Generates a professional thermal receipt HTML document for 80mm thermal printers.
 * Features: brand header with branch data, items table, decorative separators, signatures.
 * Supports branch-specific data (logo, address, phone, tax number, etc.)
 */
export function generateThermalDocument(data: InvoiceDocumentData): string {
  const { invoice, items, branchName, branch, customerName, settings, userFullName, showSignatures = false } = data;

  const invoiceTime = formatTime(invoice.invoice_time);

  // Resolve values: branch-specific data takes priority over global settings
  const factoryName = resolveBranchValue(
    branch?.name,
    settings?.factory_name,
    'مصنع الصادق'
  );
  const factoryPhone = resolveBranchValue(branch?.phone, settings?.phone);
  const factoryAddress = resolveBranchValue(branch?.address, settings?.address);
  const factoryEmail = resolveBranchValue(branch?.email, settings?.email);
  const taxNumber = resolveBranchValue(branch?.tax_number, settings?.tax_number);
  const commercialRegister = resolveBranchValue(branch?.commercial_register, settings?.commercial_register);
  const logoUrl = resolveBranchValue(branch?.logo_url, settings?.logo_url);
  const invoiceFooter = resolveBranchValue(branch?.invoice_footer, settings?.invoice_footer, 'شكراً لتعاملكم معنا');

  const showUnitCount = hasUnitCount(items);

  const logoSection = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="شعار" style="width:38px;height:38px;object-fit:contain;" />`
    : `<span class="r-logo-text">ص</span>`;

  const totalPieces = items.reduce((sum, item) => sum + (Number(item.quantity) * (Number(item.unit_count) || 1)), 0);
  const isCancelled = invoice.status === 'cancelled';

  // Items table rows
  const itemsRows = items.map((item, index) => {
    const unitCount = Number(item.unit_count) || 1;
    const itemTotalPieces = Number(item.quantity) * unitCount;
    const hasUnitInfo = showUnitCount && unitCount > 1;
    return `
      <tr class="${index % 2 === 1 ? 'r-row-alt' : ''}">
        <td class="r-col-num">${index + 1}</td>
        <td class="r-col-name">${escapeHtml(item.item_name)}</td>
        <td class="r-col-qty">${Number(item.quantity).toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
        ${hasUnitInfo ? `<td class="r-col-uc">${unitCount}</td>` : ''}
        <td class="r-col-price">${formatCurrency(Number(item.unit_price))}</td>
        <td class="r-col-total">${formatCurrency(Number(item.total_price))}</td>
      </tr>
      ${hasUnitInfo ? `<tr class="${index % 2 === 1 ? 'r-row-alt' : ''}"><td></td><td colspan="5" class="r-sub-row">إجمالي القطع: ${itemTotalPieces.toLocaleString('ar-EG')}</td></tr>` : ''}`;
  }).join('');

  const taxRow = invoice.tax_rate > 0
    ? `<div class="r-total-row"><span class="r-total-label">الضريبة (${invoice.tax_rate}%)</span><span class="r-total-val">${formatCurrency(invoice.tax_amount)}</span></div>`
    : '';

  // Cancelled watermark
  const watermarkHtml = isCancelled
    ? '<div class="r-watermark">ملغاة</div>'
    : '';

  // Notes
  const notesHtml = invoice.notes
    ? `<div class="r-notes"><strong>ملاحظات:</strong> ${escapeHtml(invoice.notes)}</div>`
    : '';

  // Cancel reason
  const cancelHtml = invoice.cancel_reason
    ? `<div class="r-cancel"><strong>سبب الإلغاء:</strong> ${escapeHtml(invoice.cancel_reason)}</div>`
    : '';

  // Build branch info lines for thermal receipt
  const branchInfoLines: string[] = [];
  if (factoryAddress) branchInfoLines.push(escapeHtml(factoryAddress));
  if (factoryPhone) branchInfoLines.push(`هاتف: ${escapeHtml(factoryPhone)}`);
  if (factoryEmail) branchInfoLines.push(escapeHtml(factoryEmail));
  const branchInfoHtml = branchInfoLines.length > 0
    ? `<div class="r-brand-info">${branchInfoLines.join(' &bull; ')}</div>`
    : '';

  // Tax/registration info line
  const regInfoParts: string[] = [];
  if (taxNumber) regInfoParts.push(`ض: ${escapeHtml(taxNumber)}`);
  if (commercialRegister) regInfoParts.push(`سجل: ${escapeHtml(commercialRegister)}`);
  const regInfoHtml = regInfoParts.length > 0
    ? `<div class="r-brand-info">${regInfoParts.join(' &bull; ')}</div>`
    : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>فاتورة حرارية - ${escapeHtml(invoice.invoice_number)}</title>
  <style>
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
      color: #000;
      background: #fff;
      direction: rtl;
      line-height: 1.4;
      margin: 0;
      padding: 0;
      font-size: 10px;
    }

    @page {
      size: 80mm auto;
      margin: 0;
    }

    .r-container {
      width: 80mm;
      margin: 0 auto;
      padding: 0;
    }

    /* ===== TOP BRAND BAR ===== */
    .r-brand-bar {
      background: #0D7C66;
      padding: 4mm 3mm 3mm 3mm;
      text-align: center;
      position: relative;
    }

    .r-brand-bar::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: #D4A843;
    }

    .r-brand-logo {
      display: inline-block;
      vertical-align: middle;
    }

    .r-logo-text {
      font-size: 28px;
      font-weight: 800;
      color: #D4A843;
      line-height: 1;
    }

    .r-brand-bar img {
      width: 32px;
      height: 32px;
      object-fit: contain;
      vertical-align: middle;
    }

    .r-brand-name {
      font-size: 13px;
      font-weight: 800;
      color: #fff;
      margin-top: 2px;
    }

    .r-brand-info {
      font-size: 7.5px;
      color: rgba(255,255,255,0.8);
      line-height: 1.5;
      margin-top: 1px;
    }

    /* ===== BRANCH NAME BADGE ===== */
    .r-branch-badge {
      background: rgba(212,168,67,0.15);
      border: 1px solid rgba(212,168,67,0.4);
      border-top: none;
      text-align: center;
      padding: 1.5mm 0;
      font-size: 8px;
      color: #0D7C66;
      font-weight: 700;
    }

    /* ===== INVOICE TITLE BOX ===== */
    .r-title-box {
      border: 2px solid #0D7C66;
      border-top: none;
      text-align: center;
      padding: 2mm 0;
      background: linear-gradient(to left, rgba(13,124,102,0.05), rgba(212,168,67,0.05), rgba(13,124,102,0.05));
    }

    .r-title-text {
      font-size: 13px;
      font-weight: 800;
      color: #0D7C66;
      letter-spacing: 1px;
    }

    /* ===== DECORATIVE SEPARATORS ===== */
    .r-sep-double {
      border: none;
      border-top: 2px double #0D7C66;
      margin: 2mm 3mm;
    }

    .r-sep-dashed {
      border: none;
      border-top: 1px dashed #999;
      margin: 2mm 3mm;
    }

    .r-sep-star {
      text-align: center;
      color: #0D7C66;
      font-size: 9px;
      margin: 2mm 3mm;
      line-height: 1;
      position: relative;
    }

    .r-sep-star::before,
    .r-sep-star::after {
      content: '';
      position: absolute;
      top: 50%;
      width: calc(50% - 12px);
      border-top: 1px solid #0D7C66;
    }

    .r-sep-star::before { right: 0; }
    .r-sep-star::after { left: 0; }

    .r-sep-thick {
      border: none;
      border-top: 2.5px solid #000;
      margin: 2mm 3mm;
    }

    /* ===== INVOICE INFO TABLE ===== */
    .r-info-table {
      width: calc(100% - 6mm);
      margin: 0 3mm;
      border-collapse: collapse;
      font-size: 9px;
    }

    .r-info-table tr {
      border-bottom: 1px dotted #ccc;
    }

    .r-info-table tr:last-child {
      border-bottom: none;
    }

    .r-info-table td {
      padding: 1.5px 0;
      vertical-align: top;
    }

    .r-info-label {
      font-weight: 700;
      color: #0D7C66;
      width: 28%;
      white-space: nowrap;
    }

    .r-info-value {
      color: #000;
      font-weight: 600;
    }

    /* ===== ITEMS TABLE ===== */
    .r-items-table {
      width: calc(100% - 6mm);
      margin: 0 3mm;
      border-collapse: collapse;
      font-size: 9px;
      border-top: 1.5px solid #0D7C66;
      border-bottom: 1.5px solid #0D7C66;
    }

    .r-items-table thead tr {
      background: #0D7C66;
    }

    .r-items-table thead th {
      padding: 3px 2px;
      color: #fff;
      font-size: 8px;
      font-weight: 700;
      text-align: center;
      border-left: 1px solid rgba(255,255,255,0.2);
    }

    .r-items-table thead th:last-child {
      border-left: none;
    }

    .r-items-table thead th.r-th-name {
      text-align: right;
    }

    .r-items-table tbody td {
      padding: 2.5px 2px;
      border-bottom: 1px dotted #ddd;
    }

    .r-items-table tbody tr:last-child td {
      border-bottom: none;
    }

    .r-row-alt {
      background: #f5f9f8;
    }

    .r-col-num {
      text-align: center;
      color: #888;
      width: 8%;
    }

    .r-col-name {
      text-align: right;
      font-weight: 600;
      width: 28%;
    }

    .r-col-qty {
      text-align: center;
      width: 14%;
    }

    .r-col-uc {
      text-align: center;
      color: #0D7C66;
      font-weight: 600;
      width: 10%;
    }

    .r-col-price {
      text-align: center;
      width: 18%;
    }

    .r-col-total {
      text-align: left;
      font-weight: 700;
      color: #0D7C66;
      width: 22%;
    }

    .r-sub-row {
      font-size: 7.5px;
      color: #0D7C66;
      font-weight: 600;
      padding: 0 2px !important;
      border-bottom: 1px dotted #ddd !important;
    }

    /* ===== ITEMS COUNT ===== */
    .r-items-count {
      width: calc(100% - 6mm);
      margin: 1mm 3mm 0;
      display: flex;
      justify-content: space-between;
      font-size: 8px;
      color: #888;
    }

    .r-items-count .r-pieces-count {
      color: #0D7C66;
      font-weight: 700;
    }

    /* ===== TOTALS SECTION ===== */
    .r-totals {
      width: calc(100% - 6mm);
      margin: 0 3mm;
    }

    .r-total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 2px 0;
      font-size: 10px;
    }

    .r-total-label {
      color: #555;
    }

    .r-total-val {
      font-weight: 600;
    }

    /* ===== GRAND TOTAL BOX ===== */
    .r-grand-total-box {
      border: 2px solid #000;
      padding: 3mm;
      margin: 2mm 3mm;
      text-align: center;
      background: #0D7C66;
      position: relative;
    }

    .r-grand-total-box::before {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      right: 2px;
      bottom: 2px;
      border: 1px solid #D4A843;
    }

    .r-grand-label {
      font-size: 11px;
      font-weight: 700;
      color: #fff;
      display: block;
    }

    .r-grand-value {
      font-size: 18px;
      font-weight: 800;
      color: #D4A843;
      display: block;
      margin-top: 1px;
    }

    /* ===== AMOUNT IN WORDS ===== */
    .r-amount-words {
      width: calc(100% - 6mm);
      margin: 2mm 3mm;
      padding: 2mm;
      background: #f0faf7;
      border: 1px solid #b8e0d5;
      border-radius: 2px;
      font-size: 8px;
      color: #0D7C66;
      font-weight: 600;
      text-align: center;
    }

    /* ===== NOTES ===== */
    .r-notes {
      width: calc(100% - 6mm);
      margin: 2mm 3mm;
      padding: 2mm;
      background: #FFF9E6;
      border: 1px solid #E8D060;
      border-radius: 2px;
      font-size: 8px;
      color: #6B5510;
    }

    .r-cancel {
      width: calc(100% - 6mm);
      margin: 2mm 3mm;
      padding: 2mm;
      background: #FFF0F0;
      border: 1px solid #E8A0A0;
      border-radius: 2px;
      font-size: 8px;
      color: #8B2020;
    }

    /* ===== REG INFO ===== */
    .r-reg-info {
      width: calc(100% - 6mm);
      margin: 1mm 3mm 0;
      text-align: center;
      font-size: 7px;
      color: #888;
      line-height: 1.5;
    }

    /* ===== SIGNATURES ===== */
    .r-signatures {
      display: flex;
      justify-content: space-between;
      width: calc(100% - 6mm);
      margin: 3mm 3mm 2mm;
    }

    .r-sig {
      text-align: center;
      width: 30%;
    }

    .r-sig-line {
      border-bottom: 1px dashed #000;
      margin-bottom: 2px;
      height: 14mm;
    }

    .r-sig-label {
      font-size: 8px;
      font-weight: 700;
      color: #0D7C66;
    }

    .r-sig-name {
      font-size: 7px;
      color: #666;
    }

    /* ===== FOOTER ===== */
    .r-footer {
      text-align: center;
      margin: 0 3mm;
      padding: 2mm 0 3mm;
      border-top: 2px solid #0D7C66;
    }

    .r-footer-msg {
      font-size: 9px;
      color: #555;
    }

    .r-footer-brand {
      font-size: 7px;
      color: #999;
      margin-top: 1px;
    }

    /* ===== BOTTOM BRAND BAR ===== */
    .r-bottom-bar {
      background: #0D7C66;
      height: 3mm;
    }

    /* ===== WATERMARK ===== */
    .r-watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-25deg);
      font-size: 40px;
      font-weight: 800;
      color: rgba(220, 50, 50, 0.1);
      pointer-events: none;
      z-index: 10;
      white-space: nowrap;
    }

    /* ===== PRINT MEDIA ===== */
    @media print {
      body { margin: 0; background: white !important; }
      .r-container { padding: 0; width: 100%; }
      .r-watermark { color: rgba(0,0,0,0.12) !important; }

      /* ===== HIGH-CONTRAST B&W OVERRIDES ===== */
      .r-brand-bar {
        background: #000 !important;
      }
      .r-logo-text {
        color: #fff !important;
      }
      .r-brand-bar img {
        filter: brightness(0) invert(1) !important;
      }
      .r-brand-name {
        color: #fff !important;
      }
      .r-brand-info {
        color: rgba(255,255,255,0.8) !important;
      }
      .r-brand-bar::after {
        background: #666 !important;
      }
      .r-branch-badge {
        background: #eee !important;
        border-color: #999 !important;
        color: #000 !important;
      }
      .r-title-box {
        border-color: #000 !important;
        background: #f5f5f5 !important;
      }
      .r-title-text {
        color: #000 !important;
      }
      .r-sep-double {
        border-top-color: #000 !important;
      }
      .r-sep-star {
        color: #000 !important;
      }
      .r-sep-star::before,
      .r-sep-star::after {
        border-top-color: #000 !important;
      }
      .r-sep-thick {
        border-top-color: #000 !important;
      }
      .r-info-label {
        color: #000 !important;
        font-weight: 800 !important;
      }
      .r-info-value {
        color: #000 !important;
        font-weight: 700 !important;
      }
      .r-items-table {
        border-top-color: #000 !important;
        border-bottom-color: #000 !important;
      }
      .r-items-table thead tr {
        background: #000 !important;
      }
      .r-items-table thead th {
        color: #fff !important;
        border-left-color: rgba(255,255,255,0.3) !important;
      }
      .r-items-table tbody td {
        border-bottom-color: #999 !important;
        color: #000 !important;
      }
      .r-row-alt {
        background: #f0f0f0 !important;
      }
      .r-col-num {
        color: #555 !important;
      }
      .r-col-name {
        color: #000 !important;
        font-weight: 700 !important;
      }
      .r-col-uc {
        color: #000 !important;
        font-weight: 700 !important;
      }
      .r-col-total {
        color: #000 !important;
        font-weight: 800 !important;
      }
      .r-sub-row {
        color: #000 !important;
        font-weight: 700 !important;
      }
      .r-items-count .r-pieces-count {
        color: #000 !important;
        font-weight: 800 !important;
      }
      .r-total-label {
        color: #333 !important;
      }
      .r-total-val {
        color: #000 !important;
        font-weight: 700 !important;
      }
      .r-grand-total-box {
        border-color: #000 !important;
        background: #000 !important;
      }
      .r-grand-total-box::before {
        border-color: #666 !important;
      }
      .r-grand-label {
        color: #fff !important;
      }
      .r-grand-value {
        color: #fff !important;
      }
      .r-amount-words {
        background: #eee !important;
        border-color: #999 !important;
        color: #000 !important;
        font-weight: 700 !important;
      }
      .r-notes {
        background: #f5f5f5 !important;
        border-color: #999 !important;
        color: #000 !important;
      }
      .r-cancel {
        background: #f0f0f0 !important;
        border-color: #999 !important;
        color: #000 !important;
      }
      .r-reg-info {
        color: #333 !important;
      }
      .r-sig-label {
        color: #000 !important;
        font-weight: 800 !important;
      }
      .r-sig-name {
        color: #333 !important;
      }
      .r-footer {
        border-top-color: #000 !important;
      }
      .r-footer-msg {
        color: #333 !important;
      }
      .r-footer-brand {
        color: #666 !important;
      }
      .r-bottom-bar {
        background: #000 !important;
      }
    }
  </style>
</head>
<body>
  <div class="r-container" style="position:relative;">
    ${watermarkHtml}

    <!-- ===== TOP BRAND BAR ===== -->
    <div class="r-brand-bar">
      <div class="r-brand-logo">${logoSection}</div>
      <div class="r-brand-name">${escapeHtml(factoryName)}</div>
      ${branchInfoHtml}
      ${regInfoHtml}
    </div>

    <!-- ===== BRANCH NAME BADGE ===== -->
    <div class="r-branch-badge">فرع ${escapeHtml(branchName)}</div>

    <!-- ===== INVOICE TITLE BOX ===== -->
    <div class="r-title-box">
      <span class="r-title-text">فاتورة مبيعات</span>
    </div>

    <hr class="r-sep-double">

    <!-- ===== INVOICE INFO ===== -->
    <table class="r-info-table">
      <tr>
        <td class="r-info-label">رقم الفاتورة</td>
        <td class="r-info-value">${escapeHtml(invoice.invoice_number)}</td>
      </tr>
      <tr>
        <td class="r-info-label">التاريخ</td>
        <td class="r-info-value">${formatDate(invoice.invoice_date)}${invoiceTime ? ` - ${invoiceTime}` : ''}</td>
      </tr>
      <tr>
        <td class="r-info-label">الفرع</td>
        <td class="r-info-value">${escapeHtml(branchName)}</td>
      </tr>
      ${customerName ? `<tr><td class="r-info-label">العميل</td><td class="r-info-value">${escapeHtml(customerName)}</td></tr>` : ''}
      ${invoice.receiver_name ? `<tr><td class="r-info-label">المستلم</td><td class="r-info-value">${escapeHtml(invoice.receiver_name)}</td></tr>` : ''}
      ${invoice.driver_name ? `<tr><td class="r-info-label">السائق</td><td class="r-info-value">${escapeHtml(invoice.driver_name)}${invoice.driver_phone ? ` (${escapeHtml(invoice.driver_phone)})` : ''}</td></tr>` : ''}
    </table>

    <hr class="r-sep-double">

    <!-- ===== ITEMS TABLE ===== -->
    <table class="r-items-table">
      <thead>
        <tr>
          <th>#</th>
          <th class="r-th-name">الصنف</th>
          <th>الكمية</th>
          ${showUnitCount ? '<th>عدد</th>' : ''}
          <th>السعر</th>
          <th>الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <!-- Items count -->
    <div class="r-items-count">
      <span>أصناف: ${items.length}</span>
      ${showUnitCount ? `<span class="r-pieces-count">قطع: ${totalPieces.toLocaleString('ar-EG')}</span>` : ''}
    </div>

    <div class="r-sep-star">✦</div>

    <!-- ===== TOTALS ===== -->
    <div class="r-totals">
      <div class="r-total-row">
        <span class="r-total-label">المجموع الفرعي</span>
        <span class="r-total-val">${formatCurrency(invoice.subtotal)}</span>
      </div>
      ${taxRow}
    </div>

    <!-- ===== GRAND TOTAL BOX ===== -->
    <div class="r-grand-total-box">
      <span class="r-grand-label">الإجمالي النهائي</span>
      <span class="r-grand-value">${formatCurrency(invoice.total)}</span>
    </div>

    <!-- ===== AMOUNT IN WORDS ===== -->
    <div class="r-amount-words">
      المبلغ: ${numberToArabicWords(Number(invoice.total))}
    </div>

    <hr class="r-sep-dashed">

    <!-- ===== NOTES ===== -->
    ${notesHtml}
    ${cancelHtml}

    <!-- ===== REG INFO ===== -->
    ${regInfoParts.length > 0 ? `<div class="r-reg-info">${regInfoParts.join(' | ')}</div>` : ''}

    ${showSignatures ? `<!-- ===== SIGNATURES ===== -->
    <div class="r-signatures">
      <div class="r-sig">
        <div class="r-sig-label">المحاسب</div>
        <div class="r-sig-line"></div>
        <div class="r-sig-name">${escapeHtml(userFullName)}</div>
      </div>
      <div class="r-sig">
        <div class="r-sig-label">المستلم</div>
        <div class="r-sig-line"></div>
        <div class="r-sig-name">${escapeHtml(invoice.receiver_name) || ''}</div>
      </div>
      <div class="r-sig">
        <div class="r-sig-label">السائق</div>
        <div class="r-sig-line"></div>
        <div class="r-sig-name">${escapeHtml(invoice.driver_name) || ''}</div>
      </div>
    </div>

    <hr class="r-sep-star">` : ''}

    <!-- ===== FOOTER ===== -->
    <div class="r-footer">
      <p class="r-footer-msg">${escapeHtml(invoiceFooter)}</p>
      <p class="r-footer-brand">${escapeHtml(factoryName)} - نظام علي الصادق</p>
    </div>

    <!-- ===== BOTTOM BRAND BAR ===== -->
    <div class="r-bottom-bar"></div>
  </div>
</body>
</html>`;
}

import { formatCurrency, formatDate } from './utils';
import type { Invoice, InvoiceItem, Settings } from './types';

/**
 * Invoice Template Generator
 * Generates a complete, self-contained HTML document for printing and PDF export.
 * Uses pure CSS (no Tailwind dependency) so it works in any context.
 */

interface InvoiceDocumentData {
  invoice: Invoice;
  items: InvoiceItem[];
  branchName: string;
  settings: Settings | null;
  userFullName: string;
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
    }
  `;
}

export function generateInvoiceDocument(data: InvoiceDocumentData): string {
  const { invoice, items, branchName, settings, userFullName } = data;

  const invoiceTime = formatTime(invoice.invoice_time);
  const factoryName = settings?.factory_name || 'مصنع الصادق';
  const factoryAddress = settings?.address || '';
  const factoryPhone = settings?.phone || '';
  const factoryEmail = settings?.email || '';
  const taxNumber = settings?.tax_number || '';
  const commercialRegister = settings?.commercial_register || '';
  const invoiceFooter = settings?.invoice_footer || 'شكراً لتعاملكم معنا';

  const showUnitCount = hasUnitCount(items);

  const logoSection = settings?.logo_url
    ? `<img src="${settings.logo_url}" alt="شعار" style="width:70px;height:70px;object-fit:contain;" />`
    : `<span class="logo-text">ص</span>`;

  const isCancelled = invoice.status === 'cancelled';
  const watermarkHtml = isCancelled
    ? '<div class="watermark cancelled">ملغاة</div>'
    : '';

  const notesHtml = invoice.notes
    ? `<div class="inv-notes"><span class="notes-label">ملاحظات: </span><span class="notes-text">${invoice.notes}</span></div>`
    : '';

  const cancelHtml = invoice.cancel_reason
    ? `<div class="inv-cancel"><span class="cancel-label">سبب الإلغاء: </span><span class="cancel-text">${invoice.cancel_reason}</span></div>`
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
        <td class="col-name">${item.item_name}</td>
        <td class="col-qty">${Number(item.quantity).toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
        <td class="col-unit-count">${unitCount > 1 ? unitCount.toLocaleString('ar-EG') : '—'}</td>
        <td class="col-total-pieces">${unitCount > 1 ? itemTotalPieces.toLocaleString('ar-EG') : '—'}</td>
        <td class="col-price">${formatCurrency(Number(item.unit_price))}</td>
        <td class="col-total">${formatCurrency(Number(item.total_price))}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>فاتورة صرف - ${invoice.invoice_number}</title>
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
      <div class="inv-header-title">
        <h2>فاتورة صرف</h2>
        <span class="inv-num">${invoice.invoice_number}</span>
        <span class="inv-date">${formatDate(invoice.invoice_date)}${invoiceTime ? ` - ${invoiceTime}` : ''}</span>
      </div>
    </div>

    <!-- GOLD DIVIDER -->
    <div class="gold-divider"></div>

    <!-- INVOICE INFO (No status - only shown in app UI, not on printed invoice) -->
    <div class="inv-info-grid" style="grid-template-columns: repeat(3, 1fr);">
      <div class="inv-info-cell">
        <div class="label">الفرع</div>
        <div class="value">${branchName}</div>
      </div>
      <div class="inv-info-cell">
        <div class="label">المستلم</div>
        <div class="value">${invoice.receiver_name || '—'}</div>
      </div>
      <div class="inv-info-cell">
        <div class="label">السائق</div>
        <div class="value">${invoice.driver_name || '—'}${invoice.driver_phone ? ` <span style="color:#999;font-size:11px;">(${invoice.driver_phone})</span>` : ''}</div>
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

    <!-- SIGNATURES -->
    <div class="inv-signatures">
      <div class="sig-box">
        <div class="sig-label">المحاسب</div>
        <div class="sig-line">${userFullName}</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">المستلم</div>
        <div class="sig-line">${invoice.receiver_name || ''}</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">السائق</div>
        <div class="sig-line">${invoice.driver_name || ''}</div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="inv-footer">
      <p class="footer-text">${invoiceFooter}</p>
      <p class="footer-brand">${factoryName} - نظام فواتير الصرف</p>
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

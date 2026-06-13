import { escapeHtml, formatCurrency, formatDate, numberToArabicWords } from './utils';
import type { Settings } from './types';

/**
 * Payment Receipt Template Generator
 * Generates a professional, self-contained HTML document for printing and PDF export.
 * Optimized for B&W printing with high-contrast colors.
 */

export interface PaymentReceiptData {
  paymentNumber: string;
  branchName: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  notes?: string | null;
  settings: Settings | null;
  generatedAt: string;
}

function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: 'كاش',
    bank_transfer: 'تحويل بنكي',
    cheque: 'شيك',
  };
  return labels[method] || method;
}

function getReceiptCSS(): string {
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

    .rcpt-container {
      width: 100%;
      max-width: 210mm;
      margin: 0 auto;
      padding: 4mm 6mm;
      position: relative;
    }

    /* ===== HEADER ===== */
    .rcpt-header {
      display: flex;
      align-items: stretch;
      border: 2.5px solid #0D7C66;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 14px;
    }

    .rcpt-header-logo {
      background: #0D7C66;
      padding: 18px 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 110px;
    }

    .rcpt-header-logo .logo-text {
      font-size: 56px;
      font-weight: 800;
      color: #D4A843;
      line-height: 1;
      user-select: none;
    }

    .rcpt-header-logo img {
      width: 70px;
      height: 70px;
      object-fit: contain;
    }

    .rcpt-header-info {
      flex: 1;
      padding: 12px 20px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .rcpt-header-info h1 {
      font-size: 22px;
      font-weight: 700;
      color: #0D7C66;
      margin-bottom: 4px;
    }

    .rcpt-header-info .contact-line {
      font-size: 11px;
      color: #555;
      line-height: 1.8;
    }

    .rcpt-header-info .contact-line span {
      margin-left: 18px;
      white-space: nowrap;
    }

    .rcpt-header-title {
      background: linear-gradient(135deg, #0D7C66, #0A5E4D);
      padding: 16px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 170px;
    }

    .rcpt-header-title h2 {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 3px;
    }

    .rcpt-header-title .rcpt-num {
      font-size: 14px;
      color: #D4A843;
      font-weight: 600;
    }

    .rcpt-header-title .rcpt-date {
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

    /* ===== INFO GRID ===== */
    .rcpt-info-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0;
      border: 1px solid #ddd;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 14px;
    }

    .rcpt-info-cell {
      padding: 10px 14px;
      border-left: 1px solid #e5e5e5;
    }

    .rcpt-info-cell:last-child {
      border-left: none;
    }

    .rcpt-info-cell .label {
      font-size: 10px;
      color: #888;
      font-weight: 600;
      margin-bottom: 3px;
    }

    .rcpt-info-cell .value {
      font-size: 13px;
      color: #1a1a2e;
      font-weight: 600;
    }

    /* ===== AMOUNT BOX ===== */
    .rcpt-amount-box {
      border: 2.5px solid #0D7C66;
      border-radius: 12px;
      padding: 20px 30px;
      text-align: center;
      margin-bottom: 14px;
      background: linear-gradient(135deg, rgba(13,124,102,0.03), rgba(212,168,67,0.03));
    }

    .rcpt-amount-box .amount-label {
      font-size: 14px;
      color: #0D7C66;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .rcpt-amount-box .amount-value {
      font-size: 36px;
      font-weight: 800;
      color: #0D7C66;
      line-height: 1.2;
    }

    .rcpt-amount-box .amount-method {
      font-size: 12px;
      color: #666;
      margin-top: 6px;
    }

    /* ===== AMOUNT IN WORDS ===== */
    .rcpt-amount-words {
      padding: 10px 14px;
      background: #f0faf7;
      border: 1px solid #b8e0d5;
      border-radius: 8px;
      margin-bottom: 14px;
      font-size: 12px;
    }

    .rcpt-amount-words .amount-label {
      font-weight: 700;
      color: #0D7C66;
    }

    .rcpt-amount-words .amount-text {
      color: #1a1a2e;
      font-weight: 500;
    }

    /* ===== NOTES ===== */
    .rcpt-notes {
      padding: 10px 14px;
      background: #FFF9E6;
      border: 1px solid #F0D060;
      border-radius: 8px;
      margin-bottom: 14px;
      font-size: 12px;
    }

    .rcpt-notes .notes-label {
      font-weight: 700;
      color: #8B7020;
    }

    .rcpt-notes .notes-text {
      color: #6B5510;
      margin-top: 2px;
    }

    /* ===== SIGNATURES ===== */
    .rcpt-signatures {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 16px;
      margin-top: 30px;
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
    .rcpt-footer {
      text-align: center;
      padding-top: 10px;
      border-top: 2px solid #0D7C66;
    }

    .rcpt-footer .footer-text {
      font-size: 11px;
      color: #888;
    }

    .rcpt-footer .footer-brand {
      font-size: 10px;
      color: #aaa;
      margin-top: 4px;
    }

    /* ===== PRINT MEDIA — HIGH-CONTRAST B&W ===== */
    @media print {
      body {
        margin: 0;
        background: white !important;
      }
      .rcpt-container {
        padding: 0;
        max-width: 100%;
      }

      /* B&W Overrides */
      .rcpt-header {
        border-color: #000 !important;
        border-width: 3px !important;
      }
      .rcpt-header-logo {
        background: #000 !important;
      }
      .rcpt-header-logo .logo-text {
        color: #fff !important;
      }
      .rcpt-header-logo img {
        filter: brightness(0) invert(1) !important;
      }
      .rcpt-header-info h1 {
        color: #000 !important;
      }
      .rcpt-header-title {
        background: #222 !important;
      }
      .rcpt-header-title h2 {
        color: #fff !important;
      }
      .rcpt-header-title .rcpt-num {
        color: #ccc !important;
      }
      .rcpt-header-title .rcpt-date {
        color: #999 !important;
      }
      .gold-divider {
        background: #333 !important;
      }
      .rcpt-info-grid {
        border-color: #333 !important;
      }
      .rcpt-info-cell {
        border-left-color: #ccc !important;
      }
      .rcpt-info-cell .label {
        color: #555 !important;
      }
      .rcpt-info-cell .value {
        color: #000 !important;
      }
      .rcpt-amount-box {
        border-color: #000 !important;
        background: #f5f5f5 !important;
      }
      .rcpt-amount-box .amount-label {
        color: #000 !important;
      }
      .rcpt-amount-box .amount-value {
        color: #000 !important;
      }
      .rcpt-amount-box .amount-method {
        color: #333 !important;
      }
      .rcpt-amount-words {
        background: #eee !important;
        border-color: #999 !important;
      }
      .rcpt-amount-words .amount-label {
        color: #000 !important;
      }
      .rcpt-amount-words .amount-text {
        color: #000 !important;
      }
      .rcpt-notes {
        background: #f5f5f5 !important;
        border-color: #999 !important;
      }
      .rcpt-notes .notes-label {
        color: #333 !important;
      }
      .rcpt-notes .notes-text {
        color: #000 !important;
      }
      .rcpt-signatures .sig-box {
        border-color: #666 !important;
      }
      .rcpt-signatures .sig-label {
        color: #000 !important;
      }
      .rcpt-signatures .sig-line {
        border-top-color: #666 !important;
        color: #333 !important;
      }
      .rcpt-footer {
        border-top-color: #000 !important;
      }
      .rcpt-footer .footer-text {
        color: #333 !important;
      }
      .rcpt-footer .footer-brand {
        color: #666 !important;
      }
    }
  `;
}

export function generatePaymentReceiptDocument(data: PaymentReceiptData): string {
  const {
    paymentNumber,
    branchName,
    branchAddress,
    branchPhone,
    amount,
    paymentDate,
    paymentMethod,
    notes,
    settings,
    generatedAt,
  } = data;

  const factoryName = settings?.factory_name || 'مصنع الصادق';
  const factoryAddress = settings?.address || '';
  const factoryPhone = settings?.phone || '';
  const factoryEmail = settings?.email || '';
  const taxNumber = settings?.tax_number || '';
  const commercialRegister = settings?.commercial_register || '';

  const logoSection = settings?.logo_url
    ? `<img src="${escapeHtml(settings.logo_url)}" alt="شعار" style="width:70px;height:70px;object-fit:contain;" />`
    : `<span class="logo-text">ص</span>`;

  const notesHtml = notes
    ? `<div class="rcpt-notes"><span class="notes-label">ملاحظات: </span><span class="notes-text">${escapeHtml(notes)}</span></div>`
    : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>إيصال قبض - ${escapeHtml(paymentNumber)}</title>
  <style>${getReceiptCSS()}</style>
</head>
<body>
  <div class="rcpt-container">
    <!-- HEADER -->
    <div class="rcpt-header">
      <div class="rcpt-header-logo">
        ${logoSection}
      </div>
      <div class="rcpt-header-info">
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
      <div class="rcpt-header-title">
        <h2>إيصال قبض</h2>
        <span class="rcpt-num">${escapeHtml(paymentNumber)}</span>
        <span class="rcpt-date">${formatDate(paymentDate)}</span>
      </div>
    </div>

    <!-- GOLD DIVIDER -->
    <div class="gold-divider"></div>

    <!-- INFO GRID -->
    <div class="rcpt-info-grid">
      <div class="rcpt-info-cell">
        <div class="label">الفرع</div>
        <div class="value">${escapeHtml(branchName)}</div>
      </div>
      <div class="rcpt-info-cell">
        <div class="label">طريقة الدفع</div>
        <div class="value">${escapeHtml(getPaymentMethodLabel(paymentMethod))}</div>
      </div>
      <div class="rcpt-info-cell">
        <div class="label">تاريخ الاستلام</div>
        <div class="value">${formatDate(paymentDate)}</div>
      </div>
    </div>

    <!-- AMOUNT BOX -->
    <div class="rcpt-amount-box">
      <div class="amount-label">المبلغ المستلم</div>
      <div class="amount-value">${formatCurrency(amount)}</div>
      <div class="amount-method">طريقة الدفع: ${escapeHtml(getPaymentMethodLabel(paymentMethod))}</div>
    </div>

    <!-- AMOUNT IN WORDS -->
    <div class="rcpt-amount-words">
      <span class="amount-label">المبلغ: </span>
      <span class="amount-text">${numberToArabicWords(amount)}</span>
    </div>

    <!-- NOTES -->
    ${notesHtml}

    <!-- SIGNATURES -->
    <div class="rcpt-signatures">
      <div class="sig-box">
        <div class="sig-label">المحاسب</div>
        <div class="sig-line"></div>
      </div>
      <div class="sig-box">
        <div class="sig-label">مستلم الفرع</div>
        <div class="sig-line"></div>
      </div>
      <div class="sig-box">
        <div class="sig-label">المدير المالي</div>
        <div class="sig-line"></div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="rcpt-footer">
      <p class="footer-text">هذا الإيصال صادر من ${escapeHtml(factoryName)} ويعتبر مستند رسمي</p>
      <p class="footer-brand">${escapeHtml(factoryName)} - نظام إيصالات القبض</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates a thermal (80mm) payment receipt HTML document.
 */
export function generateThermalPaymentReceiptDocument(data: PaymentReceiptData): string {
  const {
    paymentNumber,
    branchName,
    amount,
    paymentDate,
    paymentMethod,
    notes,
    settings,
  } = data;

  const factoryName = settings?.factory_name || 'مصنع الصادق';
  const factoryPhone = settings?.phone || '';

  const logoSection = settings?.logo_url
    ? `<img src="${escapeHtml(settings.logo_url)}" alt="شعار" style="width:32px;height:32px;object-fit:contain;vertical-align:middle;" />`
    : `<span style="font-size:28px;font-weight:800;color:#D4A843;line-height:1;">ص</span>`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>إيصال قبض - ${escapeHtml(paymentNumber)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&display=swap');

    *, *::before, *::after {
      margin: 0; padding: 0; box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    body {
      font-family: 'Cairo', 'Noto Sans Arabic', sans-serif;
      color: #000; background: #fff; direction: rtl;
      line-height: 1.4; margin: 0; padding: 0; font-size: 10px;
    }

    @page { size: 80mm auto; margin: 0; }

    .r-container { width: 80mm; margin: 0 auto; padding: 0; }

    .r-brand-bar {
      background: #0D7C66; padding: 4mm 3mm 3mm; text-align: center;
      position: relative;
    }
    .r-brand-bar::after {
      content: ''; position: absolute; bottom: 0; left: 0; right: 0;
      height: 2px; background: #D4A843;
    }
    .r-brand-name { font-size: 13px; font-weight: 800; color: #fff; margin-top: 2px; }
    .r-brand-info { font-size: 7.5px; color: rgba(255,255,255,0.8); line-height: 1.5; margin-top: 1px; }

    .r-title-box {
      border: 2px solid #0D7C66; border-top: none; text-align: center;
      padding: 2mm 0; background: linear-gradient(to left, rgba(13,124,102,0.05), rgba(212,168,67,0.05));
    }
    .r-title-text { font-size: 13px; font-weight: 800; color: #0D7C66; letter-spacing: 1px; }

    .r-sep-double { border: none; border-top: 2px double #0D7C66; margin: 2mm 3mm; }
    .r-sep-dashed { border: none; border-top: 1px dashed #999; margin: 2mm 3mm; }

    .r-info-table {
      width: calc(100% - 6mm); margin: 0 3mm; border-collapse: collapse; font-size: 9px;
    }
    .r-info-table tr { border-bottom: 1px dotted #ccc; }
    .r-info-table tr:last-child { border-bottom: none; }
    .r-info-table td { padding: 1.5px 0; vertical-align: top; }
    .r-info-label { font-weight: 700; color: #0D7C66; width: 35%; white-space: nowrap; }
    .r-info-value { color: #000; font-weight: 600; }

    .r-amount-box {
      border: 2px solid #000; padding: 3mm; margin: 2mm 3mm;
      text-align: center; background: #0D7C66; position: relative;
    }
    .r-amount-box::before {
      content: ''; position: absolute; top: 2px; left: 2px; right: 2px; bottom: 2px;
      border: 1px solid #D4A843;
    }
    .r-amount-label { font-size: 11px; font-weight: 700; color: #fff; display: block; }
    .r-amount-value { font-size: 18px; font-weight: 800; color: #D4A843; display: block; margin-top: 1px; }

    .r-amount-words {
      width: calc(100% - 6mm); margin: 2mm 3mm; padding: 2mm;
      background: #f0faf7; border: 1px solid #b8e0d5; border-radius: 2px;
      font-size: 8px; color: #0D7C66; font-weight: 600; text-align: center;
    }

    .r-notes {
      width: calc(100% - 6mm); margin: 2mm 3mm; padding: 2mm;
      background: #FFF9E6; border: 1px solid #E8D060; border-radius: 2px;
      font-size: 8px; color: #6B5510;
    }

    .r-signatures {
      display: flex; justify-content: space-between;
      width: calc(100% - 6mm); margin: 3mm 3mm 2mm;
    }
    .r-sig { text-align: center; width: 45%; }
    .r-sig-line { border-bottom: 1px dashed #000; margin-bottom: 2px; height: 10mm; }
    .r-sig-label { font-size: 8px; font-weight: 700; color: #0D7C66; }

    .r-footer {
      text-align: center; margin: 0 3mm; padding: 2mm 0 3mm;
      border-top: 2px solid #0D7C66;
    }
    .r-footer-msg { font-size: 9px; color: #555; }
    .r-footer-brand { font-size: 7px; color: #999; margin-top: 1px; }

    .r-bottom-bar { background: #0D7C66; height: 3mm; }

    /* ===== PRINT B&W ===== */
    @media print {
      body { margin: 0; background: white !important; }
      .r-container { padding: 0; width: 100%; }
      .r-brand-bar { background: #000 !important; }
      .r-brand-bar * { color: #fff !important; }
      .r-brand-bar::after { background: #666 !important; }
      .r-title-box { border-color: #000 !important; background: #f5f5f5 !important; }
      .r-title-text { color: #000 !important; }
      .r-sep-double { border-top-color: #000 !important; }
      .r-info-label { color: #000 !important; font-weight: 800 !important; }
      .r-info-value { color: #000 !important; font-weight: 700 !important; }
      .r-amount-box { background: #000 !important; border-color: #000 !important; }
      .r-amount-box::before { border-color: #666 !important; }
      .r-amount-label { color: #fff !important; }
      .r-amount-value { color: #fff !important; }
      .r-amount-words { background: #eee !important; border-color: #999 !important; color: #000 !important; }
      .r-notes { background: #f5f5f5 !important; border-color: #999 !important; color: #000 !important; }
      .r-sig-label { color: #000 !important; }
      .r-footer { border-top-color: #000 !important; }
      .r-footer-msg { color: #333 !important; }
      .r-footer-brand { color: #666 !important; }
      .r-bottom-bar { background: #000 !important; }
    }
  </style>
</head>
<body>
  <div class="r-container">
    <!-- Brand Bar -->
    <div class="r-brand-bar">
      <div>${logoSection}</div>
      <div class="r-brand-name">${escapeHtml(factoryName)}</div>
      ${factoryPhone ? `<div class="r-brand-info">هاتف: ${escapeHtml(factoryPhone)}</div>` : ''}
    </div>

    <!-- Title -->
    <div class="r-title-box">
      <div class="r-title-text">إيصال قبض</div>
    </div>

    <hr class="r-sep-double" />

    <!-- Info -->
    <table class="r-info-table">
      <tr><td class="r-info-label">رقم الإيصال</td><td class="r-info-value">${escapeHtml(paymentNumber)}</td></tr>
      <tr><td class="r-info-label">التاريخ</td><td class="r-info-value">${formatDate(paymentDate)}</td></tr>
      <tr><td class="r-info-label">الفرع</td><td class="r-info-value">${escapeHtml(branchName)}</td></tr>
      <tr><td class="r-info-label">طريقة الدفع</td><td class="r-info-value">${escapeHtml(getPaymentMethodLabel(paymentMethod))}</td></tr>
    </table>

    <hr class="r-sep-dashed" />

    <!-- Amount Box -->
    <div class="r-amount-box">
      <span class="r-amount-label">المبلغ المستلم</span>
      <span class="r-amount-value">${formatCurrency(amount)}</span>
    </div>

    <!-- Amount in Words -->
    <div class="r-amount-words">
      المبلغ: ${numberToArabicWords(amount)}
    </div>

    ${notes ? `<div class="r-notes"><strong>ملاحظات:</strong> ${escapeHtml(notes)}</div>` : ''}

    <hr class="r-sep-dashed" />

    <!-- Signatures -->
    <div class="r-signatures">
      <div class="r-sig">
        <div class="r-sig-line"></div>
        <div class="r-sig-label">المحاسب</div>
      </div>
      <div class="r-sig">
        <div class="r-sig-line"></div>
        <div class="r-sig-label">مستلم الفرع</div>
      </div>
    </div>

    <!-- Footer -->
    <div class="r-footer">
      <div class="r-footer-msg">شكراً لتعاملكم معنا</div>
      <div class="r-footer-brand">${escapeHtml(factoryName)} - إيصالات القبض</div>
    </div>

    <div class="r-bottom-bar"></div>
  </div>
</body>
</html>`;
}

'use client';

import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Invoice, InvoiceItem } from '@/lib/types';
import { formatCurrency, formatDate, formatDateTime, getStatusLabel, getStatusColor, numberToArabicWords } from '@/lib/utils';
import { generateInvoiceDocument, generateThermalDocument } from '@/lib/invoice-template';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
  ArrowRight,
  Printer,
  Download,
  XCircle,
  Loader2,
  Lock,
  Receipt,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';

export default function InvoiceDetailPage() {
  const { navigateTo, pageParams, settings, hasPermission } = useAppStore();
  const invoiceId = pageParams.id;
  const printRef = useRef<HTMLDivElement>(null);

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [branchName, setBranchName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [loading, setLoading] = useState(true);

  // Cancel dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    if (invoiceId) {
      loadInvoice();
    }
  }, [invoiceId]);

  useEffect(() => {
    if (pageParams.print === 'true' && invoice) {
      setTimeout(() => handlePrint(), 800);
    }
  }, [invoice]);

  const loadInvoice = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, items:invoice_items(*)')
        .eq('id', invoiceId)
        .single();

      if (error || !data) {
        toast.error('لم يتم العثور على الفاتورة');
        navigateTo('invoices');
        return;
      }

      const inv = data as Invoice & { items: InvoiceItem[] };
      setInvoice(inv);
      setItems(inv.items || []);

      // Load branch name
      const { data: branch } = await supabase
        .from('branches')
        .select('name')
        .eq('id', inv.branch_id)
        .single();
      if (branch) setBranchName(branch.name);

      // Load customer name
      if ((inv as any).customer_id) {
        const { data: customer } = await supabase
          .from('customers')
          .select('name')
          .eq('id', (inv as any).customer_id)
          .single();
        if (customer) setCustomerName(customer.name);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!invoice) return;

    const htmlDoc = generateInvoiceDocument({
      invoice,
      items,
      branchName,
      customerName,
      settings,
      userFullName: useAppStore.getState().user?.full_name || 'علي محمد الصادق',
    });

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

  const handlePrintThermal = () => {
    if (!invoice) return;

    const htmlDoc = generateThermalDocument({
      invoice,
      items,
      branchName,
      customerName,
      settings,
      userFullName: useAppStore.getState().user?.full_name || 'علي محمد الصادق',
    });

    const printWindow = window.open('', '_blank', 'width=340,height=800');
    if (!printWindow) {
      toast.error('يرجى السماح بالنوافذ المنبثقة للطباعة');
      return;
    }

    printWindow.document.write(htmlDoc);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 1500);
  };

  const handleExportPDF = async () => {
    if (!invoice) return;
    toast.info('جاري إنشاء ملف PDF...');

    let iframe: HTMLIFrameElement | null = null;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;

      const htmlDoc = generateInvoiceDocument({
        invoice,
        items,
        branchName,
        customerName,
        settings,
        userFullName: useAppStore.getState().user?.full_name || 'علي محمد الصادق',
      });

      // Use an iframe with a full HTML document so fonts and CSS load correctly
      iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1200px;border:none;z-index:-1;';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        document.body.removeChild(iframe);
        toast.error('حدث خطأ أثناء إنشاء ملف PDF');
        return;
      }

      iframeDoc.open();
      iframeDoc.write(htmlDoc);
      iframeDoc.close();

      // Wait for fonts and content to fully load
      await new Promise<void>((resolve) => {
        const checkReady = () => {
          const container = iframeDoc.querySelector('.invoice-container');
          if (container) {
            // Give extra time for Google Fonts to render
            setTimeout(resolve, 2500);
          } else {
            setTimeout(checkReady, 500);
          }
        };
        checkReady();
      });

      const invoiceEl = iframeDoc.querySelector('.invoice-container') as HTMLElement;
      if (!invoiceEl) {
        if (iframe.parentNode) document.body.removeChild(iframe);
        toast.error('حدث خطأ أثناء إنشاء ملف PDF');
        return;
      }

      const canvas = await html2canvas(invoiceEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: invoiceEl.scrollWidth,
        windowWidth: 794,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, pdf.internal.pageSize.getHeight()));
      pdf.save(`${invoice.invoice_number || 'invoice'}.pdf`);

      if (iframe.parentNode) document.body.removeChild(iframe);
      toast.success('تم تحميل ملف PDF');
    } catch (err) {
      console.error(err);
      if (iframe?.parentNode) document.body.removeChild(iframe);
      toast.error('حدث خطأ أثناء إنشاء ملف PDF');
    }
  };

  const handleCancel = async () => {
    if (!invoice || !cancelReason.trim()) {
      toast.error('يرجى إدخال سبب الإلغاء');
      return;
    }

    try {
      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'cancelled',
          cancel_reason: cancelReason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoice.id);

      if (error) throw error;

      toast.success('تم إلغاء الفاتورة');
      setCancelDialogOpen(false);
      setCancelReason('');
      loadInvoice();
    } catch (err) {
      toast.error('حدث خطأ');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!invoice) return null;

  const formatTime = (time: string | null) => {
    if (!time) return '';
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'م' : 'ص';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${m} ${ampm}`;
  };

  const invoiceTime = invoice.invoice_time ? formatTime(invoice.invoice_time) : '';
  const showUnitCount = items.some(item => Number(item.unit_count) > 1);
  const totalPieces = items.reduce((sum, item) => sum + (Number(item.quantity) * (Number(item.unit_count) || 1)), 0);

  // Determine available actions based on invoice status
  const isActive = invoice.status === 'active';
  const isPartiallyReturned = invoice.status === 'partially_returned';
  const canCancel = isActive || isPartiallyReturned;

  return (
    <div className="space-y-6">
      {/* Header - no-print */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigateTo('invoices')}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">تفاصيل الفاتورة</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{invoice.invoice_number}</p>
          </div>
          <Badge
            variant="secondary"
            className={`mr-2 ${getStatusColor(invoice.status)}`}
          >
            {getStatusLabel(invoice.status)}
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasPermission('invoices', 'print') && (
            <Button variant="outline" onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" />
              طباعة A4
            </Button>
          )}
          {hasPermission('invoices', 'print') && (
            <Button variant="outline" onClick={handlePrintThermal} className="gap-2">
              <Receipt className="w-4 h-4" />
              حرارية
            </Button>
          )}
          {hasPermission('invoices', 'export') && (
            <Button variant="outline" onClick={handleExportPDF} className="gap-2">
              <Download className="w-4 h-4" />
              PDF
            </Button>
          )}
          {hasPermission('invoices', 'create') && (
            <Button
              variant="outline"
              onClick={() => navigateTo('invoice-form', { duplicate: invoice.id })}
              className="gap-2"
            >
              <Copy className="w-4 h-4" />
              تكرار
            </Button>
          )}
          {/* Locked indicator for finalized invoices */}
          {isActive && !hasPermission('invoices', 'delete') && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground px-2">
              <Lock className="w-3.5 h-3.5" />
              <span>فاتورة نهائية</span>
            </div>
          )}
          {canCancel && hasPermission('invoices', 'delete') && (
            <Button
              variant="destructive"
              onClick={() => setCancelDialogOpen(true)}
              className="gap-2"
            >
              <XCircle className="w-4 h-4" />
              إلغاء الفاتورة
            </Button>
          )}
        </div>
      </div>

      {/* Professional Invoice - Printable Area */}
      <div ref={printRef}>
        <div className="bg-white text-gray-900 rounded-xl shadow-lg overflow-hidden" style={{ fontFamily: "'Cairo', sans-serif" }}>

          {/* === HEADER === */}
          <div className="flex items-stretch border-2 border-[#0D7C66] rounded-xl overflow-hidden">
            {/* Logo Section */}
            <div className="bg-[#0D7C66] p-5 flex items-center justify-center min-w-[110px]">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="شعار" className="w-[70px] h-[70px] object-contain" />
              ) : (
                <span className="text-[56px] font-extrabold text-[#D4A843] leading-none select-none">ص</span>
              )}
            </div>

            {/* Factory Info */}
            <div className="flex-1 px-5 py-3 flex flex-col justify-center">
              <h1 className="text-xl font-bold text-[#0D7C66] mb-1">
                {settings?.factory_name || 'مصنع الصادق'}
              </h1>
              <div className="text-[11px] text-gray-500 leading-relaxed">
                {settings?.address && <span className="ml-4">{settings.address}</span>}
                {settings?.phone && <span className="ml-4">هاتف: {settings.phone}</span>}
                {settings?.email && <span className="ml-4">{settings.email}</span>}
              </div>
              <div className="text-[11px] text-gray-500 leading-relaxed">
                {settings?.tax_number && <span className="ml-4">الرقم الضريبي: {settings.tax_number}</span>}
                {settings?.commercial_register && <span>السجل التجاري: {settings.commercial_register}</span>}
              </div>
            </div>

            {/* Invoice Title */}
            <div className="bg-gradient-to-l from-[#0D7C66] to-[#0A5E4D] px-6 py-3 flex flex-col items-center justify-center min-w-[170px]">
              <h2 className="text-lg font-bold text-white">فاتورة صرف</h2>
              <p className="text-sm text-[#D4A843] font-semibold">{invoice.invoice_number}</p>
              <p className="text-[11px] text-white/80 mt-0.5">
                {formatDate(invoice.invoice_date)}
                {invoiceTime && ` - ${invoiceTime}`}
              </p>
            </div>
          </div>

          {/* === GOLD DIVIDER === */}
          <div className="h-[3px] bg-gradient-to-l from-[#0D7C66] via-[#D4A843] to-[#0D7C66] mx-1 mt-4 rounded-full" />

          {/* === INVOICE INFO (NO STATUS - status only shown in UI, not on printed invoice) === */}
          <div className="grid grid-cols-4 gap-0 border border-gray-200 rounded-lg overflow-hidden mx-1 mt-4">
            <div className="px-4 py-3 border-l border-gray-200">
              <div className="text-[10px] text-gray-400 font-semibold uppercase mb-0.5">الفرع</div>
              <div className="text-[13px] font-semibold text-gray-800">{branchName}</div>
            </div>
            <div className="px-4 py-3 border-l border-gray-200">
              <div className="text-[10px] text-gray-400 font-semibold uppercase mb-0.5">العميل</div>
              <div className="text-[13px] font-semibold text-gray-800">{customerName || '—'}</div>
            </div>
            <div className="px-4 py-3 border-l border-gray-200">
              <div className="text-[10px] text-gray-400 font-semibold uppercase mb-0.5">المستلم</div>
              <div className="text-[13px] font-semibold text-gray-800">{invoice.receiver_name || '—'}</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] text-gray-400 font-semibold uppercase mb-0.5">السائق</div>
              <div className="text-[13px] font-semibold text-gray-800">
                {invoice.driver_name || '—'}
                {invoice.driver_phone && <span className="text-gray-400 text-[11px] mr-1">({invoice.driver_phone})</span>}
              </div>
            </div>
          </div>

          {/* === ITEMS TABLE === */}
          <div className="mx-1 mt-4">
            <table className="w-full border-collapse border border-[#0D7C66] rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-[#0D7C66]">
                  <th className="py-2.5 px-3 text-white text-[12px] font-semibold text-center w-[40px] border-l border-white/20">#</th>
                  <th className="py-2.5 px-3 text-white text-[12px] font-semibold text-right border-l border-white/20">الصنف</th>
                  <th className="py-2.5 px-3 text-white text-[12px] font-semibold text-center w-[80px] border-l border-white/20">الكمية</th>
                  {showUnitCount && (
                    <>
                      <th className="py-2.5 px-3 text-white text-[12px] font-semibold text-center w-[70px] border-l border-white/20">عدد/وحدة</th>
                      <th className="py-2.5 px-3 text-white text-[12px] font-semibold text-center w-[90px] border-l border-white/20">إجمالي القطع</th>
                    </>
                  )}
                  <th className="py-2.5 px-3 text-white text-[12px] font-semibold text-center w-[120px] border-l border-white/20">سعر الوحدة</th>
                  <th className="py-2.5 px-3 text-white text-[12px] font-semibold text-left w-[120px]">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const unitCount = Number(item.unit_count) || 1;
                  const itemTotalPieces = Number(item.quantity) * unitCount;
                  return (
                    <tr key={item.id} className={index % 2 === 1 ? 'bg-[#f7faf9]' : 'bg-white'}>
                      <td className="py-2.5 px-3 text-[12px] text-center text-gray-400 border-b border-gray-100 border-l border-gray-100">{index + 1}</td>
                      <td className="py-2.5 px-3 text-[12px] font-medium text-gray-800 border-b border-gray-100 border-l border-gray-100">{item.item_name}</td>
                      <td className="py-2.5 px-3 text-[12px] text-center border-b border-gray-100 border-l border-gray-100">
                        {Number(item.quantity).toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                      </td>
                      {showUnitCount && (
                        <>
                          <td className="py-2.5 px-3 text-[12px] text-center border-b border-gray-100 border-l border-gray-100 text-[#0D7C66] font-semibold">
                            {unitCount > 1 ? unitCount.toLocaleString('ar-EG') : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-[12px] text-center border-b border-gray-100 border-l border-gray-100 font-bold text-[#0D7C66]">
                            {unitCount > 1 ? itemTotalPieces.toLocaleString('ar-EG') : '—'}
                          </td>
                        </>
                      )}
                      <td className="py-2.5 px-3 text-[12px] text-center border-b border-gray-100 border-l border-gray-100">
                        {formatCurrency(Number(item.unit_price))}
                      </td>
                      <td className="py-2.5 px-3 text-[12px] text-left font-bold text-[#0D7C66] border-b border-gray-100">
                        {formatCurrency(Number(item.total_price))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* === ITEMS COUNT === */}
          <div className="mx-1 mt-2 flex justify-between text-[11px] text-gray-400">
            <span>عدد الأصناف: {items.length}</span>
            {showUnitCount && (
              <span className="text-[#0D7C66] font-semibold">إجمالي القطع: {totalPieces.toLocaleString('ar-EG')}</span>
            )}
          </div>

          {/* === TOTALS === */}
          <div className="flex justify-end mx-1 mt-3">
            <div className="w-[280px] border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex justify-between items-center px-4 py-2 border-b border-gray-100">
                <span className="text-[12px] text-gray-500">المجموع الفرعي</span>
                <span className="text-[12px] font-semibold text-gray-800">{formatCurrency(invoice.subtotal)}</span>
              </div>
              {invoice.tax_rate > 0 && (
                <div className="flex justify-between items-center px-4 py-2 border-b border-gray-100">
                  <span className="text-[12px] text-gray-500">الضريبة ({invoice.tax_rate}%)</span>
                  <span className="text-[12px] font-semibold text-gray-800">{formatCurrency(invoice.tax_amount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center px-4 py-3 bg-[#0D7C66]">
                <span className="text-[14px] font-bold text-white">الإجمالي النهائي</span>
                <span className="text-[16px] font-extrabold text-white">{formatCurrency(invoice.total)}</span>
              </div>
            </div>
          </div>

          {/* === NOTES === */}
          {invoice.notes && (
            <div className="mx-1 mt-4 p-3 bg-[#FFF9E6] border border-[#F0D060] rounded-lg">
              <span className="text-[12px] font-bold text-[#8B7020]">ملاحظات: </span>
              <span className="text-[12px] text-[#6B5510]">{invoice.notes}</span>
            </div>
          )}

          {/* === CANCEL REASON === */}
          {invoice.cancel_reason && (
            <div className="mx-1 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <span className="text-[12px] font-bold text-red-700">سبب الإلغاء: </span>
              <span className="text-[12px] text-red-600">{invoice.cancel_reason}</span>
            </div>
          )}

          {/* === AMOUNT IN WORDS === */}
          <div className="mx-1 mt-4 p-3 bg-[#f0faf7] border border-[#b8e0d5] rounded-lg">
            <span className="text-[12px] font-bold text-[#0D7C66]">المبلغ: </span>
            <span className="text-[12px] text-gray-800">{numberToArabicWords(Number(invoice.total))}</span>
          </div>

          {/* === SIGNATURES === */}
          <div className="grid grid-cols-3 gap-4 mx-1 mt-6">
            <div className="border border-gray-300 rounded-lg p-3 text-center">
              <div className="text-[11px] font-bold text-[#0D7C66] mb-8">المحاسب</div>
              <div className="border-t border-dashed border-gray-400 pt-2">
                <span className="text-[10px] text-gray-500">
                  {useAppStore.getState().user?.full_name || 'علي محمد الصادق'}
                </span>
              </div>
            </div>
            <div className="border border-gray-300 rounded-lg p-3 text-center">
              <div className="text-[11px] font-bold text-[#0D7C66] mb-8">المستلم</div>
              <div className="border-t border-dashed border-gray-400 pt-2">
                <span className="text-[10px] text-gray-500">{invoice.receiver_name || ''}</span>
              </div>
            </div>
            <div className="border border-gray-300 rounded-lg p-3 text-center">
              <div className="text-[11px] font-bold text-[#0D7C66] mb-8">السائق</div>
              <div className="border-t border-dashed border-gray-400 pt-2">
                <span className="text-[10px] text-gray-500">{invoice.driver_name || ''}</span>
              </div>
            </div>
          </div>

          {/* === FOOTER === */}
          <div className="text-center pt-4 mt-6 border-t-2 border-[#0D7C66] mx-1 pb-4">
            {settings?.invoice_footer ? (
              <p className="text-[11px] text-gray-400">{settings.invoice_footer}</p>
            ) : (
              <p className="text-[11px] text-gray-400">شكراً لتعاملكم معنا</p>
            )}
            <p className="text-[10px] text-gray-300 mt-1">
              {settings?.factory_name || 'مصنع الصادق'} - نظام علي الصادق فقط
            </p>
          </div>
        </div>
      </div>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء الفاتورة</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من إلغاء الفاتورة {invoice.invoice_number}؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label>سبب الإلغاء *</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="أدخل سبب إلغاء الفاتورة..."
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelReason('')}>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive hover:bg-destructive/90">
              إلغاء الفاتورة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

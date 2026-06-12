'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Reservation, ReservationItem, Customer, Product, Branch } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CalendarHeart,
  Plus,
  Edit,
  Trash2,
  Search,
  Loader2,
  Clock,
  Phone,
  CalendarDays,
  Eye,
  Printer,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  X,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

// Event types
const EVENT_TYPES = [
  { value: 'wedding', label: 'زفاف' },
  { value: 'engagement', label: 'خطوبة' },
  { value: 'birthday', label: 'عيد ميلاد' },
  { value: 'conference', label: 'مؤتمر' },
  { value: 'corporate', label: 'مناسبة شركة' },
  { value: 'graduation', label: 'تخرج' },
  { value: 'baby_shower', label: 'حفلة مولود' },
  { value: 'other', label: 'أخرى' },
];

// Status config
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending: { label: 'قيد الانتظار', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  confirmed: { label: 'مؤكد', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  in_progress: { label: 'جاري التنفيذ', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  completed: { label: 'مكتمل', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  cancelled: { label: 'ملغي', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
};

export default function ReservationsPage() {
  const { user: currentUser, settings, hasPermission } = useAppStore();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailReservation, setDetailReservation] = useState<Reservation | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellingReservation, setCancellingReservation] = useState<Reservation | null>(null);

  // Form state
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_id: '' as string | null,
    event_type: 'other',
    event_date: '',
    event_time: '',
    notes: '',
    advance_payment: 0,
  });
  const [formItems, setFormItems] = useState<ReservationItem[]>([]);
  const [cancelReason, setCancelReason] = useState('');

  // Data lookups
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  // Mobile: expandable cards
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleCard = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    loadReservations();
    loadCustomers();
    loadProducts();
    loadBranches();
  }, []);

  const loadReservations = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('*, branches(id, name), customers(id, name, phone)')
        .order('event_date', { ascending: true });

      if (error) throw error;
      setReservations((data as unknown as Reservation[]) || []);
    } catch (err) {
      console.error('Load reservations error:', err);
      toast.error('حدث خطأ أثناء تحميل الحجوزات');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCustomers = async () => {
    try {
      const { data } = await supabase.from('customers').select('*').eq('is_active', true).order('name');
      if (data) setCustomers(data as Customer[]);
    } catch {}
  };

  const loadProducts = async () => {
    try {
      const { data } = await supabase.from('products').select('*').eq('is_active', true).order('name');
      if (data) setProducts(data as Product[]);
    } catch {}
  };

  const loadBranches = async () => {
    try {
      const { data } = await supabase.from('branches').select('*').eq('is_active', true).order('name');
      if (data) setBranches(data as Branch[]);
    } catch {}
  };

  const logAction = async (action: string, details: Record<string, unknown>) => {
    try {
      await supabase.from('audit_log').insert({ action, details });
    } catch {}
  };

  // Calculate totals
  const totalAmount = formItems.reduce((sum, item) => sum + item.total_price, 0);
  const remainingAmount = totalAmount - form.advance_payment;

  // Open add dialog
  const openAddDialog = () => {
    if (!hasPermission('reservations', 'create')) {
      toast.error('ليس لديك صلاحية إضافة حجز');
      return;
    }
    setEditingReservation(null);
    setForm({
      customer_name: '',
      customer_phone: '',
      customer_id: null,
      event_type: 'other',
      event_date: '',
      event_time: '',
      notes: '',
      advance_payment: 0,
    });
    setFormItems([]);
    setCustomerSearch('');
    setProductSearch('');
    setDialogOpen(true);
  };

  // Open edit dialog
  const openEditDialog = (reservation: Reservation) => {
    if (!hasPermission('reservations', 'edit')) {
      toast.error('ليس لديك صلاحية تعديل حجز');
      return;
    }
    setEditingReservation(reservation);
    setForm({
      customer_name: reservation.customer_name,
      customer_phone: reservation.customer_phone || '',
      customer_id: reservation.customer_id,
      event_type: reservation.event_type,
      event_date: reservation.event_date,
      event_time: reservation.event_time || '',
      notes: reservation.notes || '',
      advance_payment: reservation.advance_payment,
    });
    setFormItems(reservation.items || []);
    setCustomerSearch('');
    setProductSearch('');
    setDialogOpen(true);
  };

  // Add item to form
  const addItem = (product: Product) => {
    const existing = formItems.find((i) => i.product_id === product.id);
    if (existing) {
      updateItem(formItems.indexOf(existing), 'quantity', existing.quantity + 1);
      return;
    }
    setFormItems([
      ...formItems,
      {
        product_id: product.id,
        item_name: product.name,
        quantity: 1,
        unit_count: product.unit_count,
        unit_price: product.unit_price,
        total_price: product.unit_price * product.unit_count,
      },
    ]);
    setShowProductDropdown(false);
    setProductSearch('');
  };

  // Update form item
  const updateItem = (index: number, field: string, value: number | string) => {
    const updated = [...formItems];
    const item = updated[index];
    if (field === 'quantity') item.quantity = value as number;
    else if (field === 'unit_count') item.unit_count = value as number;
    else if (field === 'unit_price') item.unit_price = value as number;
    else if (field === 'item_name') item.item_name = value as string;
    // Recalculate total
    item.total_price = item.quantity * item.unit_price * item.unit_count;
    setFormItems(updated);
  };

  // Remove item from form
  const removeItem = (index: number) => {
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  // Select customer
  const selectCustomer = (customer: Customer) => {
    setForm({
      ...form,
      customer_name: customer.name,
      customer_phone: customer.phone || '',
      customer_id: customer.id,
    });
    setCustomerSearch('');
    setShowCustomerDropdown(false);
  };

  // Add new customer inline
  const addNewCustomer = async () => {
    if (!newCustomerName.trim()) {
      toast.error('يرجى إدخال اسم العميل');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          name: newCustomerName.trim(),
          phone: newCustomerPhone.trim() || null,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      const newCustomer = data as Customer;
      setCustomers([...customers, newCustomer]);
      selectCustomer(newCustomer);
      setShowAddCustomer(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      toast.success('تم إضافة العميل بنجاح');
    } catch (err) {
      console.error('Add customer error:', err);
      toast.error('حدث خطأ أثناء إضافة العميل');
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!form.customer_name.trim()) {
      toast.error('يرجى إدخال اسم العميل');
      return;
    }
    if (!form.event_date) {
      toast.error('يرجى تحديد تاريخ المناسبة');
      return;
    }
    if (!form.event_type) {
      toast.error('يرجى اختيار نوع المناسبة');
      return;
    }

    setSaving(true);
    try {
      const itemsToSave = formItems.map((item) => ({
        product_id: item.product_id,
        item_name: item.item_name,
        quantity: item.quantity,
        unit_count: item.unit_count,
        unit_price: item.unit_price,
        total_price: item.total_price,
      }));

      const reservationData = {
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim() || null,
        customer_id: form.customer_id || null,
        branch_id: currentUser?.branch_id || null,
        event_type: form.event_type,
        event_date: form.event_date,
        event_time: form.event_time || null,
        notes: form.notes.trim() || null,
        items: itemsToSave,
        total_amount: totalAmount,
        advance_payment: form.advance_payment,
        remaining_amount: remainingAmount,
        updated_at: new Date().toISOString(),
      };

      if (editingReservation) {
        // Update
        const { error } = await supabase
          .from('reservations')
          .update(reservationData)
          .eq('id', editingReservation.id);

        if (error) throw error;

        await logAction('update_reservation', {
          reservation_id: editingReservation.id,
          reservation_number: editingReservation.reservation_number,
          updated_by: currentUser?.id,
        });

        toast.success('تم تحديث الحجز بنجاح');
      } else {
        // Insert
        const { error } = await supabase
          .from('reservations')
          .insert({
            ...reservationData,
            status: 'pending',
            created_by: currentUser?.id,
          });

        if (error) throw error;

        await logAction('create_reservation', {
          customer_name: form.customer_name.trim(),
          event_type: form.event_type,
          event_date: form.event_date,
          created_by: currentUser?.id,
        });

        toast.success('تم إضافة الحجز بنجاح');
      }

      setDialogOpen(false);
      loadReservations();
    } catch (err: unknown) {
      console.error('Save reservation error:', err);
      let message = 'حدث خطأ أثناء الحفظ';
      if (err && typeof err === 'object' && 'message' in err) {
        message = (err as { message: string }).message || message;
      }
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel reservation
  const handleCancel = async () => {
    if (!cancellingReservation) return;

    try {
      const { error } = await supabase
        .from('reservations')
        .update({
          status: 'cancelled',
          cancel_reason: cancelReason.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cancellingReservation.id);

      if (error) throw error;

      await logAction('cancel_reservation', {
        reservation_id: cancellingReservation.id,
        reservation_number: cancellingReservation.reservation_number,
        cancel_reason: cancelReason,
        cancelled_by: currentUser?.id,
      });

      toast.success('تم إلغاء الحجز');
      setCancelDialogOpen(false);
      setCancellingReservation(null);
      setCancelReason('');
      loadReservations();
    } catch (err) {
      console.error('Cancel error:', err);
      toast.error('حدث خطأ أثناء إلغاء الحجز');
    }
  };

  // Change status
  const changeStatus = async (reservation: Reservation, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('reservations')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', reservation.id);

      if (error) throw error;

      await logAction('change_reservation_status', {
        reservation_id: reservation.id,
        reservation_number: reservation.reservation_number,
        old_status: reservation.status,
        new_status: newStatus,
        changed_by: currentUser?.id,
      });

      toast.success('تم تغيير حالة الحجز');
      loadReservations();
    } catch (err) {
      console.error('Status change error:', err);
      toast.error('حدث خطأ أثناء تغيير الحالة');
    }
  };

  // Delete reservation
  const handleDelete = async (reservation: Reservation) => {
    if (!hasPermission('reservations', 'delete')) {
      toast.error('ليس لديك صلاحية حذف حجز');
      return;
    }
    try {
      const { error } = await supabase
        .from('reservations')
        .delete()
        .eq('id', reservation.id);

      if (error) throw error;

      await logAction('delete_reservation', {
        reservation_id: reservation.id,
        reservation_number: reservation.reservation_number,
        deleted_by: currentUser?.id,
      });

      toast.success('تم حذف الحجز');
      loadReservations();
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('حدث خطأ أثناء الحذف');
    }
  };

  // Generate WhatsApp message
  const generateWhatsAppMessage = (reservation: Reservation): string => {
    const eventTypeLabel = EVENT_TYPES.find((e) => e.value === reservation.event_type)?.label || reservation.event_type;
    const statusLabel = STATUS_CONFIG[reservation.status]?.label || reservation.status;
    const factoryName = settings?.factory_name || 'مصنع الصادق';
    const factoryPhone = settings?.phone || '';

    let message = `━━━━━━━━━━━━━━━━━━\n`;
    message += `🏭 ${factoryName}\n`;
    message += `━━━━━━━━━━━━━━━━━━\n\n`;
    message += `مرحباً بك ⭐\n\n`;
    message += `نتشرف بتذكيركم بحجزكم المُسجّل لدينا:\n\n`;
    message += `📋 رقم الحجز: ${reservation.reservation_number}\n`;
    message += `🎉 المناسبة: ${eventTypeLabel}\n`;
    message += `📅 التاريخ: ${reservation.event_date}\n`;
    if (reservation.event_time) {
      message += `🕐 الوقت: ${reservation.event_time}\n`;
    }
    if (reservation.notes) {
      message += `📝 ملاحظات: ${reservation.notes}\n`;
    }
    message += `\n`;
    if (reservation.items && reservation.items.length > 0) {
      message += `📦 الأصناف:\n`;
      reservation.items.forEach((item, idx) => {
        message += `  ${idx + 1}. ${item.item_name} × ${item.quantity} = ${item.total_price.toFixed(2)} ج.م\n`;
      });
      message += `\n`;
    }
    message += `💳 تفاصيل الدفع:\n`;
    message += `💰 الإجمالي: ${reservation.total_amount.toFixed(2)} ج.م\n`;
    if (reservation.advance_payment > 0) {
      message += `💵 المقدّم: ${reservation.advance_payment.toFixed(2)} ج.م\n`;
      message += `🔄 المتبقي: ${reservation.remaining_amount.toFixed(2)} ج.م\n`;
    }
    message += `\n📌 الحالة: ${statusLabel}\n\n`;
    message += `نحن في انتظاركم ونتمنى لكم مناسبة سعيدة 🎊\n\n`;
    if (factoryPhone) {
      message += `للتواصل: ${factoryPhone}\n`;
    }
    message += `━━━━━━━━━━━━━━━━━━`;

    return message;
  };

  // Open WhatsApp
  const openWhatsApp = (reservation: Reservation) => {
    const phone = reservation.customer_phone;
    if (!phone) {
      toast.error('لا يوجد رقم هاتف للعميل');
      return;
    }

    const message = generateWhatsAppMessage(reservation);
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    const waUrl = `https://wa.me/${cleanPhone.startsWith('+') ? cleanPhone.substring(1) : cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');

    // Mark reminder as sent
    const today = new Date().toISOString().split('T')[0];
    const eventDate = reservation.event_date;
    const daysDiff = Math.ceil((new Date(eventDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff <= 1 && !reservation.reminder_2_sent) {
      supabase.from('reservations').update({ reminder_2_sent: true, updated_at: new Date().toISOString() }).eq('id', reservation.id).then(() => loadReservations());
    } else if (daysDiff <= 2 && !reservation.reminder_1_sent) {
      supabase.from('reservations').update({ reminder_1_sent: true, updated_at: new Date().toISOString() }).eq('id', reservation.id).then(() => loadReservations());
    }
  };

  // Print reservation receipt
  const printReservation = (reservation: Reservation) => {
    const eventTypeLabel = EVENT_TYPES.find((e) => e.value === reservation.event_type)?.label || reservation.event_type;
    const factoryName = settings?.factory_name || 'مصنع الصادق';
    const factoryAddress = settings?.address || '';
    const factoryPhone = settings?.phone || '';

    const printContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>إيصال حجز ${reservation.reservation_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 20px; max-width: 400px; margin: 0 auto; font-size: 12px; }
          .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #333; padding-bottom: 10px; }
          .header h1 { font-size: 18px; margin-bottom: 4px; }
          .header p { font-size: 10px; color: #666; }
          .info { margin-bottom: 12px; }
          .info-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #ddd; }
          .info-row .label { font-weight: bold; }
          .items { margin-bottom: 12px; }
          .items table { width: 100%; border-collapse: collapse; }
          .items th, .items td { padding: 4px 6px; text-align: right; border-bottom: 1px solid #eee; font-size: 11px; }
          .items th { background: #f5f5f5; font-weight: bold; }
          .totals { margin-bottom: 12px; }
          .total-row { display: flex; justify-content: space-between; padding: 4px 0; }
          .total-row.grand { font-weight: bold; font-size: 14px; border-top: 2px solid #333; padding-top: 8px; }
          .footer { text-align: center; margin-top: 15px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 10px; color: #888; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${factoryName}</h1>
          ${factoryAddress ? `<p>${factoryAddress}</p>` : ''}
          ${factoryPhone ? `<p>هاتف: ${factoryPhone}</p>` : ''}
        </div>
        <div class="info">
          <div class="info-row"><span class="label">رقم الحجز:</span><span>${reservation.reservation_number}</span></div>
          <div class="info-row"><span class="label">العميل:</span><span>${reservation.customer_name}</span></div>
          ${reservation.customer_phone ? `<div class="info-row"><span class="label">الهاتف:</span><span>${reservation.customer_phone}</span></div>` : ''}
          <div class="info-row"><span class="label">المناسبة:</span><span>${eventTypeLabel}</span></div>
          <div class="info-row"><span class="label">التاريخ:</span><span>${reservation.event_date}</span></div>
          ${reservation.event_time ? `<div class="info-row"><span class="label">الوقت:</span><span>${reservation.event_time}</span></div>` : ''}
        </div>
        ${reservation.items && reservation.items.length > 0 ? `
        <div class="items">
          <table>
            <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
            <tbody>
              ${reservation.items.map(item => `<tr><td>${item.item_name}</td><td>${item.quantity}</td><td>${item.unit_price.toFixed(2)}</td><td>${item.total_price.toFixed(2)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}
        <div class="totals">
          <div class="total-row"><span>الإجمالي:</span><span>${reservation.total_amount.toFixed(2)} ج.م</span></div>
          ${reservation.advance_payment > 0 ? `
          <div class="total-row"><span>المدفوع:</span><span>${reservation.advance_payment.toFixed(2)} ج.م</span></div>
          <div class="total-row grand"><span>المتبقي:</span><span>${reservation.remaining_amount.toFixed(2)} ج.م</span></div>
          ` : `<div class="total-row grand"><span>الإجمالي:</span><span>${reservation.total_amount.toFixed(2)} ج.م</span></div>`}
        </div>
        ${reservation.notes ? `<div style="margin-bottom:10px;padding:6px;background:#f9f9f9;border-radius:4px;font-size:11px;"><strong>ملاحظات:</strong> ${reservation.notes}</div>` : ''}
        <div class="footer">
          <p>تم إنشاء الحجز: ${new Date(reservation.created_at).toLocaleDateString('ar-EG')}</p>
          <p>شكراً لثقتكم بنا</p>
        </div>
        <script>window.print();</script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=450,height=700');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
    }
  };

  // Show reservation detail
  const showDetail = (reservation: Reservation) => {
    setDetailReservation(reservation);
    setDetailDialogOpen(true);
  };

  // Get upcoming reservations that need reminders
  const getReservationsNeedingReminders = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return reservations.filter((r) => {
      if (r.status === 'cancelled' || r.status === 'completed') return false;
      const eventDate = new Date(r.event_date);
      eventDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return (daysDiff === 2 && !r.reminder_1_sent) || (daysDiff === 1 && !r.reminder_2_sent) || daysDiff === 0;
    });
  };

  // Filter reservations
  const filteredReservations = reservations.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (eventTypeFilter !== 'all' && r.event_type !== eventTypeFilter) return false;
    if (dateFilter && r.event_date !== dateFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.customer_name.toLowerCase().includes(q) ||
        r.reservation_number.toLowerCase().includes(q) ||
        (r.customer_phone && r.customer_phone.includes(q))
      );
    }
    return true;
  });

  // Upcoming reminders
  const remindersNeeded = getReservationsNeedingReminders();

  // Filtered customers for search
  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone && c.phone.includes(customerSearch))
  );

  // Filtered products for search
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Reminder Alert Bar */}
      {remindersNeeded.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                  تنبيهات الحجوزات ({remindersNeeded.length})
                </span>
              </div>
              <div className="space-y-2">
                {remindersNeeded.slice(0, 3).map((r) => {
                  const eventDate = new Date(r.event_date);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  eventDate.setHours(0, 0, 0, 0);
                  const daysDiff = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  const reminderText = daysDiff === 0 ? 'اليوم!' : daysDiff === 1 ? 'غداً' : 'بعد يومين';

                  return (
                    <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white dark:bg-card p-2 rounded-lg border border-amber-200 dark:border-amber-800/50">
                      <div className="text-xs sm:text-sm">
                        <span className="font-medium">{r.customer_name}</span>
                        <span className="text-muted-foreground mx-1">-</span>
                        <span className="text-amber-700 dark:text-amber-400">{r.reservation_number}</span>
                        <span className="text-muted-foreground mx-1">-</span>
                        <span className="text-amber-700 dark:text-amber-400 font-semibold">{reminderText}</span>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 gap-1 text-[11px] bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => openWhatsApp(r)}
                      >
                        <MessageCircle className="w-3 h-3" />
                        واتساب
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
              <CalendarHeart className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold">الحجوزات والمناسبات</h1>
              <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
                إجمالي الحجوزات: <span className="font-semibold text-foreground">{reservations.length}</span>
              </p>
            </div>
          </div>
          <Button onClick={openAddDialog} className="gap-2 shadow-lg w-full sm:w-auto" style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
            <Plus className="w-4 h-4" />
            إضافة حجز
          </Button>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
        <Card className="border-0 shadow-md">
          <CardContent className="p-3 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم أو الرقم..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-9 h-9 text-sm"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="نوع المناسبة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المناسبات</SelectItem>
                  {EVENT_TYPES.map((et) => (
                    <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="h-9 text-sm"
                placeholder="تاريخ الحجز"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Reservations List */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <Card className="border-0 shadow-md overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                </div>
                <p className="text-muted-foreground text-sm">جاري تحميل الحجوزات...</p>
              </div>
            ) : filteredReservations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5 shadow-lg" style={{ background: 'linear-gradient(135deg, #c4b5fd, #8b5cf6)' }}>
                  <CalendarHeart className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-2">لا توجد حجوزات</h3>
                <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs">
                  لم يتم إضافة أي حجوزات بعد. أضف حجزاً لبدء إدارة المناسبات.
                </p>
                <Button onClick={openAddDialog} className="gap-2 shadow-lg" size="lg" style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
                  <Plus className="w-5 h-5" />
                  إضافة حجز جديد
                </Button>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block">
                  <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #8b5cf6, #7c3aed, #6d28d9)' }} />
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-right">رقم الحجز</TableHead>
                          <TableHead className="text-right">العميل</TableHead>
                          <TableHead className="text-right hidden md:table-cell">المناسبة</TableHead>
                          <TableHead className="text-right">التاريخ</TableHead>
                          <TableHead className="text-center">الحالة</TableHead>
                          <TableHead className="text-center hidden lg:table-cell">الإجمالي</TableHead>
                          <TableHead className="text-center">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredReservations.map((reservation) => {
                          const statusConf = STATUS_CONFIG[reservation.status] || STATUS_CONFIG.pending;
                          const eventTypeLabel = EVENT_TYPES.find((e) => e.value === reservation.event_type)?.label || reservation.event_type;

                          return (
                            <TableRow key={reservation.id} className="hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-colors">
                              <TableCell>
                                <span className="font-mono text-sm font-semibold text-purple-700 dark:text-purple-400">
                                  {reservation.reservation_number}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-sm">{reservation.customer_name}</p>
                                  {reservation.customer_phone && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Phone className="w-3 h-3" />
                                      {reservation.customer_phone}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-sm">{eventTypeLabel}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1 text-sm">
                                  <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                                  {reservation.event_date}
                                  {reservation.event_time && (
                                    <span className="text-muted-foreground text-xs flex items-center gap-0.5">
                                      <Clock className="w-3 h-3" />
                                      {reservation.event_time}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge className={`text-[11px] ${statusConf.bg} ${statusConf.color} ${statusConf.border} border`}>
                                  {statusConf.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center hidden lg:table-cell text-sm font-medium">
                                {reservation.total_amount.toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center gap-0.5">
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => showDetail(reservation)} title="تفاصيل">
                                    <Eye className="w-4 h-4 text-purple-600" />
                                  </Button>
                                  {reservation.status !== 'cancelled' && reservation.status !== 'completed' && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(reservation)} title="تعديل">
                                      <Edit className="w-4 h-4 text-purple-600" />
                                    </Button>
                                  )}
                                  {reservation.customer_phone && reservation.status !== 'cancelled' && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700" onClick={() => openWhatsApp(reservation)} title="واتساب">
                                      <MessageCircle className="w-4 h-4" />
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => printReservation(reservation)} title="طباعة">
                                    <Printer className="w-4 h-4 text-purple-600" />
                                  </Button>
                                  {hasPermission('reservations', 'delete') && reservation.status !== 'cancelled' && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setCancellingReservation(reservation); setCancelDialogOpen(true); }} title="إلغاء">
                                      <X className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Mobile Card Layout */}
                <div className="sm:hidden">
                  <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #8b5cf6, #7c3aed, #6d28d9)' }} />
                  <div className="divide-y">
                    {filteredReservations.map((reservation) => {
                      const statusConf = STATUS_CONFIG[reservation.status] || STATUS_CONFIG.pending;
                      const eventTypeLabel = EVENT_TYPES.find((e) => e.value === reservation.event_type)?.label || reservation.event_type;
                      const isExpanded = expandedCards.has(reservation.id);

                      return (
                        <motion.div
                          key={reservation.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="p-4 border-r-4 hover:bg-muted/30 transition-all"
                          style={{ borderRightColor: reservation.status === 'cancelled' ? '#ef4444' : reservation.status === 'completed' ? '#10b981' : '#8b5cf6' }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-purple-700 dark:text-purple-400">
                                  {reservation.reservation_number}
                                </span>
                                <Badge className={`text-[10px] ${statusConf.bg} ${statusConf.color} ${statusConf.border} border`}>
                                  {statusConf.label}
                                </Badge>
                              </div>
                              <p className="font-semibold text-sm mt-1">{reservation.customer_name}</p>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                <span className="flex items-center gap-1">
                                  <CalendarDays className="w-3 h-3" />
                                  {reservation.event_date}
                                </span>
                                <span>{eventTypeLabel}</span>
                              </div>
                            </div>
                            <button onClick={() => toggleCard(reservation.id)} className="p-1">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 space-y-2 border-t pt-3">
                              {reservation.customer_phone && (
                                <p className="text-xs flex items-center gap-1 text-muted-foreground">
                                  <Phone className="w-3 h-3" />
                                  {reservation.customer_phone}
                                </p>
                              )}
                              {reservation.event_time && (
                                <p className="text-xs flex items-center gap-1 text-muted-foreground">
                                  <Clock className="w-3 h-3" />
                                  {reservation.event_time}
                                </p>
                              )}
                              {reservation.notes && (
                                <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                                  {reservation.notes}
                                </p>
                              )}
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">الإجمالي</span>
                                <span className="font-semibold">{reservation.total_amount.toFixed(2)} ج.م</span>
                              </div>
                              {reservation.advance_payment > 0 && (
                                <>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">المدفوع</span>
                                    <span className="text-emerald-600">{reservation.advance_payment.toFixed(2)} ج.م</span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">المتبقي</span>
                                    <span className="text-amber-600 font-semibold">{reservation.remaining_amount.toFixed(2)} ج.م</span>
                                  </div>
                                </>
                              )}
                              {reservation.items && reservation.items.length > 0 && (
                                <div className="text-xs space-y-1">
                                  <span className="font-semibold">الأصناف:</span>
                                  {reservation.items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-muted-foreground pr-2">
                                      <span>{item.item_name} × {item.quantity}</span>
                                      <span>{item.total_price.toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center justify-end gap-1 pt-2">
                                <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => showDetail(reservation)}>
                                  <Eye className="w-3 h-3" />
                                  تفاصيل
                                </Button>
                                {reservation.status !== 'cancelled' && reservation.status !== 'completed' && (
                                  <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => openEditDialog(reservation)}>
                                    <Edit className="w-3 h-3" />
                                    تعديل
                                  </Button>
                                )}
                                {reservation.customer_phone && reservation.status !== 'cancelled' && (
                                  <Button size="sm" className="h-7 gap-1 text-[11px] bg-green-600 hover:bg-green-700 text-white" onClick={() => openWhatsApp(reservation)}>
                                    <MessageCircle className="w-3 h-3" />
                                    واتساب
                                  </Button>
                                )}
                                <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => printReservation(reservation)}>
                                  <Printer className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Add/Edit Reservation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
                <CalendarHeart className="w-4 h-4 text-white" />
              </div>
              {editingReservation ? 'تعديل الحجز' : 'إضافة حجز جديد'}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-180px)] pl-1">
            <div className="space-y-5 py-4 px-1">
              {/* Customer Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <div className="w-5 h-5 rounded flex items-center justify-center bg-purple-100 dark:bg-purple-900/30">
                    <span className="text-[10px] text-purple-700 dark:text-purple-400">1</span>
                  </div>
                  بيانات العميل
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">اسم العميل *</Label>
                    <div className="relative">
                      <Input
                        value={customerSearch || form.customer_name}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setForm({ ...form, customer_name: e.target.value, customer_id: null });
                          setShowCustomerDropdown(true);
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        placeholder="ابحث عن عميل أو اكتب اسم جديد"
                        className="h-9 text-sm"
                      />
                      {showCustomerDropdown && customerSearch && (
                        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                          {filteredCustomers.length > 0 ? (
                            filteredCustomers.slice(0, 5).map((c) => (
                              <button
                                key={c.id}
                                className="w-full text-right px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between"
                                onClick={() => selectCustomer(c)}
                              >
                                <span>{c.name}</span>
                                {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-2">
                              <button
                                className="text-sm text-purple-600 hover:underline"
                                onClick={() => {
                                  setShowAddCustomer(true);
                                  setNewCustomerName(customerSearch);
                                  setShowCustomerDropdown(false);
                                }}
                              >
                                + إضافة &quot;{customerSearch}&quot; كعميل جديد
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Add customer inline dialog */}
                    {showAddCustomer && (
                      <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                        <Input
                          placeholder="اسم العميل"
                          value={newCustomerName}
                          onChange={(e) => setNewCustomerName(e.target.value)}
                          className="h-8 text-sm"
                        />
                        <Input
                          placeholder="رقم الهاتف (واتساب)"
                          value={newCustomerPhone}
                          onChange={(e) => setNewCustomerPhone(e.target.value)}
                          className="h-8 text-sm"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-xs gap-1" style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }} onClick={addNewCustomer}>
                            <Plus className="w-3 h-3" /> إضافة
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddCustomer(false)}>إلغاء</Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">رقم الهاتف (واتساب)</Label>
                    <Input
                      value={form.customer_phone}
                      onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                      placeholder="01xxxxxxxxx"
                      className="h-9 text-sm"
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Event Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <div className="w-5 h-5 rounded flex items-center justify-center bg-purple-100 dark:bg-purple-900/30">
                    <span className="text-[10px] text-purple-700 dark:text-purple-400">2</span>
                  </div>
                  تفاصيل المناسبة
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">نوع المناسبة *</Label>
                    <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_TYPES.map((et) => (
                          <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">تاريخ المناسبة *</Label>
                    <Input
                      type="date"
                      value={form.event_date}
                      onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">الوقت</Label>
                    <Input
                      type="time"
                      value={form.event_time}
                      onChange={(e) => setForm({ ...form, event_time: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Items Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <div className="w-5 h-5 rounded flex items-center justify-center bg-purple-100 dark:bg-purple-900/30">
                    <span className="text-[10px] text-purple-700 dark:text-purple-400">3</span>
                  </div>
                  الأصناف والمنتجات
                </h3>

                {/* Product search */}
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="ابحث عن منتج لإضافته..."
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setShowProductDropdown(true);
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                    className="pr-9 h-9 text-sm"
                  />
                  {showProductDropdown && productSearch && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {filteredProducts.length > 0 ? (
                        filteredProducts.slice(0, 8).map((p) => (
                          <button
                            key={p.id}
                            className="w-full text-right px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between"
                            onClick={() => addItem(p)}
                          >
                            <span>{p.name}</span>
                            <span className="text-xs text-muted-foreground">{p.unit_price.toFixed(2)} ج.م</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-muted-foreground">لا توجد منتجات</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Items list */}
                {formItems.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="hidden sm:grid grid-cols-12 gap-2 bg-muted/50 p-2 text-xs font-medium">
                      <div className="col-span-4">الصنف</div>
                      <div className="col-span-2 text-center">الكمية</div>
                      <div className="col-span-2 text-center">المحتوي</div>
                      <div className="col-span-2 text-center">سعر الوحدة</div>
                      <div className="col-span-1 text-center">الإجمالي</div>
                      <div className="col-span-1"></div>
                    </div>
                    <div className="divide-y">
                      {formItems.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2 items-center">
                          <div className="sm:col-span-4 text-sm font-medium">{item.item_name}</div>
                          <div className="sm:col-span-2 flex items-center gap-1">
                            <Label className="text-[10px] sm:hidden">الكمية:</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                              className="h-7 text-sm text-center"
                            />
                          </div>
                          <div className="sm:col-span-2 flex items-center gap-1">
                            <Label className="text-[10px] sm:hidden">المحتوي:</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.unit_count}
                              onChange={(e) => updateItem(idx, 'unit_count', parseInt(e.target.value) || 1)}
                              className="h-7 text-sm text-center"
                            />
                          </div>
                          <div className="sm:col-span-2 flex items-center gap-1">
                            <Label className="text-[10px] sm:hidden">السعر:</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="h-7 text-sm text-center"
                            />
                          </div>
                          <div className="sm:col-span-1 text-sm text-center font-medium">{item.total_price.toFixed(2)}</div>
                          <div className="sm:col-span-1 flex justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(idx)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Totals */}
                <div className="flex flex-col items-end gap-2 text-sm">
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">الإجمالي:</span>
                    <span className="font-bold text-lg">{totalAmount.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <Label className="text-xs">الدفعة المقدمة:</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.advance_payment}
                      onChange={(e) => setForm({ ...form, advance_payment: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-sm w-32"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">المتبقي:</span>
                    <span className={`font-bold ${remainingAmount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {remainingAmount.toFixed(2)} ج.م
                    </span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs">ملاحظات</Label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="أي ملاحظات إضافية..."
                  className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={2}
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1 sm:flex-none">
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none gap-1" style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingReservation ? 'تحديث' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
                <CalendarHeart className="w-4 h-4 text-white" />
              </div>
              تفاصيل الحجز
            </DialogTitle>
          </DialogHeader>
          {detailReservation && (
            <ScrollArea className="max-h-[calc(90vh-180px)]">
              <div className="space-y-4 py-2 px-1">
                {/* Status badge */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-lg font-bold text-purple-700 dark:text-purple-400">
                    {detailReservation.reservation_number}
                  </span>
                  <Badge className={`${STATUS_CONFIG[detailReservation.status]?.bg} ${STATUS_CONFIG[detailReservation.status]?.color} ${STATUS_CONFIG[detailReservation.status]?.border} border`}>
                    {STATUS_CONFIG[detailReservation.status]?.label}
                  </Badge>
                </div>

                {/* Customer info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/30 rounded-lg p-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">العميل</Label>
                    <p className="text-sm font-medium">{detailReservation.customer_name}</p>
                  </div>
                  {detailReservation.customer_phone && (
                    <div>
                      <Label className="text-[10px] text-muted-foreground">الهاتف</Label>
                      <p className="text-sm font-medium" dir="ltr">{detailReservation.customer_phone}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-[10px] text-muted-foreground">المناسبة</Label>
                    <p className="text-sm font-medium">{EVENT_TYPES.find((e) => e.value === detailReservation.event_type)?.label || detailReservation.event_type}</p>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">التاريخ</Label>
                    <p className="text-sm font-medium">{detailReservation.event_date} {detailReservation.event_time && `- ${detailReservation.event_time}`}</p>
                  </div>
                  {detailReservation.branches && (
                    <div>
                      <Label className="text-[10px] text-muted-foreground">الفرع</Label>
                      <p className="text-sm font-medium">{detailReservation.branches.name}</p>
                    </div>
                  )}
                </div>

                {/* Items */}
                {detailReservation.items && detailReservation.items.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 p-2 text-xs font-medium">الأصناف</div>
                    <div className="divide-y">
                      {detailReservation.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 text-sm">
                          <div>
                            <span className="font-medium">{item.item_name}</span>
                            <span className="text-muted-foreground text-xs mr-2">× {item.quantity}</span>
                          </div>
                          <span className="font-medium">{item.total_price.toFixed(2)} ج.م</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payment */}
                <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">الإجمالي</span>
                    <span className="font-bold">{detailReservation.total_amount.toFixed(2)} ج.م</span>
                  </div>
                  {detailReservation.advance_payment > 0 && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">المدفوع</span>
                        <span className="text-emerald-600">{detailReservation.advance_payment.toFixed(2)} ج.م</span>
                      </div>
                      <div className="flex justify-between text-sm border-t pt-2">
                        <span className="text-muted-foreground">المتبقي</span>
                        <span className="text-amber-600 font-bold">{detailReservation.remaining_amount.toFixed(2)} ج.م</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Notes */}
                {detailReservation.notes && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <Label className="text-[10px] text-muted-foreground">ملاحظات</Label>
                    <p className="text-sm mt-1">{detailReservation.notes}</p>
                  </div>
                )}

                {/* Cancel reason */}
                {detailReservation.cancel_reason && (
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                    <Label className="text-[10px] text-red-600">سبب الإلغاء</Label>
                    <p className="text-sm mt-1 text-red-700 dark:text-red-400">{detailReservation.cancel_reason}</p>
                  </div>
                )}

                {/* Reminders */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    تذكير 1: {detailReservation.reminder_1_sent ? '✅ تم' : '⏳ لم يتم'}
                  </span>
                  <span className="flex items-center gap-1">
                    تذكير 2: {detailReservation.reminder_2_sent ? '✅ تم' : '⏳ لم يتم'}
                  </span>
                </div>

                {/* Status change actions */}
                {detailReservation.status !== 'cancelled' && detailReservation.status !== 'completed' && (
                  <div className="flex flex-wrap gap-2">
                    {detailReservation.status === 'pending' && (
                      <Button size="sm" className="h-8 gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { changeStatus(detailReservation, 'confirmed'); setDetailDialogOpen(false); }}>
                        تأكيد الحجز
                      </Button>
                    )}
                    {(detailReservation.status === 'pending' || detailReservation.status === 'confirmed') && (
                      <Button size="sm" className="h-8 gap-1 text-xs bg-orange-600 hover:bg-orange-700 text-white" onClick={() => { changeStatus(detailReservation, 'in_progress'); setDetailDialogOpen(false); }}>
                        جاري التنفيذ
                      </Button>
                    )}
                    <Button size="sm" className="h-8 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { changeStatus(detailReservation, 'completed'); setDetailDialogOpen(false); }}>
                        تم الإنجاز
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1 text-xs text-destructive border-destructive/30" onClick={() => {
                      setCancellingReservation(detailReservation);
                      setDetailDialogOpen(false);
                      setCancelDialogOpen(true);
                    }}>
                      إلغاء الحجز
                    </Button>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {detailReservation.customer_phone && detailReservation.status !== 'cancelled' && (
                    <Button className="gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => openWhatsApp(detailReservation)}>
                      <MessageCircle className="w-4 h-4" />
                      إرسال واتساب
                    </Button>
                  )}
                  <Button variant="outline" className="gap-1" onClick={() => printReservation(detailReservation)}>
                    <Printer className="w-4 h-4" />
                    طباعة
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-100 dark:bg-red-900/30">
                <X className="w-4 h-4 text-red-600" />
              </div>
              إلغاء الحجز
            </AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من إلغاء حجز &quot;{cancellingReservation?.reservation_number}&quot; للعميل &quot;{cancellingReservation?.customer_name}&quot;؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">سبب الإلغاء (اختياري)</Label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="أدخل سبب الإلغاء..."
              className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setCancellingReservation(null); setCancelReason(''); }}>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive hover:bg-destructive/90">
              إلغاء الحجز
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Click outside to close dropdowns */}
      {(showCustomerDropdown || showProductDropdown) && (
        <div className="fixed inset-0 z-40" onClick={() => { setShowCustomerDropdown(false); setShowProductDropdown(false); }} />
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import { formatCurrency, generateInvoiceNumber } from '@/lib/utils';
import type { Product, Customer, PaymentMethod } from '@/lib/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Printer,
  CheckCircle2,
  XCircle,
  Package,
  UserPlus,
  Loader2,
  Barcode,
  AlertTriangle,
  ArrowLeft,
  Hash,
  Phone,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────
interface CartItem {
  product_id: string;
  item_name: string;
  unit_price: number;
  unit_count: number;
  quantity: number;
  total_price: number;
  available_qty: number;
}

interface ProductWithInventory extends Product {
  inventory_qty?: number;
}

// ─── Component ────────────────────────────────────────────────────────────
export default function PosPage() {
  const { user, hasPermission } = useAppStore();

  // ─── State ──────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<ProductWithInventory[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [customerId, setCustomerId] = useState<string>('');
  const [receiverName, setReceiverName] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastInvoiceId, setLastInvoiceId] = useState<string>('');
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState<string>('');

  // New customer dialog
  const [newCustDialog, setNewCustDialog] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Low stock warning
  const [lowStockWarnings, setLowStockWarnings] = useState<string[]>([]);
  const [showMobileCart, setShowMobileCart] = useState(false);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Branch ID from user
  const branchId = user?.branch_id || '';

  // ─── Load data ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, [branchId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load products with inventory for this branch
      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name');

      // Load inventory for this branch
      const { data: inventoryData } = await supabase
        .from('inventory')
        .select('product_id, quantity')
        .eq('branch_id', branchId);

      const inventoryMap: Record<string, number> = {};
      (inventoryData || []).forEach((inv) => {
        inventoryMap[inv.product_id] = inv.quantity;
      });

      const productsWithInv: ProductWithInventory[] = (productsData || []).map((p) => ({
        ...p,
        inventory_qty: inventoryMap[p.id] || 0,
      }));

      setProducts(productsWithInv);

      // Load customers
      const { data: custData } = await supabase
        .from('customers')
        .select('*')
        .eq('is_active', true)
        .order('name');
      setCustomers(custData || []);

      // Load payment methods
      const { data: pmData } = await supabase
        .from('payment_methods')
        .select('*')
        .order('sort_order');
      setPaymentMethods(pmData || []);

      // Set default payment method
      if (pmData && pmData.length > 0) {
        const defaultPm = pmData.find((p) => p.is_default) || pmData[0];
        setPaymentMethodId(defaultPm.id);
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  // ─── Filtered products ──────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products.slice(0, 50);
    const q = searchQuery.trim().toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  // ─── Cart calculations ──────────────────────────────────────────────────
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.total_price, 0), [cart]);
  const taxRate = 0;
  const taxAmount = useMemo(() => subtotal * (taxRate / 100), [subtotal, taxRate]);
  const total = useMemo(() => subtotal + taxAmount, [subtotal, taxAmount]);
  const cartItemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  // ─── Add to cart ────────────────────────────────────────────────────────
  const addToCart = useCallback((product: ProductWithInventory) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id);
      const availableQty = product.inventory_qty || 0;

      if (existing) {
        // Check stock
        const newQty = existing.quantity + 1;
        const totalPieces = newQty * product.unit_count;
        if (totalPieces > availableQty && availableQty > 0) {
          toast.error(`الكمية المتاحة من ${product.name} هي ${availableQty} قطعة فقط`);
          return prev;
        }
        return prev.map((item) =>
          item.product_id === product.id
            ? {
                ...item,
                quantity: newQty,
                total_price: newQty * item.unit_price,
              }
            : item
        );
      }

      // Check if out of stock
      if (availableQty <= 0) {
        toast.error(`${product.name} غير متوفر في المخزون`);
        return prev;
      }

      return [
        ...prev,
        {
          product_id: product.id,
          item_name: product.name,
          unit_price: product.unit_price,
          unit_count: product.unit_count,
          quantity: 1,
          total_price: product.unit_price,
          available_qty: availableQty,
        },
      ];
    });
  }, []);

  // ─── Barcode scan ───────────────────────────────────────────────────────
  const handleBarcodeSubmit = useCallback(() => {
    if (!barcodeInput.trim()) return;
    const product = products.find(
      (p) => p.id.toLowerCase() === barcodeInput.trim().toLowerCase()
    );
    if (product) {
      addToCart(product);
      setBarcodeInput('');
    } else {
      toast.error('منتج غير موجود');
    }
    barcodeRef.current?.focus();
  }, [barcodeInput, products, addToCart]);

  // ─── Update quantity ────────────────────────────────────────────────────
  const updateQuantity = useCallback((productId: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product_id !== productId) return item;
        const newQty = item.quantity + delta;
        if (newQty <= 0) return item;
        // Check stock
        const totalPieces = newQty * item.unit_count;
        if (totalPieces > item.available_qty && item.available_qty > 0) {
          toast.error(`الكمية المتاحة هي ${item.available_qty} قطعة فقط`);
          return item;
        }
        return {
          ...item,
          quantity: newQty,
          total_price: newQty * item.unit_price,
        };
      })
    );
  }, []);

  // ─── Set exact quantity ─────────────────────────────────────────────────
  const setItemQuantity = useCallback((productId: string, qty: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product_id !== productId) return item;
        if (qty <= 0) return { ...item, quantity: 1, total_price: item.unit_price };
        const totalPieces = qty * item.unit_count;
        if (totalPieces > item.available_qty && item.available_qty > 0) {
          toast.error(`الكمية المتاحة هي ${item.available_qty} قطعة فقط`);
          return item;
        }
        return {
          ...item,
          quantity: qty,
          total_price: qty * item.unit_price,
        };
      })
    );
  }, []);

  // ─── Remove from cart ───────────────────────────────────────────────────
  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((item) => item.product_id !== productId));
  }, []);

  // ─── Clear cart ─────────────────────────────────────────────────────────
  const clearCart = useCallback(() => {
    setCart([]);
    setCustomerId('');
    setReceiverName('');
    setDriverName('');
    setDriverPhone('');
    setNotes('');
    setLowStockWarnings([]);
  }, []);

  // ─── Add new customer ──────────────────────────────────────────────────
  const handleAddCustomer = async () => {
    if (!newCustName.trim()) {
      toast.error('يرجى إدخال اسم العميل');
      return;
    }
    setSavingCustomer(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          name: newCustName.trim(),
          phone: newCustPhone.trim() || null,
          is_active: true,
        })
        .select('id, name, phone')
        .single();

      if (error) throw error;

      const newCustomer: Customer = {
        id: data.id,
        name: data.name,
        phone: data.phone || null,
        address: null,
        tax_number: null,
        is_active: true,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setCustomers((prev) => [...prev, newCustomer]);
      setCustomerId(data.id);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustDialog(false);
      toast.success('تم إضافة العميل بنجاح');
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء إضافة العميل');
    } finally {
      setSavingCustomer(false);
    }
  };

  // ─── Complete sale ──────────────────────────────────────────────────────
  const completeSale = async (andPrint = false) => {
    if (cart.length === 0) {
      toast.error('السلة فارغة');
      return;
    }

    if (!hasPermission('pos', 'create')) {
      toast.error('ليس لديك صلاحية إجراء عملية بيع');
      return;
    }

    // Check stock for all items
    const warnings: string[] = [];
    for (const item of cart) {
      const { data: invRecord } = await supabase
        .from('inventory')
        .select('quantity')
        .eq('product_id', item.product_id)
        .eq('branch_id', branchId)
        .single();

      const availableQty = invRecord?.quantity || 0;
      const totalPieces = item.quantity * item.unit_count;
      if (totalPieces > availableQty) {
        warnings.push(`${item.item_name}: مطلوب ${totalPieces} قطعة، متاح ${availableQty}`);
      }
    }

    if (warnings.length > 0) {
      setLowStockWarnings(warnings);
      toast.error('بعض المنتجات غير متوفرة بالكمية المطلوبة');
      return;
    }

    setSaving(true);
    try {
      // Generate invoice number
      const year = new Date().getFullYear();
      const { data: lastInvoice } = await supabase
        .from('invoices')
        .select('invoice_number')
        .like('invoice_number', `INV-${year}-%`)
        .order('invoice_number', { ascending: false })
        .limit(1);

      let lastNum = 0;
      if (lastInvoice && lastInvoice.length > 0) {
        const parts = lastInvoice[0].invoice_number.split('-');
        lastNum = parseInt(parts[parts.length - 1]) || 0;
      }
      const invoiceNumber = generateInvoiceNumber(lastNum, year);

      // Get today's date and time
      const now = new Date();
      const invoiceDate = now.toISOString().split('T')[0];
      const invoiceTime = now.toTimeString().split(' ')[0];

      // Create invoice
      const { data: invData, error: invError } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          branch_id: branchId,
          customer_id: customerId || null,
          invoice_date: invoiceDate,
          invoice_time: invoiceTime,
          receiver_name: receiverName || null,
          driver_name: driverName || null,
          driver_phone: driverPhone || null,
          subtotal,
          tax_rate: 0,
          tax_amount: taxAmount,
          total,
          notes: notes || null,
        })
        .select('id')
        .single();

      if (invError) throw invError;

      // Insert invoice items
      const itemsData = cart.map((item) => ({
        invoice_id: invData.id,
        item_name: item.item_name,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_count: item.unit_count,
        unit_price: item.unit_price,
        total_price: item.total_price,
      }));
      const { error: itemsError } = await supabase.from('invoice_items').insert(itemsData);
      if (itemsError) throw itemsError;

      // Update inventory and log transactions
      for (const item of cart) {
        const totalPieces = item.quantity * item.unit_count;

        const { data: invRecord } = await supabase
          .from('inventory')
          .select('*')
          .eq('product_id', item.product_id)
          .eq('branch_id', branchId)
          .single();

        if (invRecord) {
          const newQty = invRecord.quantity - totalPieces;
          await supabase
            .from('inventory')
            .update({
              quantity: Math.max(0, newQty),
              last_updated: new Date().toISOString(),
            })
            .eq('id', invRecord.id);
        }

        // Log inventory transaction
        await supabase.from('inventory_transactions').insert({
          product_id: item.product_id,
          branch_id: branchId,
          transaction_type: 'sale',
          quantity: -totalPieces,
          reference_type: 'invoice',
          reference_id: invData.id,
          notes: `نقطة بيع - فاتورة: ${invoiceNumber}`,
          created_by: user?.id || null,
        });
      }

      // Auto journal entry
      try {
        const { data: lastJe } = await supabase
          .from('journal_entries')
          .select('entry_number')
          .like('entry_number', `JE-${year}-%`)
          .order('entry_number', { ascending: false })
          .limit(1);
        let lastJeNum = 0;
        if (lastJe && lastJe.length > 0) {
          const parts = lastJe[0].entry_number.split('-');
          lastJeNum = parseInt(parts[parts.length - 1]) || 0;
        }
        const jeNum = `JE-${year}-${(lastJeNum + 1).toString().padStart(4, '0')}`;

        const jeLines: { account_name: string; debit: number; credit: number; description: string }[] = [];
        const customerOrCash = customerId ? 'العملاء' : 'الصندوق (كاش)';
        jeLines.push({
          account_name: customerOrCash,
          debit: total,
          credit: 0,
          description: `نقطة بيع - فاتورة رقم ${invoiceNumber}`,
        });
        jeLines.push({
          account_name: 'مبيعات الفروع',
          debit: 0,
          credit: subtotal,
          description: `نقطة بيع - فاتورة رقم ${invoiceNumber}`,
        });

        const { data: jeData } = await supabase
          .from('journal_entries')
          .insert({
            entry_number: jeNum,
            entry_date: invoiceDate,
            description: `قيد تلقائي - نقطة بيع فاتورة رقم ${invoiceNumber}`,
            total_debit: total,
            total_credit: subtotal + taxAmount,
            is_posted: true,
            source_type: 'invoice',
            source_id: invData.id,
            created_by: user?.id || null,
          })
          .select('id')
          .single();

        if (jeData) {
          await supabase.from('journal_entry_lines').insert(
            jeLines.map((line) => ({
              ...line,
              journal_entry_id: jeData.id,
            }))
          );
        }
      } catch (jeErr) {
        console.error('Auto journal entry error:', jeErr);
      }

      // Audit log
      await supabase.from('audit_log').insert({
        action: 'pos_sale',
        details: { invoice_number: invoiceNumber, total, branch_id: branchId },
      });

      setLastInvoiceId(invData.id);
      setLastInvoiceNumber(invoiceNumber);
      setShowSuccess(true);
      toast.success('تم إتمام عملية البيع بنجاح');

      if (andPrint && hasPermission('pos', 'print')) {
        // Navigate to invoice detail with print
        const { navigateTo } = useAppStore.getState();
        navigateTo('invoice-detail', { id: invData.id, print: 'true' });
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء إتمام عملية البيع');
    } finally {
      setSaving(false);
    }
  };

  // ─── Reset after success ────────────────────────────────────────────────
  const handleSuccessClose = () => {
    setShowSuccess(false);
    setShowMobileCart(false);
    clearCart();
  };

  // ─── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-muted-foreground">جاري تحميل نقطة البيع...</p>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className={`p-2 sm:p-4 ${cart.length > 0 ? 'pb-24 lg:pb-4' : ''}`}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold">نقطة البيع</h1>
            <p className="text-xs text-muted-foreground">
              فرع: {user?.branch_name || 'غير محدد'}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Badge>
      </div>

      {/* Main content - two columns on desktop, stacked on mobile */}
      <div style={{ display: 'flex', gap: '1rem', flexDirection: 'row' }} className="flex-col lg:flex-row">
        
        {/* ─── Left: Products ──────────────────────────────────────── */}
        <div style={{ flex: '1 1 60%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          
          {/* Search & Barcode */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', position: 'relative' }}>
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="بحث بالاسم أو الكود..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9 h-10"
              />
            </div>
            <div style={{ flex: '0 1 180px', position: 'relative' }}>
              <Barcode className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={barcodeRef}
                placeholder="باركود..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleBarcodeSubmit();
                }}
                className="pr-9 h-10"
              />
            </div>
          </div>

          {/* Products Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '0.5rem',
              maxHeight: 'calc(100dvh - 160px)',
              overflowY: 'auto',
              padding: '0.25rem',
            }}
          >
            {filteredProducts.map((product) => {
              const inCart = cart.find((c) => c.product_id === product.id);
              const isLow = (product.inventory_qty || 0) <= 0;
              return (
                <motion.button
                  key={product.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => addToCart(product)}
                  className={`
                    relative rounded-xl border-2 p-3 text-right transition-all duration-200
                    ${inCart
                      ? 'border-green-500 bg-green-50 dark:bg-green-950/30 shadow-md'
                      : isLow
                        ? 'border-red-200 bg-red-50/50 dark:bg-red-950/20 opacity-60'
                        : 'border-border bg-card hover:border-green-300 hover:shadow-md'
                    }
                  `}
                  disabled={isLow}
                >
                  {inCart && (
                    <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold shadow-md">
                      {inCart.quantity}
                    </div>
                  )}
                  <Package className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs font-semibold truncate mb-1">{product.name}</p>
                  <p className="text-xs text-green-600 dark:text-green-400 font-bold">
                    {formatCurrency(product.unit_price)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    المخزون: {product.inventory_qty || 0} قطعة
                  </p>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* ─── Right: Cart & Payment ────────────────────────────────── */}
        <div style={{ flex: '0 0 380px', minWidth: 0, flexDirection: 'column', gap: '0.75rem' }} className="hidden lg:flex w-full lg:w-auto">
          
          {/* Cart */}
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardHeader className="pb-2 pt-3 px-3">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShoppingCart className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-bold">سلة المشتريات</span>
                  {cartItemCount > 0 && (
                    <Badge className="bg-green-600 text-white text-[10px] h-5 min-w-5">{cartItemCount}</Badge>
                  )}
                </div>
                {cart.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7 text-xs"
                    onClick={clearCart}
                  >
                    <Trash2 className="w-3 h-3 ml-1" />
                    إفراغ
                  </Button>
                )}
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="flex-1 overflow-y-auto p-2" style={{ maxHeight: '300px', minHeight: '120px' }}>
              {cart.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 0' }}>
                  <ShoppingCart className="w-10 h-10 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">السلة فارغة</p>
                  <p className="text-[10px] text-muted-foreground/60">اضغط على المنتج لإضافته</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <AnimatePresence>
                    {cart.map((item) => (
                      <motion.div
                        key={item.product_id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="rounded-lg border bg-card p-2"
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="text-xs font-semibold truncate">{item.item_name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatCurrency(item.unit_price)} × {item.quantity} = {formatCurrency(item.total_price)}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-red-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                            onClick={() => removeFromCart(item.product_id)}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.375rem' }}>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => updateQuantity(item.product_id, -1)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val)) setItemQuantity(item.product_id, val);
                            }}
                            className="h-6 w-14 text-center text-xs p-0"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => updateQuantity(item.product_id, 1)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                          <span className="text-[10px] text-muted-foreground mr-auto">
                            متاح: {item.available_qty} قطعة
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>

            {/* Totals */}
            {cart.length > 0 && (
              <>
                <Separator />
                <div className="p-3 space-y-1.5 bg-muted/30">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-xs text-muted-foreground">المجموع الفرعي</span>
                    <span className="text-xs font-medium">{formatCurrency(subtotal)}</span>
                  </div>
                  {taxAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-xs text-muted-foreground">الضريبة</span>
                      <span className="text-xs font-medium">{formatCurrency(taxAmount)}</span>
                    </div>
                  )}
                  <Separator />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-sm font-bold">الإجمالي</span>
                    <span className="text-sm font-bold text-green-600">{formatCurrency(total)}</span>
                  </div>
                </div>
              </>
            )}
          </Card>

          {/* Payment Details */}
          <Card>
            <CardContent className="p-3 space-y-2.5">
              <p className="text-xs font-bold text-muted-foreground mb-1">بيانات الدفع</p>

              {/* Customer */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Label className="text-[10px] mb-1">العميل</Label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="اختر العميل" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="walk-in">عميل عادي (بدون حساب)</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` - ${c.phone}` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={() => setNewCustDialog(true)}
                  title="إضافة عميل جديد"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Payment method */}
              <div>
                <Label className="text-[10px] mb-1">طريقة الدفع</Label>
                <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="طريقة الدفع" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((pm) => (
                      <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Receiver / Driver - compact */}
              <details className="group">
                <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex items-center gap-1">
                  <span className="group-open:rotate-90 transition-transform">▶</span>
                  بيانات إضافية (اختياري)
                </summary>
                <div className="mt-2 space-y-2">
                  <Input
                    placeholder="اسم المستلم"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Input
                      placeholder="اسم السائق"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      className="h-8 text-xs"
                      style={{ flex: 1 }}
                    />
                    <Input
                      placeholder="تليفون السائق"
                      value={driverPhone}
                      onChange={(e) => setDriverPhone(e.target.value)}
                      className="h-8 text-xs"
                      style={{ flex: 1 }}
                    />
                  </div>
                  <Input
                    placeholder="ملاحظات"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </details>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.25rem' }}>
                <Button
                  className="flex-1 h-11 bg-green-600 hover:bg-green-700 text-white font-bold text-sm"
                  onClick={() => completeSale(false)}
                  disabled={saving || cart.length === 0}
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 ml-2" />
                  )}
                  {saving ? 'جاري الحفظ...' : 'إتمام البيع'}
                </Button>
                {hasPermission('pos', 'print') && (
                  <Button
                    variant="outline"
                    className="h-11 px-4 border-green-600 text-green-600 hover:bg-green-50"
                    onClick={() => completeSale(true)}
                    disabled={saving || cart.length === 0}
                    title="بيع وطباعة"
                  >
                    <Printer className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {/* Low stock warnings */}
              {lowStockWarnings.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-2">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-bold text-red-600">تحذير المخزون</span>
                  </div>
                  {lowStockWarnings.map((w, i) => (
                    <p key={i} className="text-[10px] text-red-500">{w}</p>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 text-[10px] h-6 mt-1"
                    onClick={() => setLowStockWarnings([])}
                  >
                    إغلاق
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── Mobile Bottom Bar ──────────────────────────────────────────── */}
      {cart.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 lg:hidden border-t bg-background/95 backdrop-blur-sm shadow-[0_-4px_20px_rgba(0,0,0,0.1)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5 text-white" />
                </div>
                <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold border-2 border-background">
                  {cartItemCount}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{cartItemCount} منتج في السلة</p>
                <p className="text-base font-bold text-green-600">{formatCurrency(total)}</p>
              </div>
            </div>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white font-bold h-11 px-6 rounded-xl"
              onClick={() => setShowMobileCart(true)}
            >
              عرض السلة
            </Button>
          </div>
        </div>
      )}

      {/* ─── Mobile Cart Dialog ──────────────────────────────────────────── */}
      <Dialog open={showMobileCart} onOpenChange={setShowMobileCart}>
        <DialogContent className="max-w-lg max-h-[92dvh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="p-4 pb-2 border-b flex-shrink-0">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShoppingCart className="w-5 h-5 text-green-600" />
                سلة المشتريات
                {cartItemCount > 0 && (
                  <Badge className="bg-green-600 text-white text-[10px] h-5 min-w-5">{cartItemCount}</Badge>
                )}
              </DialogTitle>
              {cart.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7 text-xs"
                  onClick={clearCart}
                >
                  <Trash2 className="w-3 h-3 ml-1" />
                  إفراغ
                </Button>
              )}
            </div>
          </DialogHeader>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ minHeight: 0 }}>
            {cart.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 0' }}>
                <ShoppingCart className="w-12 h-12 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">السلة فارغة</p>
                <p className="text-xs text-muted-foreground/60">اضغط على المنتج لإضافته</p>
              </div>
            ) : (
              <AnimatePresence>
                {cart.map((item) => (
                  <motion.div
                    key={item.product_id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="rounded-lg border bg-card p-2.5"
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="text-sm font-semibold truncate">{item.item_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(item.unit_price)} × {item.quantity} = {formatCurrency(item.total_price)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                        onClick={() => removeFromCart(item.product_id)}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.375rem' }}>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.product_id, -1)}
                        disabled={item.quantity <= 1}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val)) setItemQuantity(item.product_id, val);
                        }}
                        className="h-7 w-14 text-center text-xs p-0"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.product_id, 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                      <span className="text-[10px] text-muted-foreground mr-auto">
                        متاح: {item.available_qty}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Totals + Payment */}
          {cart.length > 0 && (
            <div className="border-t flex-shrink-0">
              {/* Totals */}
              <div className="p-3 space-y-1.5 bg-muted/30">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-xs text-muted-foreground">المجموع الفرعي</span>
                  <span className="text-xs font-medium">{formatCurrency(subtotal)}</span>
                </div>
                {taxAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-xs text-muted-foreground">الضريبة</span>
                    <span className="text-xs font-medium">{formatCurrency(taxAmount)}</span>
                  </div>
                )}
                <Separator />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-sm font-bold">الإجمالي</span>
                  <span className="text-sm font-bold text-green-600">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Payment details */}
              <div className="p-3 space-y-2.5">
                <p className="text-xs font-bold text-muted-foreground">بيانات الدفع</p>

                {/* Customer */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Label className="text-[10px] mb-1">العميل</Label>
                    <Select value={customerId} onValueChange={setCustomerId}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="اختر العميل" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="walk-in">عميل عادي</SelectItem>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` - ${c.phone}` : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 flex-shrink-0"
                    onClick={() => setNewCustDialog(true)}
                    title="إضافة عميل جديد"
                  >
                    <UserPlus className="w-4 h-4" />
                  </Button>
                </div>

                {/* Payment method */}
                <div>
                  <Label className="text-[10px] mb-1">طريقة الدفع</Label>
                  <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="طريقة الدفع" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((pm) => (
                        <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Extra details */}
                <details className="group">
                  <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex items-center gap-1">
                    <span className="group-open:rotate-90 transition-transform">▶</span>
                    بيانات إضافية (اختياري)
                  </summary>
                  <div className="mt-2 space-y-2">
                    <Input
                      placeholder="اسم المستلم"
                      value={receiverName}
                      onChange={(e) => setReceiverName(e.target.value)}
                      className="h-9 text-xs"
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Input
                        placeholder="اسم السائق"
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        className="h-9 text-xs"
                        style={{ flex: 1 }}
                      />
                      <Input
                        placeholder="تليفون السائق"
                        value={driverPhone}
                        onChange={(e) => setDriverPhone(e.target.value)}
                        className="h-9 text-xs"
                        style={{ flex: 1 }}
                      />
                    </div>
                    <Input
                      placeholder="ملاحظات"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </details>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.25rem' }}>
                  <Button
                    className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white font-bold text-sm"
                    onClick={() => { setShowMobileCart(false); completeSale(false); }}
                    disabled={saving || cart.length === 0}
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <CheckCircle2 className="w-4 h-4 ml-2" />}
                    {saving ? 'جاري الحفظ...' : 'إتمام البيع'}
                  </Button>
                  {hasPermission('pos', 'print') && (
                    <Button
                      variant="outline"
                      className="h-12 px-4 border-green-600 text-green-600 hover:bg-green-50"
                      onClick={() => { setShowMobileCart(false); completeSale(true); }}
                      disabled={saving || cart.length === 0}
                      title="بيع وطباعة"
                    >
                      <Printer className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {/* Low stock warnings */}
                {lowStockWarnings.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-2">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <span className="text-xs font-bold text-red-600">تحذير المخزون</span>
                    </div>
                    {lowStockWarnings.map((w, i) => (
                      <p key={i} className="text-[10px] text-red-500">{w}</p>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 text-[10px] h-6 mt-1"
                      onClick={() => setLowStockWarnings([])}
                    >
                      إغلاق
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Success Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <div className="mx-auto mb-3">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <DialogTitle className="text-green-600 text-lg">تم البيع بنجاح!</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              رقم الفاتورة: <span className="font-bold text-foreground">{lastInvoiceNumber}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              الإجمالي: <span className="font-bold text-green-600">{formatCurrency(total)}</span>
            </p>
          </div>
          <DialogFooter className="flex gap-2 sm:justify-center mt-2">
            <Button
              variant="outline"
              onClick={handleSuccessClose}
              className="flex-1"
            >
              بيع جديد
            </Button>
            {hasPermission('pos', 'print') && (
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => {
                  setShowSuccess(false);
                  const { navigateTo } = useAppStore.getState();
                  navigateTo('invoice-detail', { id: lastInvoiceId, print: 'true' });
                }}
              >
                <Printer className="w-4 h-4 ml-1" />
                طباعة
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── New Customer Dialog ─────────────────────────────────────────── */}
      <Dialog open={newCustDialog} onOpenChange={setNewCustDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UserPlus className="w-5 h-5 text-green-600" />
              إضافة عميل جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">اسم العميل *</Label>
              <Input
                placeholder="اسم العميل"
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">رقم الهاتف</Label>
              <Input
                placeholder="رقم الهاتف"
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCustDialog(false)}>
              إلغاء
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleAddCustomer}
              disabled={savingCustomer}
            >
              {savingCustomer ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

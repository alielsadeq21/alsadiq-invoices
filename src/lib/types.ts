export interface Settings {
  id: string;
  factory_name: string;
  address: string | null;
  phone: string | null;
  tax_number: string | null;
  logo_url: string | null;
  default_tax_rate: number;
  email: string | null;
  commercial_register: string | null;
  invoice_footer: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  username: string;
  password_hash: string;
  full_name: string;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  branch_id: string;
  invoice_date: string;
  invoice_time: string | null;
  receiver_name: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  status: 'active' | 'cancelled' | 'partially_returned' | 'fully_returned';
  cancel_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  branch?: Branch;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  item_name: string;
  quantity: number;
  unit_count: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

export interface Return {
  id: string;
  return_number: string;
  original_invoice_id: string;
  branch_id: string;
  return_date: string;
  total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  branch?: Branch;
  original_invoice?: Invoice;
  items?: ReturnItem[];
}

export interface ReturnItem {
  id: string;
  return_id: string;
  item_name: string;
  quantity: number;
  unit_count: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  unit_price: number;
  unit_count: number;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface InvoiceFormItem {
  item_name: string;
  quantity: number;
  unit_count: number;
  unit_price: number;
  total_price: number;
}

export interface DashboardStats {
  todayInvoices: number;
  todayTotal: number;
  todayReturns: number;
  activeBranches: number;
  netSpending: number;
}

export interface MonthlyData {
  month: string;
  total: number;
  returns: number;
  net: number;
}

export interface BranchSpending {
  branch_id: string;
  branch_name: string;
  total: number;
  invoice_count: number;
}

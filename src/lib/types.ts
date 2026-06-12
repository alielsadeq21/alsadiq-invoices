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
  bw_print: boolean;
  idle_timeout_minutes: number;
  created_at: string;
  updated_at: string;
}

// Permission types
export interface PagePermissions {
  view?: boolean;
  create?: boolean;
  edit?: boolean;
  delete?: boolean;
  print?: boolean;
  export?: boolean;
  adjust?: boolean;
  transfer?: boolean;
}

export interface Permissions {
  dashboard?: PagePermissions;
  branches?: PagePermissions;
  products?: PagePermissions;
  invoices?: PagePermissions;
  returns?: PagePermissions;
  payments?: PagePermissions;
  branch_accounts?: PagePermissions;
  account_statement?: PagePermissions;
  inventory?: PagePermissions;
  expenses?: PagePermissions;
  reports?: PagePermissions;
  accounting?: PagePermissions;
  users?: PagePermissions;
  roles?: PagePermissions;
  settings?: PagePermissions;
  activity_log?: PagePermissions;
  customers?: PagePermissions;
  payment_methods?: PagePermissions;
  expense_categories?: PagePermissions;
  chart_of_accounts?: PagePermissions;
  inventory_transfers?: PagePermissions;
  inventory_counts?: PagePermissions;
  accounting_reports?: PagePermissions;
  sales?: PagePermissions;
  pos?: PagePermissions;
  reservations?: PagePermissions;
}

export interface Role {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  permissions: Permissions;
  is_system: boolean;
  created_at: string;
}

export interface User {
  id: string;
  username: string;
  password_hash: string;
  full_name: string;
  role_id: string | null;
  branch_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  role?: Role;
  branch?: Branch;
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
  customer_id: string | null;
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
  customers?: { name: string; phone: string | null } | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  item_name: string;
  product_id: string | null;
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
  product_id: string | null;
  quantity: number;
  unit_count: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  code: string | null;
  barcode: string | null;
  description: string | null;
  unit_price: number;
  cost_price: number;
  unit_count: number;
  unit_type: string;
  category: string | null;
  subcategory: string | null;
  min_stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface Payment {
  id: string;
  payment_number: string;
  branch_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  notes: string | null;
  created_at: string;
  branch?: Branch;
}

export interface PaymentMethod {
  id: string;
  name: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
}

export interface BranchAccount {
  branch_id: string;
  branch_name: string;
  total_invoiced: number;
  total_returned: number;
  total_paid: number;
  balance: number;
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
  expenses: number;
  net: number;
}

export interface BranchSpending {
  branch_id: string;
  branch_name: string;
  total: number;
  invoice_count: number;
}

export interface AccountStatementEntry {
  date: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  type: 'invoice' | 'payment' | 'return';
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  tax_number: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  expense_number: string;
  branch_id: string;
  category_id: string | null;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: string;
  notes: string | null;
  created_by: string | null;
  journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
  branches?: Branch;
  expense_categories?: ExpenseCategory;
}

// Reservation Types
export interface ReservationItem {
  product_id: string | null;
  item_name: string;
  quantity: number;
  unit_count: number;
  unit_price: number;
  total_price: number;
}

export interface Reservation {
  id: string;
  reservation_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  branch_id: string | null;
  event_type: string;
  event_date: string;
  event_time: string | null;
  notes: string | null;
  items: ReservationItem[];
  total_amount: number;
  advance_payment: number;
  remaining_amount: number;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  cancel_reason: string | null;
  reminder_1_sent: boolean;
  reminder_2_sent: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  branches?: Branch;
  customers?: { name: string; phone: string | null } | null;
}

// Phase 3 Types

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  name_en: string | null;
  parent_id: string | null;
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  is_active: boolean;
  is_system: boolean;
  balance: number;
  created_at: string;
  updated_at: string;
  children?: ChartOfAccount[];
  parent?: { name: string } | null;
}

export interface InventoryTransfer {
  id: string;
  transfer_number: string;
  from_branch_id: string;
  to_branch_id: string;
  transfer_date: string;
  total_amount: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  notes: string | null;
  created_by: string | null;
  journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
  from_branch?: Branch;
  to_branch?: Branch;
  items?: InventoryTransferItem[];
}

export interface InventoryTransferItem {
  id: string;
  transfer_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
  products?: Product;
}

export interface InventoryCount {
  id: string;
  count_number: string;
  branch_id: string;
  count_date: string;
  status: 'draft' | 'confirmed' | 'cancelled';
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  branches?: Branch;
  items?: InventoryCountItem[];
}

export interface InventoryCountItem {
  id: string;
  count_id: string;
  product_id: string;
  system_quantity: number;
  actual_quantity: number;
  difference: number;
  notes: string | null;
  created_at: string;
  products?: Product;
}

export interface BranchDebt {
  branch_id: string;
  branch_name: string;
  total_transferred: number;
  total_paid: number;
  remaining_debt: number;
}

export interface Inventory {
  id: string;
  product_id: string;
  branch_id: string;
  quantity: number;
  min_quantity: number;
  last_updated: string;
  products?: Product;
  branches?: Branch;
}

export interface InventoryTransaction {
  id: string;
  product_id: string;
  branch_id: string;
  transaction_type: 'in' | 'out' | 'adjust' | 'transfer';
  quantity: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  products?: Product;
  branches?: Branch;
}

export interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  total_debit: number;
  total_credit: number;
  is_posted: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  lines?: JournalEntryLine[];
}

export interface JournalEntryLine {
  id: string;
  journal_entry_id: string;
  account_name: string;
  debit: number;
  credit: number;
  description: string | null;
  created_at: string;
}

// Default permissions for each role
export const DEFAULT_ADMIN_PERMISSIONS: Permissions = {
  dashboard: { view: true },
  branches: { view: true, create: true, edit: true, delete: true },
  products: { view: true, create: true, edit: true, delete: true },
  invoices: { view: true, create: true, edit: true, delete: true, print: true, export: true },
  returns: { view: true, create: true, print: true, export: true },
  payments: { view: true, create: true, print: true, export: true },
  branch_accounts: { view: true, export: true },
  account_statement: { view: true, print: true, export: true },
  inventory: { view: true, create: true, edit: true, adjust: true, transfer: true },
  expenses: { view: true, create: true, edit: true, delete: true, print: true, export: true },
  reports: { view: true, export: true },
  accounting: { view: true, create: true, edit: true, export: true },
  users: { view: true, create: true, edit: true, delete: true },
  roles: { view: true, create: true, edit: true, delete: true },
  settings: { view: true, edit: true },
  activity_log: { view: true },
  customers: { view: true, create: true, edit: true, delete: true },
  payment_methods: { view: true, create: true, edit: true, delete: true },
  expense_categories: { view: true, create: true, edit: true, delete: true },
  chart_of_accounts: { view: true, create: true, edit: true, delete: true },
  inventory_transfers: { view: true, create: true, edit: true },
  inventory_counts: { view: true, create: true, edit: true },
  accounting_reports: { view: true, export: true },
  sales: { view: true, export: true },
  pos: { view: true, create: true, print: true },
  reservations: { view: true, create: true, edit: true, delete: true, print: true },
};

export const DEFAULT_BRANCH_MANAGER_PERMISSIONS: Permissions = {
  dashboard: { view: true },
  pos: { view: true, create: true, print: true },
  invoices: { view: true, create: true, edit: true, print: true, export: true },
  returns: { view: true, create: true, print: true, export: true },
  payments: { view: true, create: true, print: true, export: true },
  branch_accounts: { view: true },
  account_statement: { view: true, print: true, export: true },
  customers: { view: true, create: true },
  reports: { view: true, export: true },
  settings: { view: true },
  sales: { view: true, export: true },
  reservations: { view: true, create: true, edit: true, print: true },
};

export const DEFAULT_WAREHOUSE_KEEPER_PERMISSIONS: Permissions = {
  inventory: { view: true, create: true, edit: true, adjust: true },
};

export const DEFAULT_CASHIER_PERMISSIONS: Permissions = {
  pos: { view: true, create: true, print: true },
  invoices: { view: true, print: true },
  returns: { view: true, create: true },
  customers: { view: true, create: true },
  reservations: { view: true, create: true, print: true },
};

export const DEFAULT_ACCOUNTANT_PERMISSIONS: Permissions = {
  dashboard: { view: true },
  reports: { view: true, export: true },
  accounting: { view: true, create: true, edit: true, export: true },
  branch_accounts: { view: true, export: true },
  account_statement: { view: true, print: true, export: true },
  sales: { view: true, export: true },
};

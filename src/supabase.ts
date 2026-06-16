import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mmztrbtgulaljjqwvuqs.supabase.co";
const SUPABASE_KEY = "sb_publishable_y0joPgjnbNSwt9R-aXgcAA_vn-ulPcy";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export type UserRole = "owner" | "manager" | "cashier";

export interface AppUser {
  id: string;
  name: string;
  pin: string;
  role: UserRole;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  buy_price: number;
  sell_price: number;
  current_stock: number;
  open_stock: number;
  stock_type: "units" | "carton";
  units_per_carton: number;
  low_stock_threshold: number;
  is_fridge_item: boolean;
  restock_added?: number;
}

export interface SaleTransaction {
  id: string;
  cashier_id: string;
  sale_date: string;
  total_amount: number;
  is_voided: boolean;
  voided_at?: string;
  voided_by?: string;
  created_at: string;
}

export interface SaleItem {
  id: string;
  transaction_id: string;
  product_id: string;
  quantity_units: number;
  unit_price: number;
  total_price: number;
  sale_date: string;
  user_id: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  recorded_by: string;
  expense_date: string;
  created_at: string;
}

export interface Credit {
  id: string;
  customer_name: string;
  phone?: string;
  amount_owed: number;
  recorded_by: string;
  created_at: string;
  notes?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  created_at: string;
}

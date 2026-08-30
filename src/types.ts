export type Role = "owner" | "staff";
export type PaymentMethod = "cash" | "gcash";
export type Screen =
  | "home"
  | "dashboard"
  | "sale"
  | "event_sale"
  | "orders"
  | "printers"
  | "filaments"
  | "price_list"
  | "missed"
  | "correct"
  | "products"
  | "inventory"
  | "reports"
  | "shop"
  | "more";

export interface Category {
  id: string;
  name: string;
}
export interface ProductVariant {
  id: string;
  name: string;
  price_override: number | null;
  quantity_on_hand: number;
  active: boolean;
}
export interface AlphabetLetter {
  letter: string;
  quantity_on_hand: number;
  needs_stock_count: boolean;
}
export interface AlphabetStyle {
  id: string;
  name: string;
  letters: AlphabetLetter[];
}
export interface Product {
  id: string;
  business_id: string;
  name: string;
  regular_price: number | null;
  sale_price: number | null;
  image_url: string | null;
  variant_label: string | null;
  letters_required: number;
  alphabet_style: AlphabetStyle | null;
  variants: ProductVariant[];
  quantity_on_hand: number;
  low_stock_threshold: number;
  category_id: string | null;
  active: boolean;
  needs_stock_count: boolean;
}
export interface CartItem {
  product: Product;
  variant: ProductVariant | null;
  quantity: number;
  unitPrice: number;
  selectedLetters: string[];
}
export interface Profile {
  id: string;
  display_name: string;
}
export interface Business {
  id: string;
  name: string;
  logo_url: string | null;
  role: Role;
}
export interface Location {
  id: string;
  business_id: string;
  name: string;
}
export interface SaleItemSummary {
  product_name: string;
  variant_name: string | null;
  quantity: number;
  selected_letters: string[] | null;
}
export interface Sale {
  id: string;
  receipt_number: number;
  payment_method: PaymentMethod;
  total: number;
  status: "completed" | "voided";
  created_at: string;
  payment_confirmed_at: string | null;
  payment_reference: string | null;
  sale_items: SaleItemSummary[];
}

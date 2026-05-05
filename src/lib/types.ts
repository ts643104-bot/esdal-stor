export type Product = {
  id: string;
  name: string;
  price_egp: number;
  image_url: string;
  category: string;
  in_stock: boolean;
  description?: string;
  stock_quantity?: number;
};

export type CartItem = {
  product: Product;
  qty: number;
};

export type Order = {
  id: string;
  date: string;
  items: CartItem[];
  total: number;
  status: "pending" | "completed";
  paymentMethod: "cod" | "online";
  senderPhone?: string;
  customerPhone?: string;
  customerName?: string;
  customerAddress?: string;
  preferredTime?: string;
  preferredDate?: string;
  discountApplied?: number;
  governorate?: string;
  shippingCost?: number;
};

export type StoreSettings = {
  discountPercentage: number;
};

export type Expense = {
  id: string;
  name: string;
  amount: number;
  date: string;
};

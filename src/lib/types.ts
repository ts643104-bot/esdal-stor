export type Product = {
  id: string;
  name: string;
  price_egp: number;
  image_url: string;
  images?: string[];
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
  userId?: string;
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
  loyaltyPointsEarned?: number;
  loyaltyPointsRedeemed?: number;
  paymentReceiptUrl?: string;
  note?: string;
};

export type StoreSettings = {
  discountPercentage: number;
  lowStockThreshold?: number;
};

export type PromoCode = {
  id: string;
  code: string;
  discountPercentage: number;
  isActive: boolean;
};

export type UserProfile = {
  id: string;
  name: string;
  phone: string;
  address: string;
  governorate: string;
  joinedAt?: string;
  loyaltyPoints?: number;
  totalEarnedPoints?: number;
};

export type Expense = {
  id: string;
  name: string;
  amount: number;
  date: string;
};

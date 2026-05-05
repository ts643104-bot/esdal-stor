import type { Product, CartItem, Order, Expense, StoreSettings } from "./types";
import { supabase, hasSupabase } from "./supabase";

const getLocalProducts = (): Product[] => {
  const stored = localStorage.getItem("esdal_products");
  if (stored) return JSON.parse(stored);
  
  const fb: Product[] = [
    {
      id: "esdal-001",
      name: "إسدال صلاة سادة (كريب)",
      price_egp: 450,
      image_url: "https://images.unsplash.com/photo-1736342182213-6c037467cb38?fm=jpg&q=60&w=1200&auto=format&fit=crop",
      category: "إسدالات",
      in_stock: true,
      description: "قماش كريب خفيف – مناسب للاستخدام اليومي."
    },
    {
      id: "abaya-002",
      name: "عباية سوداء كلاسيك",
      price_egp: 750,
      image_url: "https://images.unsplash.com/photo-1750190321725-65a717efc8a6?fm=jpg&q=60&w=1200&auto=format&fit=crop",
      category: "ملابس تقليدية",
      in_stock: true,
      description: "قصّة مريحة ولمسة نهائية أنيقة."
    }
  ];
  localStorage.setItem("esdal_products", JSON.stringify(fb));
  return fb;
};

export const db = {
  getProducts: async (): Promise<Product[]> => {
    if (hasSupabase && supabase) {
      const { data, error } = await supabase.from('products').select('*');
      if (!error && data) return data as Product[];
    }
    return getLocalProducts();
  },
  saveProducts: async (products: Product[]) => {
    if (hasSupabase && supabase) {
      await supabase.from('products').upsert(products);
    } else {
      localStorage.setItem("esdal_products", JSON.stringify(products));
    }
  },
  deleteProduct: async (id: string) => {
    if (hasSupabase && supabase) {
      await supabase.from('products').delete().eq('id', id);
    } else {
      const stored = getLocalProducts().filter(p => p.id !== id);
      localStorage.setItem("esdal_products", JSON.stringify(stored));
    }
  },
  getOrders: async (): Promise<Order[]> => {
    if (hasSupabase && supabase) {
      const { data, error } = await supabase.from('orders').select('*').order('date', { ascending: false });
      if (!error && data) return data as Order[];
    }
    const stored = localStorage.getItem("esdal_orders");
    return stored ? JSON.parse(stored) : [];
  },
  getOrderById: async (id: string): Promise<Order | null> => {
    if (hasSupabase && supabase) {
      const { data, error } = await supabase.from('orders').select('*').eq('id', id).single();
      if (!error && data) return data as Order;
    }
    const stored = localStorage.getItem("esdal_orders");
    const orders: Order[] = stored ? JSON.parse(stored) : [];
    return orders.find((o) => o.id === id) || null;
  },
  addOrder: async (items: CartItem[], total: number, paymentMethod: "cod" | "online" = "cod", senderPhone?: string, customerName?: string, customerAddress?: string, customerPhone?: string, governorate?: string, shippingCost?: number, preferredTime?: string, discountApplied?: number, preferredDate?: string): Promise<string> => {
    const newOrder: Order = {
      id: Math.random().toString(36).substring(2, 9).toUpperCase(),
      date: new Date().toISOString(),
      items,
      total,
      status: "pending",
      paymentMethod,
      senderPhone,
      customerName,
      customerAddress,
      customerPhone,
      governorate,
      shippingCost,
      preferredTime,
      preferredDate,
      discountApplied
    };
    if (hasSupabase && supabase) {
      await supabase.from('orders').insert([newOrder]);
    } else {
      const orders = await db.getOrders();
      orders.unshift(newOrder);
      localStorage.setItem("esdal_orders", JSON.stringify(orders));
    }
    return newOrder.id;
  },
  updateOrderStatus: async (id: string, status: "pending" | "completed") => {
    if (hasSupabase && supabase) {
      await supabase.from('orders').update({ status }).eq('id', id);
    } else {
      const orders = await db.getOrders();
      const updated = orders.map(o => o.id === id ? { ...o, status } : o);
      localStorage.setItem("esdal_orders", JSON.stringify(updated));
    }
  },
  deductStock: async (items: CartItem[]) => {
    const products = await db.getProducts();
    let updatedProducts = [...products];
    for (const item of items) {
      updatedProducts = updatedProducts.map(p => {
        if (p.id === item.product.id) {
          const currentStock = p.stock_quantity ?? 10;
          const newStock = Math.max(0, currentStock - item.qty);
          return { ...p, stock_quantity: newStock, in_stock: newStock > 0 };
        }
        return p;
      });
    }
    await db.saveProducts(updatedProducts);
  },
  clearOrders: async () => {
    if (hasSupabase && supabase) {
      // Typically, you wouldn't clear all orders in a real DB, but for parity:
      await supabase.from('orders').delete().neq('id', '0');
    } else {
      localStorage.setItem("esdal_orders", "[]");
    }
  },
  getExpenses: async (): Promise<Expense[]> => {
    if (hasSupabase && supabase) {
      const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
      if (!error && data) return data as Expense[];
    }
    const stored = localStorage.getItem("esdal_expenses");
    return stored ? JSON.parse(stored) : [];
  },
  saveExpenses: async (expenses: Expense[]) => {
    // Local storage rewrites the whole array. For Supabase, we use upsert or insert.
    // It's safer to just provide addExpense and deleteExpense.
    // For simplicity of migrating current logic:
    if (hasSupabase && supabase) {
      await supabase.from('expenses').upsert(expenses);
    } else {
      localStorage.setItem("esdal_expenses", JSON.stringify(expenses));
    }
  },
  deleteExpense: async (id: string) => {
    if (hasSupabase && supabase) {
      await supabase.from('expenses').delete().eq('id', id);
    } else {
      const expenses = await db.getExpenses();
      const updated = expenses.filter(e => e.id !== id);
      localStorage.setItem("esdal_expenses", JSON.stringify(updated));
    }
  },
  getSettings: async (): Promise<StoreSettings> => {
    try {
      if (hasSupabase && supabase) {
        const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
        if (!error && data) return data as StoreSettings;
      }
    } catch(e) {}
    const stored = localStorage.getItem("esdal_settings");
    return stored ? JSON.parse(stored) : { discountPercentage: 0 };
  },
  saveSettings: async (settings: StoreSettings) => {
    try {
      if (hasSupabase && supabase) {
        await supabase.from('settings').upsert({ id: 1, ...settings });
      }
    } catch(e) {}
    localStorage.setItem("esdal_settings", JSON.stringify(settings));
  }
};

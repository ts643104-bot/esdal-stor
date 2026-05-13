import type { Product, CartItem, Order, Expense, StoreSettings, UserProfile, PromoCode } from "./types";
import { dbFirestore, hasFirebase } from "./firebase";
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, updateDoc, query, orderBy, where, runTransaction } from "firebase/firestore";

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
    if (hasFirebase && dbFirestore) {
      const q = collection(dbFirestore, "products");
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Product[];
      if (data.length > 0) return data;
    }
    return getLocalProducts();
  },
  saveProducts: async (products: Product[]) => {
    if (hasFirebase && dbFirestore) {
      for (const p of products) {
        if (!p.id) p.id = Math.random().toString(36).substring(2, 9).toUpperCase();
        await setDoc(doc(dbFirestore, "products", p.id), p);
      }
    } else {
      localStorage.setItem("esdal_products", JSON.stringify(products));
    }
  },
  deleteProduct: async (id: string) => {
    if (hasFirebase && dbFirestore) {
      await deleteDoc(doc(dbFirestore, "products", id));
    } else {
      const stored = getLocalProducts().filter(p => p.id !== id);
      localStorage.setItem("esdal_products", JSON.stringify(stored));
    }
  },
  getOrders: async (): Promise<Order[]> => {
    if (hasFirebase && dbFirestore) {
      const q = query(collection(dbFirestore, "orders"), orderBy("date", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), id: d.id })) as Order[];
    }
    const stored = localStorage.getItem("esdal_orders");
    return stored ? JSON.parse(stored) : [];
  },
  getOrdersByUser: async (userId: string): Promise<Order[]> => {
    if (hasFirebase && dbFirestore) {
      const q = query(collection(dbFirestore, "orders"), where("userId", "==", userId));
      const snap = await getDocs(q);
      const arr = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Order[];
      return arr.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    const stored = localStorage.getItem("esdal_orders");
    const allOrders: Order[] = stored ? JSON.parse(stored) : [];
    return allOrders.filter(o => o.userId === userId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },
  getOrderById: async (id: string): Promise<Order | null> => {
    if (hasFirebase && dbFirestore) {
      const docRef = doc(dbFirestore, "orders", id);
      const snap = await getDoc(docRef);
      if (snap.exists()) return { ...snap.data(), id: snap.id } as Order;
    }
    const stored = localStorage.getItem("esdal_orders");
    const orders: Order[] = stored ? JSON.parse(stored) : [];
    return orders.find((o) => o.id === id) || null;
  },
  addOrder: async (
    items: CartItem[], total: number, paymentMethod: "cod" | "online" = "cod", 
    senderPhone?: string, customerName?: string, customerAddress?: string, 
    customerPhone?: string, governorate?: string, shippingCost?: number, 
    preferredTime?: string, discountApplied?: number, preferredDate?: string,
    userId?: string, loyaltyPointsEarned?: number, loyaltyPointsRedeemed?: number, paymentReceiptUrl?: string
  ): Promise<string> => {
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
      discountApplied,
      userId,
      loyaltyPointsEarned,
      loyaltyPointsRedeemed,
      paymentReceiptUrl
    };
    if (hasFirebase && dbFirestore) {
      await setDoc(doc(dbFirestore, "orders", newOrder.id), newOrder);
    } else {
      const orders = await db.getOrders();
      orders.unshift(newOrder);
      localStorage.setItem("esdal_orders", JSON.stringify(orders));
    }
    
    // Update loyalty points if userId is provided
    if (userId) {
      const profile = await db.getUserProfile(userId);
      if (profile) {
        const currentPoints = profile.loyaltyPoints || 0;
        const totalEarned = profile.totalEarnedPoints || 0;
        const newPoints = currentPoints - (loyaltyPointsRedeemed || 0) + (loyaltyPointsEarned || 0);
        await db.saveUserProfile({ 
          ...profile, 
          loyaltyPoints: newPoints,
          totalEarnedPoints: totalEarned + (loyaltyPointsEarned || 0)
        });
      }
    }

    return newOrder.id;
  },
  updateOrderStatus: async (id: string, status: "pending" | "completed") => {
    if (hasFirebase && dbFirestore) {
      await updateDoc(doc(dbFirestore, "orders", id), { status });
    } else {
      const orders = await db.getOrders();
      const updated = orders.map(o => o.id === id ? { ...o, status } : o);
      localStorage.setItem("esdal_orders", JSON.stringify(updated));
    }
  },
  updateOrderStatusAndDeductStock: async (orderId: string, items: CartItem[]) => {
    if (hasFirebase && dbFirestore) {
      await runTransaction(dbFirestore, async (transaction) => {
        const orderRef = doc(dbFirestore!, "orders", orderId);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) {
          throw new Error("Order does not exist!");
        }

        const productRefs = items.map(item => doc(dbFirestore!, "products", item.product.id));
        const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

        productSnaps.forEach((pSnap, index) => {
          if (pSnap.exists()) {
            const item = items[index];
            const pData = pSnap.data() as Product;
            const currentStock = pData.stock_quantity ?? 10;
            const newStock = Math.max(0, currentStock - item.qty);
            transaction.update(pSnap.ref, { stock_quantity: newStock, in_stock: newStock > 0 });
          }
        });

        transaction.update(orderRef, { status: "completed" });
      });
    } else {
      const orders = await db.getOrders();
      const updatedOrders = orders.map(o => o.id === orderId ? { ...o, status: "completed" as const } : o);
      localStorage.setItem("esdal_orders", JSON.stringify(updatedOrders));

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
      localStorage.setItem("esdal_products", JSON.stringify(updatedProducts));
    }
  },
  clearOrders: async () => {
    if (hasFirebase && dbFirestore) {
      // not easily clearable in firestore without cloud function, skip for now
    } else {
      localStorage.setItem("esdal_orders", "[]");
    }
  },
  getExpenses: async (): Promise<Expense[]> => {
    if (hasFirebase && dbFirestore) {
      const q = query(collection(dbFirestore, "expenses"), orderBy("date", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), id: d.id })) as Expense[];
    }
    const stored = localStorage.getItem("esdal_expenses");
    return stored ? JSON.parse(stored) : [];
  },
  saveExpenses: async (expenses: Expense[]) => {
    if (hasFirebase && dbFirestore) {
      for (const e of expenses) {
        if (!e.id) e.id = Math.random().toString(36).substring(2, 9).toUpperCase();
        await setDoc(doc(dbFirestore, "expenses", e.id), e);
      }
    } else {
      localStorage.setItem("esdal_expenses", JSON.stringify(expenses));
    }
  },
  deleteExpense: async (id: string) => {
    if (hasFirebase && dbFirestore) {
      await deleteDoc(doc(dbFirestore, "expenses", id));
    } else {
      const expenses = await db.getExpenses();
      const updated = expenses.filter(e => e.id !== id);
      localStorage.setItem("esdal_expenses", JSON.stringify(updated));
    }
  },
  getSettings: async (): Promise<StoreSettings> => {
    try {
      if (hasFirebase && dbFirestore) {
        const snap = await getDoc(doc(dbFirestore, "settings", "store"));
        if (snap.exists()) return snap.data() as StoreSettings;
      }
    } catch(e) {}
    const stored = localStorage.getItem("esdal_settings");
    return stored ? JSON.parse(stored) : { discountPercentage: 0 };
  },
  saveSettings: async (settings: StoreSettings) => {
    try {
      if (hasFirebase && dbFirestore) {
        await setDoc(doc(dbFirestore, "settings", "store"), settings);
      }
    } catch(e) {}
    localStorage.setItem("esdal_settings", JSON.stringify(settings));
  },
  getUserProfile: async (id: string): Promise<UserProfile | null> => {
    if (hasFirebase && dbFirestore) {
      const snap = await getDoc(doc(dbFirestore, "users", id));
      if (snap.exists()) return { ...snap.data(), id: snap.id } as UserProfile;
    }
    const stored = localStorage.getItem("esdal_users");
    const users: UserProfile[] = stored ? JSON.parse(stored) : [];
    return users.find((u) => u.id === id) || null;
  },
  saveUserProfile: async (profile: UserProfile) => {
    if (hasFirebase && dbFirestore) {
      await setDoc(doc(dbFirestore, "users", profile.id), profile);
    } else {
      const stored = localStorage.getItem("esdal_users");
      const users: UserProfile[] = stored ? JSON.parse(stored) : [];
      const updated = users.filter(u => u.id !== profile.id);
      updated.push(profile);
      localStorage.setItem("esdal_users", JSON.stringify(updated));
    }
  },
  getAllUsers: async (): Promise<UserProfile[]> => {
    if (hasFirebase && dbFirestore) {
      const q = collection(dbFirestore, "users");
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), id: d.id })) as UserProfile[];
    }
    const stored = localStorage.getItem("esdal_users");
    return stored ? JSON.parse(stored) : [];
  },
  getPromoCodes: async (): Promise<PromoCode[]> => {
    if (hasFirebase && dbFirestore) {
      const q = collection(dbFirestore, "promoCodes");
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), id: d.id })) as PromoCode[];
    }
    const stored = localStorage.getItem("esdal_promo_codes");
    return stored ? JSON.parse(stored) : [];
  },
  savePromoCodes: async (codes: PromoCode[]) => {
    if (hasFirebase && dbFirestore) {
      for (const code of codes) {
        if (!code.id) code.id = Math.random().toString(36).substring(2, 9).toUpperCase();
        await setDoc(doc(dbFirestore, "promoCodes", code.id), code);
      }
    } else {
      localStorage.setItem("esdal_promo_codes", JSON.stringify(codes));
    }
  },
  deletePromoCode: async (id: string) => {
    if (hasFirebase && dbFirestore) {
      await deleteDoc(doc(dbFirestore, "promoCodes", id));
    } else {
      const stored = localStorage.getItem("esdal_promo_codes");
      if (stored) {
        const codes: PromoCode[] = JSON.parse(stored);
        localStorage.setItem("esdal_promo_codes", JSON.stringify(codes.filter(c => c.id !== id)));
      }
    }
  }
};

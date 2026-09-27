import type { Product, CartItem, Order, Expense, StoreSettings, UserProfile, PromoCode, Category } from "./types";
import { nanoid } from "nanoid";
import { isValidOrderQuantity, cleanUserText } from "./validation";
import { dbFirestore, hasFirebase } from "./firebase";
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, updateDoc, query, orderBy, where, runTransaction, onSnapshot, writeBatch } from "firebase/firestore";

// Firestore rejects undefined values, including values nested inside order items.
// Normalize writes in one place so optional product fields cannot break a save.
const withoutUndefined = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map((item) => withoutUndefined(item)) as T;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, withoutUndefined(child)]),
    ) as T;
  }
  return value;
};

const getLocalProducts = (): Product[] => {
  const stored = localStorage.getItem("esdal_products_v2");
  if (stored) return JSON.parse(stored);

  const fb: Product[] = []; // الموقع فارغ تماماً وجاهز لرفع المنتجات
  localStorage.setItem("esdal_products_v2", JSON.stringify(fb));
  return fb;
};

const normalizeProduct = (id: string, data: Record<string, unknown>): Product | null => {
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const price_egp = Number(data.price_egp);
  if (!name || !Number.isFinite(price_egp) || price_egp < 0) return null;

  const stock = Number(data.stock_quantity);
  const stockQuantity = Number.isFinite(stock) && stock >= 0 ? stock : undefined;
  const images = Array.isArray(data.images)
    ? data.images.filter((image): image is string => typeof image === "string")
    : undefined;

  return {
    ...(data as Partial<Product>),
    id,
    name,
    price_egp,
    image_url: typeof data.image_url === "string" ? data.image_url : images?.[0] || "",
    images,
    category: typeof data.category === "string" && data.category.trim() ? data.category.trim() : "عام",
    in_stock: typeof data.in_stock === "boolean" ? data.in_stock : (stockQuantity ?? 10) > 0,
    stock_quantity: stockQuantity,
  };
};

const firestoreProducts = (docs: { id: string; data: () => Record<string, unknown> }[]) =>
  docs.map((snapshot) => normalizeProduct(snapshot.id, snapshot.data())).filter((product): product is Product => product !== null);

export const db = {
  getProducts: async (): Promise<Product[]> => {
    if (hasFirebase && dbFirestore) {
      const q = collection(dbFirestore, "products");
      const snap = await getDocs(q);
      return firestoreProducts(snap.docs);
    }
    return getLocalProducts();
  },
  subscribeProducts: (onChange: (products: Product[]) => void, onError?: (error: Error) => void) => {
    if (hasFirebase && dbFirestore) {
      return onSnapshot(
        collection(dbFirestore, "products"),
        (snap) => onChange(firestoreProducts(snap.docs)),
        (error) => onError?.(error),
      );
    }

    const loadLocal = () => onChange(getLocalProducts());
    loadLocal();
    window.addEventListener("esdal:products-updated", loadLocal);
    return () => window.removeEventListener("esdal:products-updated", loadLocal);
  },
  saveProduct: async (product: Product) => {
    if (hasFirebase && dbFirestore) {
      await setDoc(doc(dbFirestore, "products", product.id), withoutUndefined(product));
    } else {
      const products = getLocalProducts();
      localStorage.setItem(
        "esdal_products_v2",
        JSON.stringify([product, ...products.filter((existing) => existing.id !== product.id)]),
      );
      window.dispatchEvent(new Event("esdal:products-updated"));
    }
  },
  saveProducts: async (products: Product[]) => {
    if (hasFirebase && dbFirestore) {
      // Firestore batches are limited to 500 writes. Chunk below that and avoid
      // one network round-trip per product when an admin edits a category.
      for (let offset = 0; offset < products.length; offset += 450) {
        const batch = writeBatch(dbFirestore);
        for (const product of products.slice(offset, offset + 450)) {
          const id = product.id || nanoid(8).toUpperCase();
          batch.set(doc(dbFirestore, "products", id), withoutUndefined({ ...product, id }));
        }
        await batch.commit();
      }
    } else {
      localStorage.setItem("esdal_products_v2", JSON.stringify(products));
      window.dispatchEvent(new Event("esdal:products-updated"));
    }
  },
  deleteProduct: async (id: string) => {
    if (hasFirebase && dbFirestore) {
      await deleteDoc(doc(dbFirestore, "products", id));
    } else {
      const stored = getLocalProducts().filter(p => p.id !== id);
      localStorage.setItem("esdal_products_v2", JSON.stringify(stored));
      window.dispatchEvent(new Event("esdal:products-updated"));
    }
  },
  getOrders: async (): Promise<Order[]> => {
    if (hasFirebase && dbFirestore) {
      const q = query(collection(dbFirestore, "orders"), orderBy("date", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), id: d.id })) as Order[];
    }
    const stored = localStorage.getItem("esdal_orders_v2");
    return stored ? JSON.parse(stored) : [];
  },
  getOrdersByUser: async (userId: string): Promise<Order[]> => {
    if (hasFirebase && dbFirestore) {
      const q = query(collection(dbFirestore, "orders"), where("userId", "==", userId));
      const snap = await getDocs(q);
      const arr = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Order[];
      return arr.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    const stored = localStorage.getItem("esdal_orders_v2");
    const allOrders: Order[] = stored ? JSON.parse(stored) : [];
    return allOrders.filter(o => o.userId === userId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },
  getOrderById: async (id: string): Promise<Order | null> => {
    if (hasFirebase && dbFirestore) {
      const docRef = doc(dbFirestore, "orders", id);
      const snap = await getDoc(docRef);
      if (snap.exists()) return { ...snap.data(), id: snap.id } as Order;
    }
    const stored = localStorage.getItem("esdal_orders_v2");
    const orders: Order[] = stored ? JSON.parse(stored) : [];
    return orders.find((o) => o.id === id) || null;
  },
  addOrder: async (
    items: CartItem[], total: number, paymentMethod: "cod" | "online" = "cod",
    senderPhone?: string, customerName?: string, customerAddress?: string,
    customerPhone?: string, governorate?: string, shippingCost?: number,
    preferredTime?: string, discountApplied?: number, preferredDate?: string,
    userId?: string, loyaltyPointsEarned?: number, loyaltyPointsRedeemed?: number, paymentReceiptUrl?: string, note?: string, transferredAmount?: number, termsAccepted = false, termsAcceptedAt?: string, termsAcceptedEmail?: string
  ): Promise<string> => {
    if (!userId) throw new Error("يجب تسجيل الدخول لإتمام الطلب");
    if (!items.length || items.some((item) => !item.product.id || !isValidOrderQuantity(item.qty))) {
      throw new Error("بيانات المنتجات غير صالحة");
    }
    const safeName = cleanUserText(customerName || "", 120);
    const safeAddress = cleanUserText(customerAddress || "", 500);
    const safeGovernorate = cleanUserText(governorate || "", 80);
    const safeNote = cleanUserText(note || "", 500);
    if (safeName.length < 2 || safeAddress.length < 6 || !safeGovernorate) {
      throw new Error("بيانات التوصيل غير مكتملة");
    }
    if (!Number.isFinite(total) || total < 0 || !Number.isFinite(shippingCost ?? 0)) {
      throw new Error("قيمة الطلب غير صالحة");
    }
    const newOrder: Order = {
      id: nanoid(8).toUpperCase(),
      date: new Date().toISOString(),
      items,
      total,
      status: "pending",
      paymentMethod,
      senderPhone,
      customerName: safeName,
      customerAddress: safeAddress,
      customerPhone,
      governorate: safeGovernorate,
      shippingCost,
      preferredTime,
      preferredDate,
      discountApplied,
      userId,
      loyaltyPointsEarned,
      loyaltyPointsRedeemed,
      paymentReceiptUrl,
      transferredAmount,
      note: safeNote,
      termsAccepted,
      termsAcceptedAt: termsAcceptedAt || (termsAccepted ? new Date().toISOString() : undefined),
      termsAcceptedEmail: termsAcceptedEmail?.trim().toLowerCase() || undefined,
    };
    const orderToSave = withoutUndefined(newOrder);
    if (hasFirebase && dbFirestore) {
      const orderRef = doc(dbFirestore, "orders", orderToSave.id);
      const profileRef = doc(dbFirestore, "users", userId);
      await runTransaction(dbFirestore, async (transaction) => {
        const profileSnap = await transaction.get(profileRef);
        const profile = profileSnap.exists()
          ? ({ ...profileSnap.data(), id: profileSnap.id } as UserProfile)
          : {
              id: userId,
              name: safeName,
              phone: customerPhone || "",
              address: safeAddress,
              governorate: safeGovernorate,
              joinedAt: new Date().toISOString(),
            };
        const currentPoints = profile.loyaltyPoints || 0;
        if (currentPoints < (loyaltyPointsRedeemed || 0)) {
          throw new Error("رصيد النقاط غير كافٍ لإتمام عملية الخصم");
        }

        transaction.set(orderRef, orderToSave);
        const updatedProfile = {
          ...profile,
          email: profile.email || orderToSave.termsAcceptedEmail,
          name: safeName,
          phone: customerPhone || profile.phone,
          address: safeAddress,
          governorate: safeGovernorate,
          loyaltyPoints: currentPoints - (loyaltyPointsRedeemed || 0) + (loyaltyPointsEarned || 0),
          totalEarnedPoints: (profile.totalEarnedPoints || 0) + (loyaltyPointsEarned || 0),
          termsAccepted: termsAccepted || profile.termsAccepted || false,
          termsAcceptedAt: profile.termsAcceptedAt || orderToSave.termsAcceptedAt,
          termsAcceptedEmail: profile.termsAcceptedEmail || orderToSave.termsAcceptedEmail,
        };
        transaction.set(
          profileRef,
          withoutUndefined(updatedProfile),
          { merge: true },
        );
      });
    } else {
      const orders = await db.getOrders();
      orders.unshift(orderToSave);
      localStorage.setItem("esdal_orders_v2", JSON.stringify(orders));
      const profile = await db.getUserProfile(userId);
      await db.saveUserProfile({
        id: userId,
        email: profile?.email || orderToSave.termsAcceptedEmail,
        name: safeName,
        phone: customerPhone || profile?.phone || "",
        address: safeAddress,
        governorate: safeGovernorate,
        joinedAt: profile?.joinedAt || new Date().toISOString(),
        loyaltyPoints: (profile?.loyaltyPoints || 0) - (loyaltyPointsRedeemed || 0) + (loyaltyPointsEarned || 0),
        totalEarnedPoints: (profile?.totalEarnedPoints || 0) + (loyaltyPointsEarned || 0),
        termsAccepted: termsAccepted || profile?.termsAccepted || false,
        termsAcceptedAt: profile?.termsAcceptedAt || orderToSave.termsAcceptedAt,
        termsAcceptedEmail: profile?.termsAcceptedEmail || orderToSave.termsAcceptedEmail,
      });
    }

    return newOrder.id;
  },
  updateOrderStatus: async (id: string, status: "pending" | "prepared" | "shipped" | "completed" | "cancelled" | "rejected") => {
    if (hasFirebase && dbFirestore) {
      await updateDoc(doc(dbFirestore, "orders", id), { status });
    } else {
      const orders = await db.getOrders();
      const updated = orders.map(o => o.id === id ? { ...o, status } : o);
      localStorage.setItem("esdal_orders_v2", JSON.stringify(updated));
    }
  },
  confirmOrderReceipt: async (orderId: string): Promise<string> => {
    const confirmedAt = new Date().toISOString();
    if (hasFirebase && dbFirestore) {
      const orderRef = doc(dbFirestore, "orders", orderId);
      return runTransaction(dbFirestore, async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) throw new Error("الطلب غير موجود");
        const order = orderSnap.data() as Order;
        if (order.status !== "shipped") throw new Error("لا يمكن تأكيد الاستلام قبل شحن الطلب");
        if (order.customerConfirmedAt) return order.customerConfirmedAt;
        transaction.update(orderRef, { customerConfirmedAt: confirmedAt });
        return confirmedAt;
      });
    }

    const orders = await db.getOrders();
    const order = orders.find((entry) => entry.id === orderId);
    if (!order) throw new Error("الطلب غير موجود");
    if (order.status !== "shipped") throw new Error("لا يمكن تأكيد الاستلام قبل شحن الطلب");
    if (order.customerConfirmedAt) return order.customerConfirmedAt;
    localStorage.setItem("esdal_orders_v2", JSON.stringify(
      orders.map((entry) => entry.id === orderId ? { ...entry, customerConfirmedAt: confirmedAt } : entry),
    ));
    return confirmedAt;
  },
  updateOrderStatusAndDeductStock: async (orderId: string, items: CartItem[]) => {
    if (hasFirebase && dbFirestore) {
      await runTransaction(dbFirestore, async (transaction) => {
        const orderRef = doc(dbFirestore!, "orders", orderId);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) {
          throw new Error("Order does not exist!");
        }
        const order = orderSnap.data() as Order;
        if (order.status === "completed") return;
        if (order.status !== "prepared" && order.status !== "shipped") {
          throw new Error("لا يمكن تأكيد استلام هذا الطلب في حالته الحالية");
        }

        const quantityByProduct = new Map<string, number>();
        for (const item of order.items || items) {
          quantityByProduct.set(
            item.product.id,
            (quantityByProduct.get(item.product.id) || 0) + item.qty,
          );
        }
        const productEntries = Array.from(quantityByProduct.entries());
        const productRefs = productEntries.map(([productId]) => doc(dbFirestore!, "products", productId));
        const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

        productSnaps.forEach((pSnap, index) => {
          if (pSnap.exists()) {
            const quantity = productEntries[index][1];
            const pData = pSnap.data() as Product;
            const currentStock = pData.stock_quantity ?? 10;
            const newStock = Math.max(0, currentStock - quantity);
            const currentSales = pData.sales_count ?? 0;
            transaction.update(pSnap.ref, {
              stock_quantity: newStock,
              in_stock: newStock > 0,
              sales_count: currentSales + quantity
            });
          }
        });

        transaction.update(orderRef, { status: "completed" });
      });
    } else {
      const orders = await db.getOrders();
      const order = orders.find((entry) => entry.id === orderId);
      if (!order) throw new Error("Order does not exist!");
      if (order.status === "completed") return;
      if (order.status !== "prepared" && order.status !== "shipped") {
        throw new Error("لا يمكن تأكيد استلام هذا الطلب في حالته الحالية");
      }
      const updatedOrders = orders.map(o => o.id === orderId ? { ...o, status: "completed" as const } : o);
      localStorage.setItem("esdal_orders_v2", JSON.stringify(updatedOrders));

      const products = await db.getProducts();
      let updatedProducts = [...products];
      for (const item of order.items) {
        updatedProducts = updatedProducts.map(p => {
          if (p.id === item.product.id) {
            const currentStock = p.stock_quantity ?? 10;
            const newStock = Math.max(0, currentStock - item.qty);
            const currentSales = p.sales_count ?? 0;
            return { ...p, stock_quantity: newStock, in_stock: newStock > 0, sales_count: currentSales + item.qty };
          }
          return p;
        });
      }
      localStorage.setItem("esdal_products_v2", JSON.stringify(updatedProducts));
      window.dispatchEvent(new Event("esdal:products-updated"));
    }
  },
  clearOrders: async () => {
    if (hasFirebase && dbFirestore) {
      const q = collection(dbFirestore, "orders");
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        await deleteDoc(d.ref);
      }
    } else {
      localStorage.setItem("esdal_orders_v2", "[]");
    }
  },
  clearExpenses: async () => {
    if (hasFirebase && dbFirestore) {
      const q = collection(dbFirestore, "expenses");
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        await deleteDoc(d.ref);
      }
    } else {
      localStorage.setItem("esdal_expenses_v2", "[]");
    }
  },
  getExpenses: async (): Promise<Expense[]> => {
    if (hasFirebase && dbFirestore) {
      const q = query(collection(dbFirestore, "expenses"), orderBy("date", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), id: d.id })) as Expense[];
    }
    const stored = localStorage.getItem("esdal_expenses_v2");
    return stored ? JSON.parse(stored) : [];
  },
  saveExpenses: async (expenses: Expense[]) => {
    if (hasFirebase && dbFirestore) {
      for (let offset = 0; offset < expenses.length; offset += 450) {
        const batch = writeBatch(dbFirestore);
        for (const expense of expenses.slice(offset, offset + 450)) {
          const id = expense.id || nanoid(8).toUpperCase();
          batch.set(doc(dbFirestore, "expenses", id), withoutUndefined({ ...expense, id }));
        }
        await batch.commit();
      }
    } else {
      localStorage.setItem("esdal_expenses_v2", JSON.stringify(expenses));
    }
  },
  deleteExpense: async (id: string) => {
    if (hasFirebase && dbFirestore) {
      await deleteDoc(doc(dbFirestore, "expenses", id));
    } else {
      const expenses = await db.getExpenses();
      const updated = expenses.filter(e => e.id !== id);
      localStorage.setItem("esdal_expenses_v2", JSON.stringify(updated));
    }
  },
  getSettings: async (): Promise<StoreSettings> => {
    try {
      if (hasFirebase && dbFirestore) {
        const snap = await getDoc(doc(dbFirestore, "settings", "store"));
        if (snap.exists()) return snap.data() as StoreSettings;
      }
    } catch (e) {
      console.warn("Failed to load store settings from Firebase", e);
    }
    const stored = localStorage.getItem("esdal_settings_v2");
    return stored ? JSON.parse(stored) : { discountPercentage: 0 };
  },
  subscribeSettings: (onChange: (settings: StoreSettings) => void, onError?: (error: Error) => void) => {
    if (hasFirebase && dbFirestore) {
      return onSnapshot(
        doc(dbFirestore, "settings", "store"),
        (snapshot) => onChange(snapshot.exists()
          ? snapshot.data() as StoreSettings
          : { discountPercentage: 0, whatsappNumbers: [] }),
        (error) => onError?.(error),
      );
    }

    const loadLocalSettings = () => {
      const stored = localStorage.getItem("esdal_settings_v2");
      onChange(stored ? JSON.parse(stored) as StoreSettings : { discountPercentage: 0, whatsappNumbers: [] });
    };
    loadLocalSettings();
    window.addEventListener("esdal:settings-updated", loadLocalSettings);
    return () => window.removeEventListener("esdal:settings-updated", loadLocalSettings);
  },
  saveSettings: async (settings: StoreSettings) => {
    if (hasFirebase && dbFirestore) {
      await setDoc(doc(dbFirestore, "settings", "store"), withoutUndefined(settings));
    }
    localStorage.setItem("esdal_settings_v2", JSON.stringify(settings));
    window.dispatchEvent(new Event("esdal:settings-updated"));
  },
  getUserProfile: async (id: string): Promise<UserProfile | null> => {
    if (hasFirebase && dbFirestore) {
      const snap = await getDoc(doc(dbFirestore, "users", id));
      if (snap.exists()) return { ...snap.data(), id: snap.id } as UserProfile;
    }
    const stored = localStorage.getItem("esdal_users_v2");
    const users: UserProfile[] = stored ? JSON.parse(stored) : [];
    return users.find((u) => u.id === id) || null;
  },
  saveUserProfile: async (profile: UserProfile) => {
    if (hasFirebase && dbFirestore) {
      await setDoc(doc(dbFirestore, "users", profile.id), withoutUndefined(profile), { merge: true });
    } else {
      const stored = localStorage.getItem("esdal_users_v2");
      const users: UserProfile[] = stored ? JSON.parse(stored) : [];
      const updated = users.filter(u => u.id !== profile.id);
      updated.push(profile);
      localStorage.setItem("esdal_users_v2", JSON.stringify(updated));
    }
  },
  getAllUsers: async (): Promise<UserProfile[]> => {
    if (hasFirebase && dbFirestore) {
      const q = collection(dbFirestore, "users");
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), id: d.id })) as UserProfile[];
    }
    const stored = localStorage.getItem("esdal_users_v2");
    return stored ? JSON.parse(stored) : [];
  },
  deleteUserProfile: async (id: string) => {
    if (hasFirebase && dbFirestore) {
      await deleteDoc(doc(dbFirestore, "users", id));
    } else {
      const stored = localStorage.getItem("esdal_users_v2");
      const users: UserProfile[] = stored ? JSON.parse(stored) : [];
      const updated = users.filter(u => u.id !== id);
      localStorage.setItem("esdal_users_v2", JSON.stringify(updated));
    }
  },
  getPromoCodes: async (): Promise<PromoCode[]> => {
    if (hasFirebase && dbFirestore) {
      const q = collection(dbFirestore, "promoCodes");
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), id: d.id })) as PromoCode[];
    }
    const stored = localStorage.getItem("esdal_promos_v2");
    return stored ? JSON.parse(stored) : [];
  },
  savePromoCodes: async (codes: PromoCode[]) => {
    if (hasFirebase && dbFirestore) {
      for (let offset = 0; offset < codes.length; offset += 450) {
        const batch = writeBatch(dbFirestore);
        for (const code of codes.slice(offset, offset + 450)) {
          const id = code.id || nanoid(8).toUpperCase();
          batch.set(doc(dbFirestore, "promoCodes", id), withoutUndefined({ ...code, id }));
        }
        await batch.commit();
      }
    } else {
      localStorage.setItem("esdal_promos_v2", JSON.stringify(codes));
    }
  },
  deletePromoCode: async (id: string) => {
    if (hasFirebase && dbFirestore) {
      await deleteDoc(doc(dbFirestore, "promoCodes", id));
    } else {
      const stored = localStorage.getItem("esdal_promos_v2");
      if (stored) {
        const codes: PromoCode[] = JSON.parse(stored);
        localStorage.setItem("esdal_promos_v2", JSON.stringify(codes.filter(c => c.id !== id)));
      }
    }
  },
  getCategories: async (): Promise<Category[]> => {
    if (hasFirebase && dbFirestore) {
      const q = collection(dbFirestore, "categories");
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Category[];
      if (data.length > 0) return data;
    }
    const stored = localStorage.getItem("esdal_categories_v2");
    if (stored) return JSON.parse(stored);

    // Default categories if none exist
    const defaults: Category[] = [
      { id: "cat-1", name: "عام" }
    ];
    localStorage.setItem("esdal_categories_v2", JSON.stringify(defaults));
    return defaults;
  },
  saveCategories: async (categories: Category[]) => {
    if (hasFirebase && dbFirestore) {
      for (let offset = 0; offset < categories.length; offset += 450) {
        const batch = writeBatch(dbFirestore);
        for (const category of categories.slice(offset, offset + 450)) {
          const id = category.id || nanoid(6);
          batch.set(doc(dbFirestore, "categories", id), withoutUndefined({ ...category, id }));
        }
        await batch.commit();
      }
    } else {
      localStorage.setItem("esdal_categories_v2", JSON.stringify(categories));
    }
  },
  deleteCategory: async (id: string) => {
    if (hasFirebase && dbFirestore) {
      await deleteDoc(doc(dbFirestore, "categories", id));
    } else {
      const categories = await db.getCategories();
      const updated = categories.filter(c => c.id !== id);
      localStorage.setItem("esdal_categories_v2", JSON.stringify(updated));
    }
  }
};

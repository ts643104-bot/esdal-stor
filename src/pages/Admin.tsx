import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import type { Category, Expense, Order, Product, PromoCode, StoreSettings, UserProfile } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Download,
  Edit,
  Filter,
  Globe,
  LayoutDashboard,
  Lock,
  LogOut,
  Package,
  Plus,
  Settings,
  ShoppingCart,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
  Image as ImageIcon,
} from "lucide-react";
import { hasFirebase, auth, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { dbFirestore } from "@/lib/firebase";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

// Lazy-load Recharts to keep initial bundle light
const SalesOverviewChart = lazy(() => import("@/components/admin/SalesOverviewChart"));

const ADMIN_EMAIL = (import.meta as any).env?.VITE_ADMIN_EMAIL?.toString()?.trim()?.toLowerCase() || "admin@hala-alyusr.com";

// Image compression helper to drastically reduce image sizes
const compressImage = async (file: File): Promise<Blob> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      const MAX_SIZE = 800; // Limit dimensions to 800px
      if (width > height && width > MAX_SIZE) {
        height = Math.round(height * (MAX_SIZE / width));
        width = MAX_SIZE;
      } else if (height > MAX_SIZE) {
        width = Math.round(width * (MAX_SIZE / height));
        height = MAX_SIZE;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.7); // Compress as JPEG at 70% quality
    };
    img.onerror = () => resolve(file);
  });
};

function sanitizeFileName(name: string) {
  return name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 120);
}

function sanitizeInput(str: string) {
  if (!str) return "";
  return str.replace(/[<>&"']/g, (m) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;'
  }[m] || m)).trim();
}

function normalizePhone(raw: string) {
  const digits = (raw || "").replace(/\D/g, "");
  return digits;
}

function safeExternalUrl(url?: string) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
    return "";
  } catch {
    return "";
  }
}

export default function Admin() {
  const { lang, setLang } = useLanguage();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authErrors, setAuthErrors] = useState<{email?: string; password?: string; general?: string}>({});

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<StoreSettings>({ discountPercentage: 0, lowStockThreshold: 3, depositAmount: 100 });
  const [newCategoryName, setNewCategoryName] = useState("");

  const [savingSettings, setSavingSettings] = useState(false);
  const [customerLoggedIn, setCustomerLoggedIn] = useState<string | null>(null);
  const [ordersPage, setOrdersPage] = useState(1);
  const ordersPerPage = 20;

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isAddPromoOpen, setIsAddPromoOpen] = useState(false);

  const [newExpense, setNewExpense] = useState({ name: "", amount: 0 });
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", address: "", governorate: "" });
  const [newPromo, setNewPromo] = useState({ code: "", discountPercentage: 10 });

  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    name: "",
    cost_price_egp: 0,
    profit_egp: 0,
    price_egp: 0,
    category: "",
    description: "",
    in_stock: true,
    image_url: "",
    stock_quantity: 10,
  });

  useEffect(() => {
    // Security: Admin auth must be real (Firebase). Client-side "password" fallback is removed.
    if (!hasFirebase || !auth) {
      setIsAuthenticated(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        if ((user.email || "").toLowerCase() === ADMIN_EMAIL) {
          setIsAuthenticated(true);
          setCustomerLoggedIn(null);
        } else {
          setIsAuthenticated(false);
          setCustomerLoggedIn(user.email);
        }
      } else {
        setIsAuthenticated(false);
        setCustomerLoggedIn(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const refreshAll = useCallback(async () => {
    const [p, s, o, e, u, promo, cats] = await Promise.all([
      db.getProducts(),
      db.getSettings(),
      db.getOrders(),
      db.getExpenses(),
      db.getAllUsers(),
      db.getPromoCodes(),
      db.getCategories(),
    ]);

    setProducts(p);
    setSettings(s);
    setOrders(o);
    setExpenses(e);
    setUsers(u);
    setPromoCodes(promo);
    setCategories(cats);

    const low = p.filter((item) => (item.stock_quantity ?? 10) <= (s.lowStockThreshold || 3));
    if (low.length > 0) {
      toast.error(`تنبيه: يوجد ${low.length} منتجات وصل مخزونها للحد الأدنى!`, { duration: 5000 });
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Real-time listener for new orders and notification sound
  useEffect(() => {
    if (!isAuthenticated || !hasFirebase || !dbFirestore) return;

    let initialLoad = true;
    const q = query(collection(dbFirestore, "orders"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const currentOrders = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Order[];
      setOrders(currentOrders);

      // Play sound if a new order is added after initial load
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" && !initialLoad) {
          const newOrder = change.doc.data() as Order;
          
          // Strict validation: Only play sound if order is fully valid to avoid spam
          let isValid = true;
          if (newOrder.paymentMethod === "online") {
             if (!newOrder.senderPhone || !newOrder.paymentReceiptUrl || !newOrder.transferredAmount) {
                isValid = false;
             }
          }

          if (isValid) {
            try {
              const audio = new Audio("https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3?filename=success-1-6297.mp3");
              audio.volume = 0.7;
              audio.play();
              toast.success("يوجد طلب جديد مكتمل البيانات!", { duration: 5000 });
            } catch (err) {
              console.error("Failed to play notification sound", err);
            }
          }
        }
      });
      
      initialLoad = false;
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  const completedOrders = useMemo(() => orders.filter((o) => o.status === "completed"), [orders]);
  const totalRevenue = useMemo(() => completedOrders.reduce((sum, o) => sum + o.total, 0), [completedOrders]);
  const totalOrderProfits = useMemo(() => completedOrders.reduce((sum, o) => sum + o.items.reduce((s, it) => s + (it.product.profit_egp || 0) * it.qty, 0), 0), [completedOrders]);
  const pendingOrdersCount = useMemo(() => orders.filter((o) => o.status === "pending").length, [orders]);
  const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);
  const netProfit = useMemo(() => totalOrderProfits - totalExpenses, [totalOrderProfits, totalExpenses]);
  const lowStockProducts = useMemo(
    () => products.filter((p) => (p.stock_quantity ?? 10) <= (settings.lowStockThreshold || 3)),
    [products, settings.lowStockThreshold]
  );

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      
      setAuthErrors({});
      let hasErr = false;
      const newErrors: any = {};
      
      if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        newErrors.email = "صيغة البريد الإلكتروني غير صحيحة";
        hasErr = true;
      }
      
      if (!password || password.length < 6) {
        newErrors.password = "كلمة المرور يجب أن تكون 6 أحرف على الأقل";
        hasErr = true;
      }

      if (hasErr) {
        setAuthErrors(newErrors);
        return;
      }

      if (!hasFirebase || !auth) {
        setAuthErrors({ general: "نظام التحقق غير متصل، يرجى ضبط مفاتيح Firebase." });
        return;
      }

      if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
        setAuthErrors({ general: "هذا الحساب غير مصرح له بالدخول كمسؤول." });
        return;
      }

      setAuthLoading(true);
      try {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        toast.success("تم تسجيل الدخول كمسؤول بنجاح");
      } catch (err: any) {
        const code = err.code;
        if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
          setAuthErrors({ general: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
        } else {
          setAuthErrors({ general: "حدث خطأ أثناء الاتصال بالخادم: " + err.message });
        }
      } finally {
        setAuthLoading(false);
      }
    },
    [email, password]
  );

  const handleLogout = useCallback(async () => {
    setIsAuthenticated(false);
    setPassword("");
    setEmail("");
    if (hasFirebase && auth) {
      try {
        await signOut(auth);
      } catch {
        // ignore
      }
    }
  }, []);

  const saveExpense = useCallback(async () => {
    const name = newExpense.name.trim();
    const amount = Number(newExpense.amount);

    if (!name || !Number.isFinite(amount) || amount <= 0) {
      toast.error("يرجى إدخال اسم المصروف وقيمة صحيحة");
      return;
    }

    const expense: Expense = { id: nanoid(), name, amount, date: new Date().toISOString() };

    const updated = [expense, ...expenses];
    await db.saveExpenses(updated);
    setExpenses(updated);
    setIsAddExpenseOpen(false);
    setNewExpense({ name: "", amount: 0 });
    toast.success("تمت إضافة المصروف");
  }, [expenses, newExpense.amount, newExpense.name]);

  const deleteExpense = useCallback(async (id: string) => {
    if (confirm("هل أنت متأكد من حذف المصروف؟")) {
      await db.deleteExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      toast.success("تم حذف المصروف");
    }
  }, []);

  const savePromoCode = useCallback(async () => {
    const code = newPromo.code.trim().toUpperCase();
    const discountPercentage = Number(newPromo.discountPercentage);

    if (!code || !Number.isFinite(discountPercentage) || discountPercentage <= 0 || discountPercentage > 100) {
      toast.error("يرجى إدخال كود وخصم صحيح (1 - 100)");
      return;
    }

    const promo: PromoCode = { id: nanoid(), code, discountPercentage, isActive: true };
    const updated = [promo, ...promoCodes];
    await db.savePromoCodes(updated);
    setPromoCodes(updated);
    setIsAddPromoOpen(false);
    setNewPromo({ code: "", discountPercentage: 10 });
    toast.success("تمت إضافة الكود");
  }, [newPromo.code, newPromo.discountPercentage, promoCodes]);

  const deletePromoCode = useCallback(async (id: string) => {
    if (confirm("هل أنت متأكد من حذف الكود؟")) {
      await db.deletePromoCode(id);
      setPromoCodes((prev) => prev.filter((c) => c.id !== id));
      toast.success("تم حذف الكود");
    }
  }, []);

  const saveCategory = useCallback(async () => {
    const name = sanitizeInput(newCategoryName);
    if (!name) {
      toast.error("يرجى إدخال اسم الفئة");
      return;
    }

    if (categories.some(c => c.name === name)) {
      toast.error("هذه الفئة موجودة بالفعل");
      return;
    }

    const category: Category = { id: nanoid(6), name };
    const updated = [...categories, category];
    await db.saveCategories(updated);
    setCategories(updated);
    setNewCategoryName("");
    toast.success("تمت إضافة الفئة بنجاح");
  }, [categories, newCategoryName]);

  const deleteCategory = useCallback(async (id: string) => {
    if (confirm("هل أنت متأكد من حذف هذه الفئة؟ سيتم تحويل منتجاتها إلى 'عام'")) {
      await db.deleteCategory(id);
      const catToDelete = categories.find(c => c.id === id);
      if (catToDelete) {
        // Optional: Update products using this category
        const updatedProducts = products.map(p => p.category === catToDelete.name ? { ...p, category: "عام" } : p);
        if (JSON.stringify(updatedProducts) !== JSON.stringify(products)) {
          await db.saveProducts(updatedProducts);
          setProducts(updatedProducts);
        }
      }
      setCategories(prev => prev.filter(c => c.id !== id));
      toast.success("تم حذف الفئة");
    }
  }, [categories, products]);

  const togglePromoStatus = useCallback(
    async (promo: PromoCode) => {
      const updatedPromo = { ...promo, isActive: !promo.isActive };
      const updatedList = promoCodes.map((c) => (c.id === promo.id ? updatedPromo : c));
      await db.savePromoCodes(updatedList);
      setPromoCodes(updatedList);
    },
    [promoCodes]
  );

  const saveCustomer = useCallback(async () => {
    const { name, phone, address, governorate } = newCustomer;
    if (!name.trim() || !phone.trim() || !address.trim() || !governorate.trim()) {
      toast.error("يرجى ملء كافة بيانات العميل");
      return;
    }
    const customer: UserProfile = {
      id: "cust_" + nanoid(8),
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      governorate: governorate.trim(),
      joinedAt: new Date().toISOString(),
      loyaltyPoints: 0,
      totalEarnedPoints: 0,
    };
    await db.saveUserProfile(customer);
    setUsers((prev) => [customer, ...prev]);
    setIsAddCustomerOpen(false);
    setNewCustomer({ name: "", phone: "", address: "", governorate: "" });
    toast.success("تمت إضافة العميل بنجاح");
  }, [newCustomer]);

  const deleteUser = useCallback(async (id: string) => {
    if (confirm("هل أنت متأكد من حذف بيانات هذا العميل نهائياً؟")) {
      await db.deleteUserProfile(id);
      setUsers(prev => prev.filter(u => u.id !== id));
      toast.success("تم حذف العميل");
    }
  }, []);

  const resetFinance = useCallback(async (type: "orders" | "expenses" | "all") => {
    const msg = type === "all" ? "تصفية كافة الحسابات (الطلبات والمصروفات)" : 
                type === "orders" ? "مسح كافة سجلات الطلبات" : "مسح كافة سجلات المصروفات";
                
    if (confirm(`تحذير: هل أنت متأكد من ${msg}؟ لا يمكن التراجع عن هذه الخطوة.`)) {
      try {
        if (type === "orders" || type === "all") await db.clearOrders();
        if (type === "expenses" || type === "all") await db.clearExpenses();
        
        await refreshAll();
        toast.success("تمت التصفية بنجاح");
      } catch (err) {
        toast.error("حدث خطأ أثناء التصفية");
      }
    }
  }, [refreshAll]);

  const exportOrdersToCSV = useCallback(() => {
    const headers = ["رقم الطلب", "التاريخ", "اسم العميل", "الهاتف", "المحافظة", "المنتجات", "الإجمالي", "طريقة الدفع", "الحالة"];
    const rows = orders.map((o) => {
      const itemsStr = o.items.map((i) => `${i.qty}x ${i.product.name}`).join(" + ");
      return [
        o.id,
        new Date(o.date).toLocaleDateString("ar-EG"),
        o.customerName || "-",
        o.customerPhone || "-",
        o.governorate || "-",
        itemsStr,
        o.total.toString(),
        o.paymentMethod === "online" ? `أونلاين (${o.onlinePaymentMode === "partial" ? "عربون" : "كامل"})` : "عند الاستلام",
        o.status === "completed" ? "مكتمل" : "قيد المراجعة",
      ]
        .map((field) => `"${String(field).replace(/"/g, '""')}"`)
        .join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `hala_alyusr_orders_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [orders]);
  const deleteProduct = useCallback(async (id: string) => {
    if (confirm("هل أنت متأكد من حذف المنتج؟")) {
      await db.deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      toast.success("تم حذف المنتج");
    }
  }, []);

  const openEdit = useCallback((p: Product) => {
    setNewProduct(p);
    setIsAddOpen(true);
  }, []);

  const quickUpdateStock = useCallback(
    async (p: Product, amount: number) => {
      const newStock = Math.max(0, (p.stock_quantity ?? 10) + amount);
      const updatedProduct = { ...p, stock_quantity: newStock, in_stock: newStock > 0 };
      const updatedList = products.map((item) => (item.id === p.id ? updatedProduct : item));
      await db.saveProducts(updatedList);
      setProducts(updatedList);
      toast.success(`تم تحديث مخزون ${p.name} إلى ${newStock}`);
    },
    [products]
  );

  const handleSaveSettings = useCallback(async () => {
    setSavingSettings(true);
    try {
      const clean: StoreSettings = {
        discountPercentage: Math.min(100, Math.max(0, Number(settings.discountPercentage) || 0)),
        lowStockThreshold: Math.max(1, Number(settings.lowStockThreshold) || 3),
        depositAmount: Math.max(0, Number(settings.depositAmount) || 0),
        bankAccountNumber: sanitizeInput(settings.bankAccountNumber || ""),
      };
      await db.saveSettings(clean);
      setSettings(clean);
      toast.success("تم حفظ إعدادات المتجر بنجاح");
    } finally {
      setSavingSettings(false);
    }
  }, [settings.discountPercentage, settings.lowStockThreshold, settings.depositAmount, settings.bankAccountNumber]);

  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      toast.error("الصورة كبيرة جداً. يرجى اختيار صورة أقل من 3MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("يجب اختيار ملف صورة صالح");
      return;
    }

    const apiUrl = import.meta.env.VITE_IMGBB_API_URL;

    if (!apiUrl || !import.meta.env.VITE_IMGBB_API_KEY) {
      toast.error("إعدادات ImgBB غير مكتملة في ملف .env");
      return;
    }

    setUploadingImage(true);
    const toastId = toast.loading("جاري رفع الصورة إلى ImgBB...");
    try {
      const compressedFile = await compressImage(file);
      const formData = new FormData();
      formData.append("image", compressedFile, "image.jpg");
      
      const response = await fetch(`${apiUrl}?key=${import.meta.env.VITE_IMGBB_API_KEY}`, {
        method: "POST",
        body: formData
      });
      
      const data = await response.json();
      if (data.success) {
        setNewProduct((prev) => ({ ...prev, image_url: data.data.url }));
        toast.success("تم رفع الصورة بنجاح", { id: toastId });
      } else {
        throw new Error(data.error?.message || "فشل الرفع");
      }
    } catch (err: any) {
      toast.error("فشل رفع الصورة: " + err.message, { id: toastId });
    } finally {
      setUploadingImage(false);
    }
  }, []);

  const handleGalleryUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const validFiles = files.filter((f) => f.size <= 3 * 1024 * 1024 && f.type.startsWith("image/"));
    
    const apiUrl = import.meta.env.VITE_IMGBB_API_URL;
    const apiKey = import.meta.env.VITE_IMGBB_API_KEY;

    if (!apiUrl || !apiKey) {
      toast.error("إعدادات ImgBB غير مكتملة");
      return;
    }

    setUploadingImage(true);
    const toastId = toast.loading(`جاري رفع ${validFiles.length} صورة...`);
    try {
      const urls = await Promise.all(
        validFiles.map(async (file) => {
          const compressedFile = await compressImage(file);
          const formData = new FormData();
          formData.append("image", compressedFile, "gallery.jpg");
          const response = await fetch(`${apiUrl}?key=${apiKey}`, {
            method: "POST",
            body: formData
          });
          const resData = await response.json();
          if (!resData.success) throw new Error("فشل رفع أحد الملفات");
          return resData.data.url;
        })
      );

      setNewProduct((prev) => ({ ...prev, images: [...(prev.images || []), ...urls] }));
      toast.success("تم تحديث معرض الصور بنجاح", { id: toastId });
    } catch (err: any) {
      toast.error("فشل الرفع: " + err.message, { id: toastId });
    } finally {
      setUploadingImage(false);
    }
  }, []);

  const saveProduct = useCallback(async () => {
    const name = (newProduct.name || "").trim();
    const price = Number(newProduct.price_egp);
    const imageUrl = safeExternalUrl(newProduct.image_url || "");
    const stock = Number(newProduct.stock_quantity ?? 10);

    if (!name || !Number.isFinite(price) || price <= 0 || !imageUrl) {
      toast.error("يرجى ملء الاسم والسعر واختيار صورة (رابط صورة صحيح)");
      return;
    }

    if (!Number.isFinite(stock) || stock < 0) {
      toast.error("يرجى إدخال كمية صحيحة (رقم غير سالب)");
      return;
    }

    const product: Product = {
      id: newProduct.id || nanoid(),
      name: sanitizeInput(name),
      cost_price_egp: Number(newProduct.cost_price_egp) || 0,
      profit_egp: Number(newProduct.profit_egp) || 0,
      price_egp: price,
      category: sanitizeInput(newProduct.category || "عام") || "عام",
      in_stock: (newProduct.in_stock ?? true) && stock > 0,
      description: sanitizeInput(newProduct.description || ""),
      image_url: imageUrl,
      images: (newProduct.images || []).map((u) => safeExternalUrl(u)).filter(Boolean),
      stock_quantity: stock,
    };

    let updatedList: Product[];
    if (newProduct.id) {
      updatedList = products.map((p) => (p.id === product.id ? product : p));
      toast.success("تم تحديث المنتج");
    } else {
      updatedList = [product, ...products];
      toast.success("تمت إضافة المنتج");
    }

    await db.saveProducts(updatedList);
    setProducts(updatedList);
    setIsAddOpen(false);
    setNewProduct({ name: "", cost_price_egp: 0, profit_egp: 0, price_egp: 0, category: "", description: "", in_stock: true, image_url: "", stock_quantity: 10 });
  }, [newProduct, products]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden" dir="rtl">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] -z-10 translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] -z-10 -translate-x-1/2 translate-y-1/2" />
        
        <div className="w-full max-w-md bg-card/80 backdrop-blur-xl border border-border/50 rounded-3xl p-8 sm:p-10 shadow-2xl">
          <div className="text-center mb-8">
            <div className="mx-auto w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 shadow-inner rotate-3">
              <Lock className="h-10 w-10 text-primary -rotate-3" />
            </div>
            <h2 className="font-display text-3xl font-black text-foreground mb-2">تسجيل الدخول للإدارة</h2>
            <p className="text-sm text-muted-foreground font-medium">أدخل بيانات الحساب الإداري (Admin) للوصول</p>
          </div>
          <div>
            {customerLoggedIn ? (
              <div className="text-center space-y-4 animate-in zoom-in duration-300">
                <div className="bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-300 p-4 rounded-xl mb-6">
                  <p className="font-bold mb-1">أنت مسجل دخول كعميل</p>
                  <p className="text-xs font-mono opacity-80" dir="ltr">{customerLoggedIn}</p>
                </div>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">لا يمكنك الدخول للوحة الإدارة بحساب العميل. يرجى تسجيل الخروج أولاً.</p>
                <Button onClick={handleLogout} variant="destructive" className="w-full h-12 text-md rounded-xl font-bold shadow-lg hover:bg-destructive/90">
                  تسجيل الخروج والمتابعة كمسؤول
                </Button>
                <Button variant="ghost" className="w-full h-12 text-md rounded-xl font-bold text-muted-foreground hover:text-foreground" asChild>
                  <Link href="/">العودة للمتجر</Link>
                </Button>
              </div>
            ) : (
              <>
            {!hasFirebase && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-800 dark:text-red-200 p-3 rounded-xl text-sm">
                <strong>Firebase غير متصل.</strong>
                <div className="mt-1">لأسباب أمنية، تم تعطيل تسجيل الدخول المحلي. قم بضبط مفاتيح Firebase في .env ثم أعد النشر.</div>
              </div>
            )}

            {authErrors.general && (
              <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-600 p-3 rounded-xl text-sm font-bold text-center animate-in fade-in">
                {authErrors.general}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-bold opacity-80">البريد الإلكتروني للإدارة</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  className={`text-left h-12 rounded-xl transition-all ${authErrors.email ? 'border-red-500 focus-visible:ring-red-500/20' : 'bg-muted/30 focus-visible:bg-transparent'}`}
                  disabled={!hasFirebase}
                  autoComplete="username"
                />
                {authErrors.email && <p className="text-red-500 text-xs mt-1 font-medium">{authErrors.email}</p>}
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="font-bold opacity-80">كلمة المرور</Label>
                  <button
                    type="button"
                    onClick={() => toast.info("لتغيير كلمة المرور استخدم إعادة تعيين كلمة المرور من Firebase Auth")}
                    className="text-xs font-bold text-primary hover:underline opacity-80"
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                  className={`text-left h-12 rounded-xl tracking-widest transition-all ${authErrors.password ? 'border-red-500 focus-visible:ring-red-500/20' : 'bg-muted/30 focus-visible:bg-transparent'}`}
                  disabled={!hasFirebase}
                  autoComplete="current-password"
                />
                {authErrors.password && <p className="text-red-500 text-xs mt-1 font-medium">{authErrors.password}</p>}
              </div>
              
              <div className="pt-2 space-y-3">
                <Button type="submit" className="w-full h-14 text-lg font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all" disabled={authLoading || !hasFirebase}>
                  {authLoading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent mx-auto"></div> : "تسجيل الدخول للوحة التحكم"}
                </Button>
                <Button type="button" variant="ghost" className="w-full h-12 rounded-xl font-semibold text-muted-foreground" asChild>
                  <Link href="/">العودة للمتجر الرئيسي</Link>
                </Button>
              </div>
            </form>
            </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl">لوحة التحكم (Admin)</h1>
            <p className="text-muted-foreground mt-1">إدارة المنتجات وحساب المبيعات</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              title={lang === "ar" ? "Switch to English" : "تغيير للغة العربية"}
            >
              <Globe className="h-5 w-5" />
            </Button>
            <Button variant="outline" onClick={handleLogout} className="gap-2 text-xs sm:text-sm text-destructive hover:text-destructive">
              <LogOut className="h-4 w-4" /> تسجيل الخروج
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/">العودة للمتجر</Link>
            </Button>
          </div>
        </header>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-card border w-full justify-start h-auto flex-wrap min-h-12 overflow-x-auto">
            <TabsTrigger value="overview" className="gap-2 px-6"><LayoutDashboard className="h-4 w-4" /> نظرة عامة</TabsTrigger>
            <TabsTrigger value="products" className="gap-2 px-6"><Package className="h-4 w-4" /> المنتجات</TabsTrigger>
            <TabsTrigger value="orders" className="gap-2 px-6"><ShoppingCart className="h-4 w-4" /> الطلبات</TabsTrigger>
            <TabsTrigger value="expenses" className="gap-2 px-6"><WalletCards className="h-4 w-4" /> المصروفات</TabsTrigger>
            <TabsTrigger value="customers" className="gap-2 px-6"><Users className="h-4 w-4" /> العملاء</TabsTrigger>
            <TabsTrigger value="promos" className="gap-2 px-6"><Tag className="h-4 w-4" /> الكوبونات</TabsTrigger>
            <TabsTrigger value="categories" className="gap-2 px-6"><Filter className="h-4 w-4" /> الفئات</TabsTrigger>
            <TabsTrigger value="settings" className="gap-2 px-6"><Settings className="h-4 w-4" /> الإعدادات</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            {lowStockProducts.length > 0 && (
              <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-800 dark:text-red-200 p-4 rounded-xl flex gap-3 text-sm">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-red-600" />
                <div>
                  <strong className="text-red-700 dark:text-red-300 text-base mb-1 block">تنبيه: اقتراب نفاذ المخزون!</strong>
                  <ul className="list-disc list-inside space-y-1 marker:text-red-500">
                    {lowStockProducts.map((p) => (
                      <li key={p.id}>
                        المنتج <strong>{p.name}</strong> متبقي منه {p.stock_quantity ?? 10} حبة فقط.
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Card className="bg-green-500/10 border-green-500/20">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold text-green-600 dark:text-green-400">إجمالي المبيعات (إيرادات)</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold font-display">{totalRevenue.toLocaleString("ar-EG")} ج.م</div>
                </CardContent>
              </Card>
              <Card className="bg-blue-500/10 border-blue-500/20">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold text-blue-600 dark:text-blue-400">أرباح الإدارة (من المنتجات)</CardTitle>
                  <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold font-display">{totalOrderProfits.toLocaleString("ar-EG")} ج.م</div>
                </CardContent>
              </Card>
              <Card className="bg-red-500/10 border-red-500/20">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold text-red-600 dark:text-red-400">إجمالي المصروفات</CardTitle>
                  <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold font-display">{totalExpenses.toLocaleString("ar-EG")} ج.م</div>
                </CardContent>
              </Card>
              <Card className="bg-primary/10 border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold text-primary">صافي الربح النهائي</CardTitle>
                  <WalletCards className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold font-display">{netProfit.toLocaleString("ar-EG")} ج.م</div>
                </CardContent>
              </Card>
              <Card className="border-orange-500/20">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-orange-600 dark:text-orange-400">طلبات قيد المراجعة</CardTitle>
                  <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display text-orange-600 dark:text-orange-400">{pendingOrdersCount}</div>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>نظرة عامة على المبيعات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full mt-4" dir="ltr">
                  <Suspense fallback={<div className="text-sm text-muted-foreground">جاري تحميل الرسم البياني...</div>}>
                    <SalesOverviewChart totalRevenue={totalRevenue} totalExpenses={totalExpenses} netProfit={netProfit} />
                  </Suspense>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>المنتجات المتاحة</CardTitle>

                <Dialog
                  open={isAddOpen}
                  onOpenChange={(open) => {
                    setIsAddOpen(open);
                    if (!open) setNewProduct({ name: "", cost_price_egp: 0, profit_egp: 0, price_egp: 0, category: "", description: "", in_stock: true, image_url: "", stock_quantity: 10 });
                  }}
                >
                  <DialogTrigger asChild>
                    <Button className="gap-2"><Plus className="h-4 w-4" /> إضافة منتج</Button>
                  </DialogTrigger>

                  <DialogContent className="sm:max-w-[500px]" dir="rtl">
                    <DialogHeader>
                      <DialogTitle>{newProduct.id ? "تعديل المنتج" : "إضافة منتج جديد"}</DialogTitle>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label>الصورة الرئيسية</Label>
                        <div className="flex items-center gap-4">
                          {newProduct.image_url && (
                            <img
                              src={newProduct.image_url}
                              className="h-16 w-16 object-cover rounded-md border shrink-0"
                              alt="Preview"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <Input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} />
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label>معرض الصور الإضافية (اختياري)</Label>
                        <div className="flex flex-col gap-2">
                          <Input type="file" accept="image/*" multiple onChange={handleGalleryUpload} disabled={uploadingImage} />
                          {newProduct.images && newProduct.images.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {newProduct.images.map((img, idx) => (
                                <div key={idx} className="relative group">
                                  <img src={img} className="h-12 w-12 object-cover rounded-md border" alt={`Gallery ${idx}`} loading="lazy" referrerPolicy="no-referrer" />
                                  <button
                                    type="button"
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => {
                                      const filtered = (newProduct.images || []).filter((_, i) => i !== idx);
                                      setNewProduct((prev) => ({ ...prev, images: filtered }));
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label>اسم المنتج</Label>
                        <Input value={newProduct.name} onChange={(e) => setNewProduct((prev) => ({ ...prev, name: e.target.value }))} />
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="grid gap-2">
                          <Label>التكلفة الأصلية</Label>
                          <Input type="number" value={newProduct.cost_price_egp || ""} onChange={(e) => {
                            const cost = Number(e.target.value);
                            setNewProduct(prev => ({ ...prev, cost_price_egp: cost, price_egp: cost + (prev.profit_egp || 0) }));
                          }} />
                        </div>
                        <div className="grid gap-2">
                          <Label>الربح المطلوب</Label>
                          <Input type="number" value={newProduct.profit_egp || ""} onChange={(e) => {
                            const profit = Number(e.target.value);
                            setNewProduct(prev => ({ ...prev, profit_egp: profit, price_egp: (prev.cost_price_egp || 0) + profit }));
                          }} />
                        </div>
                        <div className="grid gap-2">
                          <Label>سعر البيع النهائي</Label>
                          <Input type="number" disabled value={newProduct.price_egp || ""} className="bg-muted font-bold text-primary" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>التصنيف</Label>
                          <Select 
                            value={newProduct.category || "عام"} 
                            onValueChange={(val) => setNewProduct((prev) => ({ ...prev, category: val }))}
                          >
                            <SelectTrigger className="bg-background">
                              <SelectValue placeholder="اختر التصنيف" />
                            </SelectTrigger>
                            <SelectContent className="bg-background">
                              <SelectItem value="عام">عام</SelectItem>
                              {categories.filter(c => c.name !== "الكل" && c.name !== "عام").map(c => (
                                <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>كمية المخزون</Label>
                          <Input type="number" value={newProduct.stock_quantity ?? 10} onChange={(e) => setNewProduct((prev) => ({ ...prev, stock_quantity: Number(e.target.value) }))} />
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label>الوصف</Label>
                        <Textarea value={newProduct.description} onChange={(e) => setNewProduct((prev) => ({ ...prev, description: e.target.value }))} />
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch checked={newProduct.in_stock} onCheckedChange={(c) => setNewProduct((prev) => ({ ...prev, in_stock: c }))} />
                        <Label>المنتج متاح في المخزن (In Stock)</Label>
                      </div>
                    </div>

                    <Button onClick={saveProduct} className="w-full" disabled={uploadingImage}>حفظ المنتج</Button>
                  </DialogContent>
                </Dialog>
              </CardHeader>

              <CardContent>
                <div className="table-responsive-wrapper"><Table className="text-right" dir="rtl">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الصورة</TableHead>
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right">السعر</TableHead>
                      <TableHead className="text-right">المخزون</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-right"><img src={p.image_url} className="h-10 w-10 rounded-md object-cover" alt={p.name} loading="lazy" referrerPolicy="no-referrer" /></TableCell>
                        <TableCell className="font-semibold">{p.name}</TableCell>
                        <TableCell className="text-right">
                          <div className="font-bold">{p.price_egp.toLocaleString("ar-EG")} ج.م</div>
                          {(p.cost_price_egp || p.profit_egp) ? (
                            <div className="text-xs text-muted-foreground mt-1">
                              ت: {p.cost_price_egp} | ر: {p.profit_egp}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-2">
                            <Badge variant={(p.stock_quantity ?? 10) <= (settings.lowStockThreshold || 3) ? "destructive" : "secondary"}>{p.stock_quantity ?? 10} حبة</Badge>
                            <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-xs" onClick={() => quickUpdateStock(p, -1)}>-</Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-xs" onClick={() => quickUpdateStock(p, 1)}>+</Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-xs" onClick={() => quickUpdateStock(p, 5)}>+5</Button>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`px-2 py-1 text-xs rounded-full ${p.in_stock ? "bg-green-500/20 text-green-600" : "bg-red-500/20 text-red-600"}`}>{p.in_stock ? "متاح" : "نفد"}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-2">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Edit className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="text-red-500" onClick={() => deleteProduct(p.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders">
            <div className="grid gap-4">
              <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-800 dark:text-yellow-200 p-4 rounded-xl flex gap-3 text-sm">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <strong>تنبيه أمني هام:</strong>
                  <p>
                    بالنسبة لطلبات "الدفع أونلاين" عبر (فودافون كاش / إنستاباي)، لا تقم بشحن الطلب إلا بعد التأكد 100% من <strong>تطبيق فودافون كاش أو حسابك البنكي</strong> من وصول المبلغ وتطابق رقم المُرسل.
                  </p>
                </div>
              </div>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>أحدث الطلبات</CardTitle>
                  <Button variant="outline" className="gap-2" onClick={exportOrdersToCSV}>
                    <Download className="h-4 w-4" />
                    تصدير Excel (CSV)
                  </Button>
                </CardHeader>
                <CardContent>
                  {orders.length === 0 ? (
                    <div className="text-center text-muted-foreground py-10">لا توجد طلبات بعد.</div>
                  ) : (
                    <div className="table-responsive-wrapper"><Table className="text-right" dir="rtl">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">العميل (الاسم / العنوان)</TableHead>
                          <TableHead className="text-right">المنتجات</TableHead>
                          <TableHead className="text-right">طريقة الدفع</TableHead>
                          <TableHead className="text-right">الإجمالي</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.slice(0, ordersPage * ordersPerPage).map((o) => {
                          const receiptUrl = safeExternalUrl(o.paymentReceiptUrl);
                          return (
                            <TableRow key={o.id} className={o.status === "completed" ? "opacity-70 bg-muted/50" : ""}>
                              <TableCell className="text-right">
                                <div className="font-semibold">{o.customerName || "غير مسجل"}</div>
                                <div className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate" title={o.customerAddress}>
                                  {o.governorate && <span className="font-semibold text-foreground">{o.governorate} - </span>}
                                  {o.customerAddress || "-"}
                                </div>
                                {o.customerPhone && (
                                  <div className="text-xs font-mono mt-1" dir="ltr">
                                    {normalizePhone(o.customerPhone)}
                                  </div>
                                )}
                                <div className="text-xs text-muted-foreground mt-1">{new Date(o.date).toLocaleDateString("ar-EG")}</div>
                                {o.preferredTime && (
                                  <div className="text-xs text-primary font-medium mt-1">
                                    توصيل: {o.preferredDate && o.preferredDate !== "أي يوم" ? `${o.preferredDate} - ` : ""}
                                    {o.preferredTime}
                                  </div>
                                )}
                              </TableCell>

                              <TableCell className="text-right">
                                <div className="space-y-2">
                                  {o.items.map((it) => (
                                    <div key={it.product.id} className="text-sm bg-muted/30 p-2 rounded-lg border border-border/50">
                                      <div className="font-semibold">{it.qty}x {it.product.name}</div>
                                      {(it.product.cost_price_egp || it.product.profit_egp) ? (
                                        <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                                          <span>التكلفة: <strong className="text-foreground">{it.product.cost_price_egp || 0}</strong> ج.م</span>
                                          <span>الربح: <strong className="text-blue-600 dark:text-blue-400">{it.product.profit_egp || 0}</strong> ج.م</span>
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              </TableCell>

                              <TableCell className="text-right">
                                {o.paymentMethod === "online" ? (
                                  <div className="space-y-2">
                                    <Badge className="bg-primary/20 text-primary hover:bg-primary/20">أونلاين (كاش)</Badge>
                                    <div className="text-[10px] font-bold text-muted-foreground">{o.onlinePaymentMode === "partial" ? "دفع جزء كعربون" : "دفع المبلغ بالكامل"}</div>
                                    <div className="font-mono text-xs" dir="ltr">{normalizePhone(o.senderPhone || "")}</div>
                                    {o.transferredAmount && (
                                      <div className="text-xs font-bold text-green-600 dark:text-green-400">
                                        المُحوَّل: {o.transferredAmount.toLocaleString("ar-EG")} ج.م
                                      </div>
                                    )}
                                    {receiptUrl && (
                                      <a
                                        href={receiptUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-500 hover:underline flex items-center gap-1 bg-blue-500/10 w-fit px-2 py-1 rounded"
                                      >
                                        <ImageIcon className="h-3 w-3" /> عرض الإيصال
                                      </a>
                                    )}
                                  </div>
                                ) : (
                                  <Badge variant="outline">عند الاستلام</Badge>
                                )}
                              </TableCell>

                              <TableCell className="text-right">
                                <div className="font-bold">{o.total.toLocaleString("ar-EG")} ج.م</div>
                                {(() => {
                                  const orderProfit = o.items.reduce((sum, item) => sum + (item.product.profit_egp || 0) * item.qty, 0);
                                  if (orderProfit > 0) {
                                    return <div className="text-xs text-blue-600 dark:text-blue-400 font-bold mt-1">المكسب: +{orderProfit.toLocaleString("ar-EG")} ج.م</div>;
                                  }
                                  return null;
                                })()}
                                {o.shippingCost !== undefined && <div className="text-xs text-muted-foreground mt-1">شحن: {o.shippingCost} ج.م</div>}
                                {o.discountApplied !== undefined && o.discountApplied > 0 && (
                                  <div className="text-xs text-green-600 dark:text-green-400 mt-1">خصم: -{o.discountApplied} ج.م</div>
                                )}
                              </TableCell>

                              <TableCell className="text-right">
                                <div className="flex flex-col gap-2">
                                  {o.status === "pending" && (
                                    <div className="flex gap-2">
                                      {o.paymentMethod === "online" && (!o.senderPhone || !o.transferredAmount || !o.paymentReceiptUrl) ? (
                                        <div className="text-xs text-red-500 font-bold bg-red-500/10 p-1.5 rounded text-center w-full">
                                          بيانات التحويل ناقصة
                                        </div>
                                      ) : o.paymentMethod === "online" && o.onlinePaymentMode === "full" && (o.transferredAmount || 0) < o.total ? (
                                        <div className="text-xs text-red-500 font-bold bg-red-500/10 p-1.5 rounded text-center w-full">
                                          المبلغ المحول غير كافٍ (المطلوب {o.total})
                                        </div>
                                      ) : o.paymentMethod === "online" && o.onlinePaymentMode === "partial" && (o.transferredAmount || 0) !== (settings.depositAmount || 0) ? (
                                        <div className="text-xs text-red-500 font-bold bg-red-500/10 p-1.5 rounded text-center w-full">
                                          يجب أن يكون المبلغ المحول هو العربون فقط ({settings.depositAmount} ج.م)
                                        </div>
                                      ) : (
                                        <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs flex-1" onClick={async () => {
                                          await db.updateOrderStatus(o.id, "prepared");
                                          await refreshAll();
                                          toast.success("تم تحضير الطلب");
                                        }}>تحضير الطلب</Button>
                                      )}
                                      <Button size="sm" variant="outline" className="h-8 text-xs text-red-500 hover:bg-red-50" onClick={async () => {
                                        if (confirm("رفض الطلب؟")) { await db.updateOrderStatus(o.id, "rejected"); await refreshAll(); }
                                      }}>رفض</Button>
                                    </div>
                                  )}
                                  
                                  {o.status === "prepared" && (
                                    <Button size="sm" className="gap-2 bg-amber-600 hover:bg-amber-700 text-white h-8 text-xs w-fit" onClick={async () => {
                                      await db.updateOrderStatus(o.id, "shipped");
                                      await refreshAll();
                                      toast.success("تم تحديث الحالة إلى: قيد الشحن");
                                    }}><Package className="h-3 w-3"/> شحن الطلب</Button>
                                  )}

                                  {o.status === "shipped" && (
                                    <Button size="sm" className="gap-2 bg-green-600 hover:bg-green-700 text-white h-8 text-xs w-fit" onClick={async () => {
                                      if (confirm("هل تم تسليم الطلب للعميل؟ سيتم خصم المخزون الآن.")) {
                                        try {
                                          await db.updateOrderStatusAndDeductStock(o.id, o.items);
                                          await refreshAll();
                                          toast.success("تم توصيل الطلب بنجاح");
                                        } catch (err: any) { toast.error("خطأ: " + err.message); }
                                      }
                                    }}><CheckCircle2 className="h-3 w-3"/> تم التوصيل</Button>
                                  )}

                                  <Badge variant={
                                    o.status === "completed" ? "default" : 
                                    o.status === "shipped" ? "secondary" :
                                    o.status === "prepared" ? "outline" :
                                    o.status === "pending" ? "secondary" : "destructive"
                                  } className={`w-fit ${o.status === "shipped" ? "bg-amber-500/20 text-amber-700 hover:bg-amber-500/20" : o.status === "prepared" ? "border-blue-500/50 text-blue-600" : ""}`}>
                                    {o.status === "completed" ? "مكتمل (تم التوصيل)" : 
                                     o.status === "shipped" ? "قيد الشحن" :
                                     o.status === "prepared" ? "تم التحضير" :
                                     o.status === "pending" ? "قيد المراجعة" :
                                     o.status === "cancelled" ? "ملغي (عميل)" : "مرفوض (إدارة)"}
                                  </Badge>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table></div>
                  )}

                  {orders.length > ordersPage * ordersPerPage && (
                    <div className="mt-6 flex justify-center">
                      <Button variant="outline" onClick={() => setOrdersPage((p) => p + 1)}>
                        تحميل المزيد من الطلبات
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="customers">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>العملاء المسجلين</CardTitle>
                <Dialog open={isAddCustomerOpen} onOpenChange={(open) => { setIsAddCustomerOpen(open); if (!open) setNewCustomer({ name: "", phone: "", address: "", governorate: "" }); }}>
                  <DialogTrigger asChild>
                    <Button className="gap-2"><Plus className="h-4 w-4" /> إضافة عميل</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[400px]" dir="rtl">
                    <DialogHeader>
                      <DialogTitle>إضافة عميل جديد برقم التواصل</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label>الاسم</Label>
                        <Input value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label>رقم التواصل (الهاتف)</Label>
                        <Input type="tel" dir="ltr" className="text-right" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label>المحافظة</Label>
                        <Input value={newCustomer.governorate} onChange={(e) => setNewCustomer({ ...newCustomer, governorate: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label>العنوان بالكامل</Label>
                        <Input value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} />
                      </div>
                    </div>
                    <Button onClick={saveCustomer} className="w-full">حفظ بيانات العميل</Button>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="table-responsive-wrapper"><Table className="text-right" dir="rtl">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right">الهاتف</TableHead>
                      <TableHead className="text-right">العنوان والمحافظة</TableHead>
                      <TableHead className="text-right">نقاط الولاء</TableHead>
                      <TableHead className="text-right">المستوى</TableHead>
                      <TableHead className="text-right">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا يوجد عملاء مسجلين بعد.</TableCell>
                      </TableRow>
                    ) : (
                      users.map((u) => {
                        const totalPts = u.totalEarnedPoints || 0;
                        let tier = "برونزي";
                        if (totalPts >= 2000) tier = "ذهبي";
                        else if (totalPts >= 500) tier = "فضي";

                        return (
                          <TableRow key={u.id}>
                            <TableCell className="font-semibold">{u.name}</TableCell>
                            <TableCell dir="ltr" className="text-right">{normalizePhone(u.phone)}</TableCell>
                            <TableCell className="text-right">{u.governorate} - {u.address}</TableCell>
                            <TableCell className="font-bold text-primary">{u.loyaltyPoints || 0}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant={tier === "ذهبي" ? "default" : tier === "فضي" ? "secondary" : "outline"}>{tier}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                               <Button size="icon" variant="ghost" className="text-red-500" onClick={() => deleteUser(u.id)}>
                                 <Trash2 className="h-4 w-4" />
                               </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="promos">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>كوبونات الخصم (Promo Codes)</CardTitle>
                <Dialog open={isAddPromoOpen} onOpenChange={(open) => { setIsAddPromoOpen(open); if (!open) setNewPromo({ code: "", discountPercentage: 10 }); }}>
                  <DialogTrigger asChild>
                    <Button className="gap-2"><Plus className="h-4 w-4" /> إضافة كوبون</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[400px]" dir="rtl">
                    <DialogHeader>
                      <DialogTitle>إضافة كوبون جديد</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label>كود الخصم (مثال: EID20)</Label>
                        <Input value={newPromo.code} onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value })} dir="ltr" className="text-right uppercase" />
                      </div>
                      <div className="grid gap-2">
                        <Label>نسبة الخصم المئوية (%)</Label>
                        <Input type="number" min="1" max="100" value={newPromo.discountPercentage || ""} onChange={(e) => setNewPromo({ ...newPromo, discountPercentage: Number(e.target.value) })} />
                      </div>
                    </div>
                    <Button onClick={savePromoCode} className="w-full">حفظ الكوبون</Button>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="table-responsive-wrapper"><Table className="text-right" dir="rtl">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">كود الخصم</TableHead>
                      <TableHead className="text-right">نسبة الخصم</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {promoCodes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا توجد كوبونات خصم.</TableCell>
                      </TableRow>
                    ) : (
                      promoCodes.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-bold text-lg tracking-widest font-mono uppercase">{c.code}</TableCell>
                          <TableCell className="font-semibold text-green-600">%{c.discountPercentage}</TableCell>
                          <TableCell className="text-right"><Switch checked={c.isActive} onCheckedChange={() => togglePromoStatus(c)} /></TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" className="text-red-500" onClick={() => deletePromoCode(c.id)}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>إدارة فئات المنتجات</CardTitle>
                <div className="flex gap-2">
                  <Input 
                    placeholder="اسم الفئة الجديدة" 
                    value={newCategoryName} 
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="max-w-xs"
                  />
                  <Button onClick={saveCategory} className="gap-2"><Plus className="h-4 w-4" /> إضافة</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="table-responsive-wrapper"><Table className="text-right" dir="rtl">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">اسم الفئة</TableHead>
                      <TableHead className="text-right">عدد المنتجات</TableHead>
                      <TableHead className="text-right">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-semibold">{c.name}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">
                            {products.filter(p => p.category === c.name).length} منتج
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {c.name !== "الكل" && c.name !== "عام" && (
                            <Button size="icon" variant="ghost" className="text-red-500" onClick={() => deleteCategory(c.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card className="max-w-2xl">
              <CardHeader><CardTitle>إعدادات المتجر العامة</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4 bg-muted/50 p-4 rounded-xl border">
                  <div className="flex items-center gap-2 mb-2"><TrendingDown className="h-5 w-5 text-green-600" /><h3 className="font-semibold text-lg">الخصومات التلقائية</h3></div>
                  <p className="text-sm text-muted-foreground mb-4">حدد نسبة خصم مئوية سيتم تطبيقها تلقائياً على إجمالي المنتجات في سلة المشتريات لجميع العملاء. (اجعلها 0 لإلغاء الخصم).</p>
                  <div className="space-y-2 max-w-sm">
                    <Label htmlFor="discount">نسبة الخصم المئوية (%)</Label>
                    <Input id="discount" type="number" min="0" max="100" value={settings.discountPercentage} onChange={(e) => setSettings({ ...settings, discountPercentage: Number(e.target.value) })} />
                  </div>
                </div>

                <div className="space-y-4 bg-muted/50 p-4 rounded-xl border">
                  <div className="flex items-center gap-2 mb-2"><AlertCircle className="h-5 w-5 text-orange-500" /><h3 className="font-semibold text-lg">تنبيهات المخزون</h3></div>
                  <p className="text-sm text-muted-foreground mb-4">حدد الحد الأدنى لكمية المنتج التي ترغب في تلقي تنبيه عند وصول المخزون إليها.</p>
                  <div className="space-y-2 max-w-sm">
                    <Label htmlFor="lowStock">الحد الأدنى للتنبيه</Label>
                    <Input id="lowStock" type="number" min="1" value={settings.lowStockThreshold || 3} onChange={(e) => setSettings({ ...settings, lowStockThreshold: Number(e.target.value) })} />
                  </div>
                </div>

                <div className="space-y-4 bg-muted/50 p-4 rounded-xl border">
                  <div className="flex items-center gap-2 mb-2"><WalletCards className="h-5 w-5 text-blue-600" /><h3 className="font-semibold text-lg">نظام العربون</h3></div>
                  <p className="text-sm text-muted-foreground mb-4">حدد قيمة العربون الافتراضية المطلوب دفعها عند اختيار الدفع الجزئي أونلاين.</p>
                  <div className="space-y-2 max-w-sm">
                    <Label htmlFor="deposit">قيمة العربون (ج.م)</Label>
                    <Input id="deposit" type="number" min="0" value={settings.depositAmount || 0} onChange={(e) => setSettings({ ...settings, depositAmount: Number(e.target.value) })} />
                  </div>
                </div>

                <div className="space-y-4 bg-muted/50 p-4 rounded-xl border">
                  <div className="flex items-center gap-2 mb-2"><DollarSign className="h-5 w-5 text-purple-600" /><h3 className="font-semibold text-lg">بيانات السحب والتحويل</h3></div>
                  <p className="text-sm text-muted-foreground mb-4">أضف رقم الحساب البنكي أو محفظتك الرقمية للتحويلات والسحب.</p>
                  <div className="space-y-2 max-w-sm">
                    <Label htmlFor="bankAccount">رقم الحساب البنكي / المحفظة</Label>
                    <Input id="bankAccount" type="text" placeholder="مثال: 1234567890" value={settings.bankAccountNumber || ""} onChange={(e) => setSettings({ ...settings, bankAccountNumber: e.target.value })} />
                  </div>
                </div>

                <Button onClick={handleSaveSettings} disabled={savingSettings} className="w-full sm:w-auto">{savingSettings ? "جاري الحفظ..." : "حفظ الإعدادات"}</Button>
              </CardContent>
            </Card>

            <Card className="max-w-2xl mt-6 border-red-200 bg-red-50/30">
              <CardHeader>
                <CardTitle className="text-red-600 flex items-center gap-2">
                  <Trash2 className="h-5 w-5" />
                  تصفية الحسابات والبيانات
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  تحذير: هذه العمليات نهائية ولا يمكن التراجع عنها. سيتم مسح كافة البيانات المختارة من قاعدة البيانات.
                </p>
                
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-100" onClick={() => resetFinance("orders")}>
                    مسح كافة الطلبات
                  </Button>
                  <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-100" onClick={() => resetFinance("expenses")}>
                    مسح كافة المصروفات
                  </Button>
                  <Button variant="destructive" className="font-bold" onClick={() => resetFinance("all")}>
                    تصفية الحسابات بالكامل
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="expenses">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>سجل المصروفات (تكاليف، شحن، أخرى)</CardTitle>
                <Dialog open={isAddExpenseOpen} onOpenChange={(open) => { setIsAddExpenseOpen(open); if (!open) setNewExpense({ name: "", amount: 0 }); }}>
                  <DialogTrigger asChild>
                    <Button className="gap-2"><Plus className="h-4 w-4" /> إضافة مصروف</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[400px]" dir="rtl">
                    <DialogHeader><DialogTitle>إضافة مصروف جديد</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2"><Label>نوع المصروف (توصيل، منتجات، إعلانات)</Label><Input value={newExpense.name} onChange={(e) => setNewExpense({ ...newExpense, name: e.target.value })} /></div>
                      <div className="grid gap-2"><Label>المبلغ (جنيه)</Label><Input type="number" value={newExpense.amount || ""} onChange={(e) => setNewExpense({ ...newExpense, amount: Number(e.target.value) })} /></div>
                    </div>
                    <Button onClick={saveExpense} className="w-full">حفظ المصروف</Button>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="table-responsive-wrapper"><Table className="text-right" dir="rtl">
                  <TableHeader><TableRow><TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">البيان</TableHead><TableHead className="text-right">المبلغ</TableHead><TableHead className="text-right">إجراء</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {expenses.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا توجد مصروفات مسجلة.</TableCell></TableRow>
                    ) : (
                      expenses.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-right">{new Date(e.date).toLocaleDateString("ar-EG")}</TableCell>
                          <TableCell className="font-semibold">{e.name}</TableCell>
                          <TableCell className="font-bold text-red-500">{e.amount.toLocaleString("ar-EG")} ج.م</TableCell>
                          <TableCell className="text-right"><Button size="icon" variant="ghost" className="text-red-500" onClick={() => deleteExpense(e.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table></div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import type { Expense, Order, Product, PromoCode, StoreSettings, UserProfile } from "@/lib/types";
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
import {
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Download,
  Edit,
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
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

// Lazy-load Recharts to keep initial bundle light
const SalesOverviewChart = lazy(() => import("@/components/admin/SalesOverviewChart"));

const ADMIN_EMAIL = (import.meta as any).env?.VITE_ADMIN_EMAIL?.toString()?.trim()?.toLowerCase() || "admin@hala-alyusr.com";
// ضيف السطر ده تحت الـ imports اللي في الصورة
const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;

function sanitizeFileName(name: string) {
  return name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 120);
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

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [settings, setSettings] = useState<StoreSettings>({ discountPercentage: 0, lowStockThreshold: 3 });

  const [savingSettings, setSavingSettings] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const ordersPerPage = 20;

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isAddPromoOpen, setIsAddPromoOpen] = useState(false);

  const [newExpense, setNewExpense] = useState({ name: "", amount: 0 });
  const [newPromo, setNewPromo] = useState({ code: "", discountPercentage: 10 });

  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    name: "",
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
      const ok = !!user && (user.email || "").toLowerCase() === ADMIN_EMAIL;
      setIsAuthenticated(ok);
    });

    return () => unsubscribe();
  }, []);

  const refreshAll = useCallback(async () => {
    const [p, s, o, e, u, promo] = await Promise.all([
      db.getProducts(),
      db.getSettings(),
      db.getOrders(),
      db.getExpenses(),
      db.getAllUsers(),
      db.getPromoCodes(),
    ]);

    setProducts(p);
    setSettings(s);
    setOrders(o);
    setExpenses(e);
    setUsers(u);
    setPromoCodes(promo);

    const low = p.filter((item) => (item.stock_quantity ?? 10) <= (s.lowStockThreshold || 3));
    if (low.length > 0) {
      toast.error(`تنبيه: يوجد ${low.length} منتجات وصل مخزونها للحد الأدنى!`, { duration: 5000 });
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const completedOrders = useMemo(() => orders.filter((o) => o.status === "completed"), [orders]);
  const totalRevenue = useMemo(() => completedOrders.reduce((sum, o) => sum + o.total, 0), [completedOrders]);
  const pendingOrdersCount = useMemo(() => orders.filter((o) => o.status === "pending").length, [orders]);
  const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);
  const netProfit = useMemo(() => totalRevenue - totalExpenses, [totalRevenue, totalExpenses]);
  const lowStockProducts = useMemo(
    () => products.filter((p) => (p.stock_quantity ?? 10) <= (settings.lowStockThreshold || 3)),
    [products, settings.lowStockThreshold]
  );

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!hasFirebase || !auth) {
        toast.error("تسجيل الدخول للإدارة غير متاح حالياً لأن Firebase غير متصل. قم بضبط مفاتيح Firebase في .env");
        return;
      }

      if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
        toast.error("غير مصرح لك بالدخول للإدارة.");
        return;
      }

      setAuthLoading(true);
      try {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        toast.success("تم تسجيل الدخول كمسؤول");
      } catch {
        toast.error("بيانات الدخول غير صحيحة");
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

  const togglePromoStatus = useCallback(
    async (promo: PromoCode) => {
      const updatedPromo = { ...promo, isActive: !promo.isActive };
      const updatedList = promoCodes.map((c) => (c.id === promo.id ? updatedPromo : c));
      await db.savePromoCodes(updatedList);
      setPromoCodes(updatedList);
    },
    [promoCodes]
  );

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
        o.paymentMethod === "online" ? "أونلاين" : "عند الاستلام",
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
      };
      await db.saveSettings(clean);
      setSettings(clean);
      toast.success("تم حفظ إعدادات المتجر بنجاح");
    } finally {
      setSavingSettings(false);
    }
  }, [settings.discountPercentage, settings.lowStockThreshold]);

  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
  
    // جلب البيانات من الـ env
    const apiKey = import.meta.env.VITE_IMGBB_API_KEY;
    const apiUrl = import.meta.env.VITE_IMGBB_API_URL;
  
    if (!apiKey || !apiUrl) {
      toast.error("إعدادات الرفع (API) غير مكتملة في ملف .env");
      return;
    }
  
    setUploadingImage(true);
    const toastId = toast.loading("جاري رفع صورة الإسدال...");
  
    try {
      const formData = new FormData();
      formData.append('image', file);
  
      // الرفع باستخدام القيم المستدعاة
      const response = await fetch(`${apiUrl}?key=${apiKey}`, {
        method: 'POST',
        body: formData,
      });
  
      const result = await response.json();
  
      if (result.success) {
        setNewProduct((prev) => ({ ...prev, image_url: result.data.url }));
        toast.success("تم الرفع بنجاح!", { id: toastId });
      } else {
        throw new Error("ImgBB Error");
      }
    } catch (error) {
      toast.error("فشل الرفع، تأكد من اتصالك بالإنترنت", { id: toastId });
    } finally {
      setUploadingImage(false);
    }
  }, [setNewProduct]);

  const handleGalleryUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const validFiles = files.filter((f) => f.size <= 2 * 1024 * 1024 && f.type.startsWith("image/"));
    if (validFiles.length < files.length) {
      toast.warning("تم تجاهل بعض الملفات (حجم أكبر من 2MB أو ليست صورة)");
    }

    if (!(hasFirebase && storage)) {
      toast.error("رفع الصور غير متاح لأن Firebase Storage غير متصل.");
      return;
    }

    setUploadingImage(true);
    const toastId = toast.loading("جاري رفع الصور...");
    try {
      const urls = await Promise.all(
        validFiles.map(async (file) => {
          const safeName = sanitizeFileName(file.name);
          const fileRef = ref(storage!, `products/${nanoid()}_${safeName}`);
          const uploadTask = await uploadBytes(fileRef, file);
          return await getDownloadURL(uploadTask.ref);
        })
      );

      setNewProduct((prev) => ({ ...prev, images: [...(prev.images || []), ...urls] }));
      toast.success("تم رفع الصور بنجاح", { id: toastId });
    } catch {
      toast.error("فشل رفع الصور", { id: toastId });
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
      name,
      price_egp: price,
      category: (newProduct.category || "عام").trim() || "عام",
      in_stock: (newProduct.in_stock ?? true) && stock > 0,
      description: (newProduct.description || "").trim(),
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
    setNewProduct({ name: "", price_egp: 0, category: "", description: "", in_stock: true, image_url: "", stock_quantity: 10 });
  }, [newProduct, products]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4" dir="rtl">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="font-display text-2xl">تسجيل الدخول للإدارة</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">أدخل بيانات المسؤول للوصول</p>
          </CardHeader>
          <CardContent>
            {!hasFirebase && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-800 dark:text-red-200 p-3 rounded-xl text-sm">
                <strong>Firebase غير متصل.</strong>
                <div className="mt-1">لأسباب أمنية، تم تعطيل تسجيل الدخول المحلي. قم بضبط مفاتيح Firebase في .env ثم أعد النشر.</div>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  className="text-left"
                  required
                  disabled={!hasFirebase}
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                  className="text-left tracking-widest"
                  required
                  disabled={!hasFirebase}
                  autoComplete="current-password"
                />
                <div className="text-left mt-1">
                  <button
                    type="button"
                    onClick={() => toast.info("لتغيير كلمة المرور استخدم إعادة تعيين كلمة المرور من Firebase Auth أو تواصل مع المسؤول")}
                    className="text-xs text-primary hover:underline"
                  >
                    نسيت/تغيير كلمة المرور؟
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={authLoading || !hasFirebase}>
                {authLoading ? "جاري التحقق..." : "تسجيل الدخول"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" asChild>
                <Link href="/">العودة للمتجر</Link>
              </Button>
            </form>
          </CardContent>
        </Card>
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

            <div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-4">
              <Card className="bg-green-500/10 border-green-500/20">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-green-600 dark:text-green-400">إجمالي المبيعات (إيرادات)</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display">{totalRevenue.toLocaleString("ar-EG")} جنيه</div>
                </CardContent>
              </Card>
              <Card className="bg-red-500/10 border-red-500/20">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-red-600 dark:text-red-400">إجمالي المصروفات (تكاليف)</CardTitle>
                  <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display">{totalExpenses.toLocaleString("ar-EG")} جنيه</div>
                </CardContent>
              </Card>
              <Card className="bg-primary/10 border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-primary">صافي الربح (للطلبات المكتملة)</CardTitle>
                  <DollarSign className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display">{netProfit.toLocaleString("ar-EG")} جنيه</div>
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
                    if (!open) setNewProduct({ name: "", price_egp: 0, category: "", description: "", in_stock: true, image_url: "", stock_quantity: 10 });
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

                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>السعر (جنيه)</Label>
                          <Input type="number" value={newProduct.price_egp || ""} onChange={(e) => setNewProduct((prev) => ({ ...prev, price_egp: Number(e.target.value) }))} />
                        </div>
                        <div className="grid gap-2">
                          <Label>التصنيف</Label>
                          <Input value={newProduct.category} onChange={(e) => setNewProduct((prev) => ({ ...prev, category: e.target.value }))} placeholder="إسدالات، ملابس..." />
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
                <div className="overflow-x-auto"><Table className="text-right" dir="rtl">
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
                        <TableCell className="text-right">{p.price_egp.toLocaleString("ar-EG")} ج.م</TableCell>
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
                    <div className="overflow-x-auto"><Table className="text-right" dir="rtl">
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
                                <div className="space-y-1">{o.items.map((it) => <div key={it.product.id} className="text-sm">{it.qty}x {it.product.name}</div>)}</div>
                              </TableCell>

                              <TableCell className="text-right">
                                {o.paymentMethod === "online" ? (
                                  <div className="space-y-1">
                                    <Badge className="bg-primary/20 text-primary hover:bg-primary/20">أونلاين (كاش)</Badge>
                                    <div className="font-mono text-xs" dir="ltr">{normalizePhone(o.senderPhone || "")}</div>
                                    {receiptUrl && (
                                      <a
                                        href={receiptUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                                      >
                                        <ImageIcon className="h-3 w-3" /> عرض إيصال التحويل
                                      </a>
                                    )}
                                  </div>
                                ) : (
                                  <Badge variant="outline">عند الاستلام</Badge>
                                )}
                              </TableCell>

                              <TableCell className="text-right">
                                <div className="font-bold">{o.total.toLocaleString("ar-EG")} ج.م</div>
                                {o.shippingCost !== undefined && <div className="text-xs text-muted-foreground mt-1">شحن: {o.shippingCost} ج.م</div>}
                                {o.discountApplied !== undefined && o.discountApplied > 0 && (
                                  <div className="text-xs text-green-600 dark:text-green-400 mt-1">خصم: -{o.discountApplied} ج.م</div>
                                )}
                              </TableCell>

                              <TableCell className="text-right">
                                {o.status === "pending" ? (
                                  <Button
                                    size="sm"
                                    className="gap-2"
                                    onClick={async () => {
                                      if (confirm("هل أنت متأكد من تحويل الطلب لمكتمل؟ (سيتم خصم الكمية من المخزون وإرسال رسالة تأكيد للعميل)")) {
                                        try {
                                          await db.updateOrderStatusAndDeductStock(o.id, o.items);
                                          await refreshAll();
                                          toast.success("تم تحديث حالة الطلب وخصم المخزون بنجاح");

                                          if (o.customerPhone) {
                                            const phoneDigits = normalizePhone(o.customerPhone);
                                            const phone = phoneDigits.startsWith("0") ? "2" + phoneDigits : phoneDigits;
                                            const msg = `مرحباً${o.customerName ? " " + o.customerName : ""}، تم تأكيد استلام طلبك (رقم ${o.id.substring(0, 6)}) من متجر هلا اليسر بنجاح. شكراً لثقتكم بنا!`;
                                            const wa = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
                                            window.open(wa, "_blank", "noopener,noreferrer");
                                          }
                                        } catch (err: any) {
                                          toast.error("حدث خطأ: " + (err?.message || ""));
                                        }
                                      }
                                    }}
                                  >
                                    <CheckCircle2 className="h-4 w-4" /> تأكيد
                                  </Button>
                                ) : (
                                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm font-semibold">
                                    <CheckCircle2 className="h-4 w-4" /> مكتمل
                                  </span>
                                )}
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
              <CardHeader>
                <CardTitle>العملاء المسجلين</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto"><Table className="text-right" dir="rtl">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right">الهاتف</TableHead>
                      <TableHead className="text-right">العنوان والمحافظة</TableHead>
                      <TableHead className="text-right">نقاط الولاء</TableHead>
                      <TableHead className="text-right">المستوى</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">لا يوجد عملاء مسجلين بعد.</TableCell>
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
                <div className="overflow-x-auto"><Table className="text-right" dir="rtl">
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

                <Button onClick={handleSaveSettings} disabled={savingSettings} className="w-full sm:w-auto">{savingSettings ? "جاري الحفظ..." : "حفظ الإعدادات"}</Button>
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
                <div className="overflow-x-auto"><Table className="text-right" dir="rtl">
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

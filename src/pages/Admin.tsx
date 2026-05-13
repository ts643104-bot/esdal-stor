import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import type { Product, Order, Expense, StoreSettings, UserProfile, PromoCode } from "@/lib/types";
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
import { LayoutDashboard, Package, ShoppingCart, Plus, Trash2, Edit, DollarSign, Lock, LogOut, WalletCards, TrendingUp, TrendingDown, CheckCircle2, AlertCircle, Settings, Users, Tag, Download, Image as ImageIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { hasFirebase, auth, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { Globe } from "lucide-react";

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [newExpense, setNewExpense] = useState({ name: "", amount: 0 });
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [isAddPromoOpen, setIsAddPromoOpen] = useState(false);
  const [newPromo, setNewPromo] = useState({ code: "", discountPercentage: 10 });
  const [settings, setSettings] = useState<StoreSettings>({ discountPercentage: 0, lowStockThreshold: 3 });
  const { t, lang, setLang } = useLanguage();
  const [savingSettings, setSavingSettings] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const ordersPerPage = 20;

  useEffect(() => {
    if (hasFirebase && auth) {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user && user.email?.toLowerCase() === "admin@esdal.com") {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          sessionStorage.removeItem("admin_auth");
        }
      });
      return () => unsubscribe();
    } else {
      if (sessionStorage.getItem("admin_auth") === "true") {
        setIsAuthenticated(true);
      }
    }
  }, []);

  const [email, setEmail] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (email.toLowerCase() !== "admin@esdal.com") {
      toast.error("غير مصرح لك بالدخول للإدارة. فقط admin@esdal.com مسموح له.");
      return;
    }

    if (hasFirebase && auth) {
      setAuthLoading(true);
      try {
        await signInWithEmailAndPassword(auth, email, password);
        setIsAuthenticated(true);
        sessionStorage.setItem("admin_auth", "true");
        toast.success("تم تسجيل الدخول كمسؤول");
      } catch (err: any) {
        toast.error("بيانات الدخول غير صحيحة");
      } finally {
        setAuthLoading(false);
      }
    } else {
      // Local fallback
      if (password === "esdal2026") {
        setIsAuthenticated(true);
        sessionStorage.setItem("admin_auth", "true");
        toast.success("تم تسجيل الدخول (وضع محلي)");
      } else {
        toast.error("كلمة المرور غير صحيحة");
      }
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem("admin_auth");
    setPassword("");
    setEmail("");
  };

  // New product state
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
    const load = async () => {
      const p = await db.getProducts();
      const s = await db.getSettings();
      setProducts(p);
      setSettings(s);
      setOrders(await db.getOrders());
      setExpenses(await db.getExpenses());
      setUsers(await db.getAllUsers());
      setPromoCodes(await db.getPromoCodes());
      
      const low = p.filter(item => (item.stock_quantity ?? 10) <= (s.lowStockThreshold || 3));
      if (low.length > 0) {
        toast.error(`تنبيه: يوجد ${low.length} منتجات وصل مخزونها للحد الأدنى!`, { duration: 5000 });
      }
    };
    load();
  }, []);

  const completedOrders = orders.filter(o => o.status === "completed");
  const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total, 0);
  const pendingOrdersCount = orders.filter(o => o.status === "pending").length;
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;
  const lowStockProducts = products.filter(p => (p.stock_quantity ?? 10) <= (settings.lowStockThreshold || 3));

  const saveExpense = async () => {
    if (!newExpense.name || newExpense.amount <= 0) {
      toast.error("يرجى إدخال اسم المصروف وقيمة صحيحة");
      return;
    }
    const expense: Expense = {
      id: nanoid(),
      name: newExpense.name,
      amount: newExpense.amount,
      date: new Date().toISOString(),
    };
    const updated = [expense, ...expenses];
    await db.saveExpenses(updated);
    setExpenses(updated);
    setIsAddExpenseOpen(false);
    setNewExpense({ name: "", amount: 0 });
    toast.success("تمت إضافة المصروف");
  };

  const savePromoCode = async () => {
    if (!newPromo.code || newPromo.discountPercentage <= 0) {
      toast.error("يرجى إدخال كود وخصم صحيح");
      return;
    }
    const promo: PromoCode = {
      id: nanoid(),
      code: newPromo.code,
      discountPercentage: newPromo.discountPercentage,
      isActive: true,
    };
    const updated = [promo, ...promoCodes];
    await db.savePromoCodes(updated);
    setPromoCodes(updated);
    setIsAddPromoOpen(false);
    setNewPromo({ code: "", discountPercentage: 10 });
    toast.success("تمت إضافة الكود");
  };

  const deletePromoCode = async (id: string) => {
    if (confirm("هل أنت متأكد من حذف الكود؟")) {
      await db.deletePromoCode(id);
      setPromoCodes(promoCodes.filter((c) => c.id !== id));
      toast.success("تم حذف الكود");
    }
  };

  const togglePromoStatus = async (promo: PromoCode) => {
    const updatedPromo = { ...promo, isActive: !promo.isActive };
    const updatedList = promoCodes.map(c => c.id === promo.id ? updatedPromo : c);
    await db.savePromoCodes(updatedList);
    setPromoCodes(updatedList);
  };

  const exportOrdersToCSV = () => {
    const headers = ["رقم الطلب", "التاريخ", "اسم العميل", "الهاتف", "المحافظة", "المنتجات", "الإجمالي", "طريقة الدفع", "الحالة"];
    const rows = orders.map(o => {
      const itemsStr = o.items.map(i => `${i.qty}x ${i.product.name}`).join(" + ");
      return [
        o.id,
        new Date(o.date).toLocaleDateString("ar-EG"),
        o.customerName || "-",
        o.customerPhone || "-",
        o.governorate || "-",
        itemsStr,
        o.total.toString(),
        o.paymentMethod === "online" ? "أونلاين" : "عند الاستلام",
        o.status === "completed" ? "مكتمل" : "قيد المراجعة"
      ].map(field => `"${field}"`).join(",");
    });
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `esdal_orders_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deleteExpense = async (id: string) => {
    if (confirm("هل أنت متأكد من حذف المصروف؟")) {
      await db.deleteExpense(id);
      setExpenses(expenses.filter((e) => e.id !== id));
      toast.success("تم حذف المصروف");
    }
  };

  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("الصورة كبيرة جداً. يرجى اختيار صورة أقل من 2MB");
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.error("يجب اختيار ملف صورة صالح");
        return;
      }
      
      if (hasFirebase && storage) {
        setUploadingImage(true);
        const toastId = toast.loading("جاري رفع الصورة...");
        try {
          const fileRef = ref(storage!, `products/${nanoid()}_${file.name}`);
          const uploadTask = await uploadBytes(fileRef, file);
          const url = await getDownloadURL(uploadTask.ref);
          setNewProduct({ ...newProduct, image_url: url });
          toast.success("تم رفع الصورة بنجاح", { id: toastId });
        } catch (error) {
          toast.error("فشل رفع الصورة لـ Storage", { id: toastId });
        } finally {
          setUploadingImage(false);
        }
      } else {
        const reader = new FileReader();
        reader.onloadend = () => {
          setNewProduct({ ...newProduct, image_url: reader.result as string });
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    
    const validFiles = files.filter(f => f.size <= 2 * 1024 * 1024 && f.type.startsWith("image/"));
    if (validFiles.length < files.length) {
      toast.warning("تم تجاهل بعض الملفات (حجم أكبر من 2MB أو ليست صورة)");
    }
    
    if (hasFirebase && storage) {
      setUploadingImage(true);
      const toastId = toast.loading("جاري رفع الصور...");
      try {
        const urls = await Promise.all(validFiles.map(async (file) => {
          const fileRef = ref(storage!, `products/${nanoid()}_${file.name}`);
          const uploadTask = await uploadBytes(fileRef, file);
          return await getDownloadURL(uploadTask.ref);
        }));
        setNewProduct({ ...newProduct, images: [...(newProduct.images || []), ...urls] });
        toast.success("تم رفع الصور بنجاح", { id: toastId });
      } catch (error) {
        toast.error("فشل رفع الصور", { id: toastId });
      } finally {
        setUploadingImage(false);
      }
    } else {
      const newImages = [...(newProduct.images || [])];
      let loaded = 0;
      validFiles.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          newImages.push(reader.result as string);
          loaded++;
          if (loaded === validFiles.length) {
            setNewProduct({ ...newProduct, images: newImages });
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const saveProduct = async () => {
    if (!newProduct.name || !newProduct.price_egp || !newProduct.image_url) {
      toast.error("يرجى ملء الاسم والسعر واختيار صورة");
      return;
    }
    
    if (isNaN(Number(newProduct.price_egp)) || Number(newProduct.price_egp) < 0) {
      toast.error("يرجى إدخال سعر صحيح (رقم موجب)");
      return;
    }
    
    if (isNaN(Number(newProduct.stock_quantity)) || Number(newProduct.stock_quantity) < 0) {
      toast.error("يرجى إدخال كمية صحيحة (رقم موجب)");
      return;
    }

    const product: Product = {
      id: newProduct.id || nanoid(),
      name: newProduct.name,
      price_egp: Number(newProduct.price_egp),
      category: newProduct.category || "عام",
      in_stock: newProduct.in_stock ?? true,
      description: newProduct.description,
      image_url: newProduct.image_url,
      images: newProduct.images || [],
      stock_quantity: Number(newProduct.stock_quantity),
    };

    let updatedList;
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
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    await db.saveSettings(settings);
    toast.success("تم حفظ إعدادات المتجر بنجاح");
    setSavingSettings(false);
  };

  const deleteProduct = async (id: string) => {
    if (confirm("هل أنت متأكد من حذف المنتج؟")) {
      await db.deleteProduct(id);
      setProducts(products.filter((p) => p.id !== id));
      toast.success("تم حذف المنتج");
    }
  };

  const openEdit = (p: Product) => {
    setNewProduct(p);
    setIsAddOpen(true);
  };

  const quickUpdateStock = async (p: Product, amount: number) => {
    const newStock = Math.max(0, (p.stock_quantity ?? 10) + amount);
    const updatedProduct = { ...p, stock_quantity: newStock, in_stock: newStock > 0 };
    const updatedList = products.map(item => item.id === p.id ? updatedProduct : item);
    await db.saveProducts(updatedList);
    setProducts(updatedList);
    toast.success(`تم تحديث مخزون ${p.name} إلى ${newStock}`);
  };

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
                  required={hasFirebase}
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
                />
                <div className="text-left mt-1">
                  <button 
                    type="button" 
                    onClick={() => toast.info("لتغيير كلمة المرور يرجى إرسال رسالة إلى البريد الإلكتروني الخاص بالمسؤول")}
                    className="text-xs text-primary hover:underline"
                  >
                    نسيت/تغيير كلمة المرور؟
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={authLoading}>
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
          <div className="flex gap-2 items-center">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              title={lang === "ar" ? "Switch to English" : "تغيير للغة العربية"}
            >
              <Globe className="h-5 w-5" />
            </Button>
            <Button variant="outline" onClick={handleLogout} className="gap-2 text-destructive hover:text-destructive">
              <LogOut className="h-4 w-4" /> تسجيل الخروج
            </Button>
            <Button asChild variant="secondary">
              <Link href="/">العودة للمتجر</Link>
            </Button>
          </div>
        </header>

        {!hasFirebase && (
          <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-800 dark:text-red-200 p-4 rounded-xl flex gap-3 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <strong>تنبيه هام (أنت تعمل على التخزين المحلي):</strong>
              <p>قاعدة بيانات Firebase غير متصلة. أي منتجات أو مصروفات تضيفها هنا ستُحفظ في <b>متصفحك أنت فقط</b> ولن يراها العملاء. لكي يعمل المتجر على "الدومين كله" ويكون متاحاً للجميع، يرجى إنشاء حساب في Firebase وإضافة المفاتيح في ملف <code>.env</code>.</p>
            </div>
          </div>
        )}

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-card border w-full justify-start h-12 overflow-x-auto">
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
                    {lowStockProducts.map(p => (
                      <li key={p.id}>
                        المنتج <strong>{p.name}</strong> متبقي منه {p.stock_quantity ?? 10} قطع فقط.
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
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: "الإيرادات", value: totalRevenue, fill: "#16a34a" },
                      { name: "المصروفات", value: totalExpenses, fill: "#dc2626" },
                      { name: "صافي الربح", value: netProfit, fill: "#2563eb" }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value) => `${value} ج.م`} cursor={{fill: 'transparent'}} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>المنتجات المتاحة</CardTitle>
                <Dialog open={isAddOpen} onOpenChange={(open) => {
                  setIsAddOpen(open);
                  if (!open) setNewProduct({ name: "", price_egp: 0, category: "", description: "", in_stock: true, image_url: "", stock_quantity: 10 });
                }}>
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
                            <img src={newProduct.image_url} className="h-16 w-16 object-cover rounded-md border shrink-0" alt="Preview" />
                          )}
                          <Input type="file" accept="image/*" onChange={handleImageUpload} />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label>معرض الصور الإضافية (اختياري)</Label>
                        <div className="flex flex-col gap-2">
                          <Input type="file" accept="image/*" multiple onChange={handleGalleryUpload} />
                          {newProduct.images && newProduct.images.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {newProduct.images.map((img, idx) => (
                                <div key={idx} className="relative group">
                                  <img src={img} className="h-12 w-12 object-cover rounded-md border" alt={`Gallery ${idx}`} />
                                  <button 
                                    type="button" 
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => {
                                      const filtered = (newProduct.images || []).filter((_, i) => i !== idx);
                                      setNewProduct({ ...newProduct, images: filtered });
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
                        <Input value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>السعر (جنيه)</Label>
                          <Input type="number" value={newProduct.price_egp || ""} onChange={(e) => setNewProduct({ ...newProduct, price_egp: Number(e.target.value) })} />
                        </div>
                        <div className="grid gap-2">
                          <Label>التصنيف</Label>
                          <Input value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })} placeholder="إسدالات، ملابس..." />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>كمية المخزون</Label>
                          <Input type="number" value={newProduct.stock_quantity ?? 10} onChange={(e) => setNewProduct({ ...newProduct, stock_quantity: Number(e.target.value) })} />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label>الوصف</Label>
                        <Textarea value={newProduct.description} onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })} />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={newProduct.in_stock} onCheckedChange={(c) => setNewProduct({ ...newProduct, in_stock: c })} />
                        <Label>المنتج متاح في المخزن (In Stock)</Label>
                      </div>
                    </div>
                    <Button onClick={saveProduct} className="w-full">حفظ المنتج</Button>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الصورة</TableHead>
                      <TableHead>الاسم</TableHead>
                      <TableHead>السعر</TableHead>
                      <TableHead>المخزون</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell><img src={p.image_url} className="h-10 w-10 rounded-md object-cover" alt="" /></TableCell>
                        <TableCell className="font-semibold">{p.name}</TableCell>
                        <TableCell>{p.price_egp.toLocaleString("ar-EG")} ج.م</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={(p.stock_quantity ?? 10) <= (settings.lowStockThreshold || 3) ? "destructive" : "secondary"}>
                              {p.stock_quantity ?? 10} حبة
                            </Badge>
                            <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-xs" onClick={() => quickUpdateStock(p, -1)}>-</Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-xs" onClick={() => quickUpdateStock(p, 1)}>+</Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-xs" onClick={() => quickUpdateStock(p, 5)}>+5</Button>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 text-xs rounded-full ${p.in_stock ? 'bg-green-500/20 text-green-600' : 'bg-red-500/20 text-red-600'}`}>
                            {p.in_stock ? "متاح" : "نفد"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Edit className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="text-red-500" onClick={() => deleteProduct(p.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders">
            <div className="grid gap-4">
              <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-800 dark:text-yellow-200 p-4 rounded-xl flex gap-3 text-sm">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <strong>تنبيه أمني هام:</strong>
                  <p>بالنسبة لطلبات "الدفع أونلاين" عبر (فودافون كاش / إنستاباي)، لا تقم بشحن الطلب إلا بعد التأكد 100% من <strong>تطبيق فودافون كاش أو حسابك البنكي</strong> من وصول المبلغ وتطابق رقم المُرسل. لا تعتمد على سكرين شوت الواتساب فقط.</p>
                </div>
              </div>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>أحدث الطلبات (المُرسلة لواتساب)</CardTitle>
                  <Button variant="outline" className="gap-2" onClick={exportOrdersToCSV}>
                    <Download className="h-4 w-4" />
                    تصدير Excel (CSV)
                  </Button>
                </CardHeader>
                <CardContent>
                  {orders.length === 0 ? (
                    <div className="text-center text-muted-foreground py-10">لا توجد طلبات بعد.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>العميل (الاسم / العنوان)</TableHead>
                          <TableHead>المنتجات</TableHead>
                          <TableHead>طريقة الدفع</TableHead>
                          <TableHead>الإجمالي</TableHead>
                          <TableHead>الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.slice(0, ordersPage * ordersPerPage).map((o) => (
                          <TableRow key={o.id} className={o.status === "completed" ? "opacity-70 bg-muted/50" : ""}>
                            <TableCell>
                              <div className="font-semibold">{o.customerName || "غير مسجل"}</div>
                              <div className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate" title={o.customerAddress}>
                                {o.governorate && <span className="font-semibold text-foreground">{o.governorate} - </span>}
                                {o.customerAddress || "-"}
                              </div>
                              {o.customerPhone && <div className="text-xs font-mono mt-1" dir="ltr">{o.customerPhone}</div>}
                              <div className="text-xs text-muted-foreground mt-1">{new Date(o.date).toLocaleDateString("ar-EG")}</div>
                              {o.preferredTime && (
                                <div className="text-xs text-primary font-medium mt-1">
                                  توصيل: {o.preferredDate && o.preferredDate !== "أي يوم" ? `${o.preferredDate} - ` : ""}{o.preferredTime}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                {o.items.map(it => <div key={it.product.id} className="text-sm">{it.qty}x {it.product.name}</div>)}
                              </div>
                            </TableCell>
                            <TableCell>
                              {o.paymentMethod === "online" ? (
                                <div className="space-y-1">
                                  <Badge className="bg-primary/20 text-primary hover:bg-primary/20">أونلاين (كاش)</Badge>
                                  <div className="font-mono text-xs">{o.senderPhone}</div>
                                  {o.paymentReceiptUrl && (
                                    <a href={o.paymentReceiptUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                                      <ImageIcon className="h-3 w-3" /> عرض إيصال التحويل
                                    </a>
                                  )}
                                </div>
                              ) : (
                                <Badge variant="outline">عند الاستلام</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="font-bold">{o.total.toLocaleString("ar-EG")} ج.م</div>
                              {o.shippingCost !== undefined && (
                                <div className="text-xs text-muted-foreground mt-1">شحن: {o.shippingCost} ج.م</div>
                              )}
                              {o.discountApplied !== undefined && o.discountApplied > 0 && (
                                <div className="text-xs text-green-600 dark:text-green-400 mt-1">خصم: -{o.discountApplied} ج.م</div>
                              )}
                            </TableCell>
                            <TableCell>
                              {o.status === "pending" ? (
                                <Button 
                                  size="sm" 
                                  className="gap-2"
                                  onClick={async () => {
                                    if(confirm("هل أنت متأكد من تحويل الطلب لمكتمل؟ (سيتم خصم الكمية من المخزون وإرسال رسالة تأكيد للعميل)")) {
                                      try {
                                        await db.updateOrderStatusAndDeductStock(o.id, o.items);
                                        setOrders(await db.getOrders());
                                        setProducts(await db.getProducts());
                                        toast.success("تم تحديث حالة الطلب وخصم المخزون بنجاح");
                                        
                                        if (o.customerPhone) {
                                          const phone = o.customerPhone.startsWith("0") ? "2" + o.customerPhone : o.customerPhone;
                                          const msg = `مرحباً${o.customerName ? " " + o.customerName : ""}، تم تأكيد استلام طلبك (رقم ${o.id.substring(0,6)}) من متجر إسدال بنجاح. شكراً لثقتكم بنا! ✨`;
                                          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
                                        }
                                      } catch (err: any) {
                                        toast.error("حدث خطأ: " + err.message);
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
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  
                  {orders.length > ordersPage * ordersPerPage && (
                    <div className="mt-6 flex justify-center">
                      <Button variant="outline" onClick={() => setOrdersPage(p => p + 1)}>
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الاسم</TableHead>
                      <TableHead>الهاتف</TableHead>
                      <TableHead>العنوان والمحافظة</TableHead>
                      <TableHead>نقاط الولاء</TableHead>
                      <TableHead>المستوى</TableHead>
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
                        if (totalPts >= 1000) tier = "ذهبي";
                        else if (totalPts >= 500) tier = "فضي";
                        
                        return (
                          <TableRow key={u.id}>
                            <TableCell className="font-semibold">{u.name}</TableCell>
                            <TableCell dir="ltr" className="text-right">{u.phone}</TableCell>
                            <TableCell>{u.governorate} - {u.address}</TableCell>
                            <TableCell className="font-bold text-primary">{u.loyaltyPoints || 0}</TableCell>
                            <TableCell>
                              <Badge variant={tier === "ذهبي" ? "default" : tier === "فضي" ? "secondary" : "outline"}>
                                {tier}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="promos">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>كوبونات الخصم (Promo Codes)</CardTitle>
                <Dialog open={isAddPromoOpen} onOpenChange={(open) => {
                  setIsAddPromoOpen(open);
                  if (!open) setNewPromo({ code: "", discountPercentage: 10 });
                }}>
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>كود الخصم</TableHead>
                      <TableHead>نسبة الخصم</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>إجراء</TableHead>
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
                          <TableCell>
                            <Switch checked={c.isActive} onCheckedChange={() => togglePromoStatus(c)} />
                          </TableCell>
                          <TableCell>
                            <Button size="icon" variant="ghost" className="text-red-500" onClick={() => deletePromoCode(c.id)}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>إعدادات المتجر العامة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4 bg-muted/50 p-4 rounded-xl border">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-5 w-5 text-green-600" />
                    <h3 className="font-semibold text-lg">الخصومات التلقائية</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    حدد نسبة خصم مئوية سيتم تطبيقها تلقائياً على إجمالي المنتجات في سلة المشتريات لجميع العملاء. (اجعلها 0 لإلغاء الخصم).
                  </p>
                  
                  <div className="space-y-2 max-w-sm">
                    <Label htmlFor="discount">نسبة الخصم المئوية (%)</Label>
                    <div className="flex gap-2">
                      <Input 
                        id="discount" 
                        type="number" 
                        min="0" 
                        max="100" 
                        value={settings.discountPercentage} 
                        onChange={(e) => setSettings({ ...settings, discountPercentage: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 bg-muted/50 p-4 rounded-xl border">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-orange-500" />
                    <h3 className="font-semibold text-lg">تنبيهات المخزون</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    حدد الحد الأدنى لكمية المنتج التي ترغب في تلقي تنبيه عند وصول المخزون إليها.
                  </p>
                  
                  <div className="space-y-2 max-w-sm">
                    <Label htmlFor="lowStock">الحد الأدنى للتنبيه</Label>
                    <div className="flex gap-2">
                      <Input 
                        id="lowStock" 
                        type="number" 
                        min="1" 
                        value={settings.lowStockThreshold || 3} 
                        onChange={(e) => setSettings({ ...settings, lowStockThreshold: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
                
                <Button onClick={handleSaveSettings} disabled={savingSettings} className="w-full sm:w-auto">
                  {savingSettings ? "جاري الحفظ..." : "حفظ الإعدادات"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="expenses">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>سجل المصروفات (تكاليف، شحن، أخرى)</CardTitle>
                <Dialog open={isAddExpenseOpen} onOpenChange={(open) => {
                  setIsAddExpenseOpen(open);
                  if (!open) setNewExpense({ name: "", amount: 0 });
                }}>
                  <DialogTrigger asChild>
                    <Button className="gap-2"><Plus className="h-4 w-4" /> إضافة مصروف</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[400px]" dir="rtl">
                    <DialogHeader>
                      <DialogTitle>إضافة مصروف جديد</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label>نوع المصروف (توصيل، منتجات، إعلانات)</Label>
                        <Input value={newExpense.name} onChange={(e) => setNewExpense({ ...newExpense, name: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label>المبلغ (جنيه)</Label>
                        <Input type="number" value={newExpense.amount || ""} onChange={(e) => setNewExpense({ ...newExpense, amount: Number(e.target.value) })} />
                      </div>
                    </div>
                    <Button onClick={saveExpense} className="w-full">حفظ المصروف</Button>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>البيان</TableHead>
                      <TableHead>المبلغ</TableHead>
                      <TableHead>إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا توجد مصروفات مسجلة.</TableCell>
                      </TableRow>
                    ) : (
                      expenses.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{new Date(e.date).toLocaleDateString("ar-EG")}</TableCell>
                          <TableCell className="font-semibold">{e.name}</TableCell>
                          <TableCell className="font-bold text-red-500">{e.amount.toLocaleString("ar-EG")} ج.م</TableCell>
                          <TableCell>
                            <Button size="icon" variant="ghost" className="text-red-500" onClick={() => deleteExpense(e.id)}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

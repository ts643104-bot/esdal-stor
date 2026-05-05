import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import type { Product, Order, Expense } from "@/lib/types";
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
import { LayoutDashboard, Package, ShoppingCart, Plus, Trash2, Edit, DollarSign, Lock, LogOut, WalletCards, TrendingUp, TrendingDown, CheckCircle2, AlertCircle, Settings } from "lucide-react";
import { hasSupabase } from "@/lib/supabase";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Link } from "wouter";

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [newExpense, setNewExpense] = useState({ name: "", amount: 0 });
  const [settings, setSettings] = useState({ discountPercentage: 0 });
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("admin_auth") === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "esdal2026") {
      setIsAuthenticated(true);
      sessionStorage.setItem("admin_auth", "true");
      toast.success("تم تسجيل الدخول بنجاح");
    } else {
      toast.error("كلمة المرور غير صحيحة");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem("admin_auth");
    setPassword("");
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
      setProducts(await db.getProducts());
      setOrders(await db.getOrders());
      setExpenses(await db.getExpenses());
      setSettings(await db.getSettings());
    };
    load();
  }, []);

  const completedOrders = orders.filter(o => o.status === "completed");
  const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total, 0);
  const pendingOrdersCount = orders.filter(o => o.status === "pending").length;
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;
  const lowStockProducts = products.filter(p => (p.stock_quantity ?? 10) <= 3);

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

  const deleteExpense = async (id: string) => {
    if (confirm("هل أنت متأكد من حذف المصروف؟")) {
      await db.deleteExpense(id);
      setExpenses(expenses.filter((e) => e.id !== id));
      toast.success("تم حذف المصروف");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("الصورة كبيرة جداً. يرجى اختيار صورة أقل من 2MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewProduct({ ...newProduct, image_url: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const saveProduct = async () => {
    if (!newProduct.name || !newProduct.price_egp || !newProduct.image_url) {
      toast.error("يرجى ملء الاسم والسعر واختيار صورة");
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
      stock_quantity: Number(newProduct.stock_quantity) || 0,
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4" dir="rtl">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="font-display text-2xl">تسجيل الدخول للإدارة</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">يرجى إدخال كلمة المرور للوصول إلى لوحة التحكم</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                  className="text-right"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full">دخول</Button>
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
            <p className="text-muted-foreground mt-1">إدارة المنتجات وحساب المبيعات (Local Database)</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleLogout} className="gap-2 text-destructive hover:text-destructive">
              <LogOut className="h-4 w-4" /> تسجيل الخروج
            </Button>
            <Button asChild variant="secondary">
              <Link href="/">العودة للمتجر</Link>
            </Button>
          </div>
        </header>

        {!hasSupabase && (
          <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-800 dark:text-red-200 p-4 rounded-xl flex gap-3 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <strong>تنبيه هام (أنت تعمل على التخزين المحلي):</strong>
              <p>قاعدة بيانات Supabase غير متصلة. أي منتجات أو مصروفات تضيفها هنا ستُحفظ في <b>متصفحك أنت فقط</b> ولن يراها العملاء. لكي يعمل المتجر على "الدومين كله" ويكون متاحاً للجميع، يرجى إنشاء حساب في Supabase وإضافة المفاتيح في ملف <code>.env</code> كما هو مشروح في ملف <code>README_AR.md</code> المرفق.</p>
            </div>
          </div>
        )}

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-card border w-full justify-start h-12 overflow-x-auto">
            <TabsTrigger value="overview" className="gap-2 px-6"><LayoutDashboard className="h-4 w-4" /> نظرة عامة</TabsTrigger>
            <TabsTrigger value="products" className="gap-2 px-6"><Package className="h-4 w-4" /> المنتجات</TabsTrigger>
            <TabsTrigger value="orders" className="gap-2 px-6"><ShoppingCart className="h-4 w-4" /> الطلبات</TabsTrigger>
            <TabsTrigger value="expenses" className="gap-2 px-6"><WalletCards className="h-4 w-4" /> المصروفات</TabsTrigger>
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
                        <Label>صورة المنتج (رفع من الجهاز)</Label>
                        <div className="flex items-center gap-4">
                          {newProduct.image_url && (
                            <img src={newProduct.image_url} className="h-16 w-16 object-cover rounded-md border" alt="Preview" />
                          )}
                          <Input type="file" accept="image/*" onChange={handleImageUpload} />
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
                          <Badge variant={p.stock_quantity && p.stock_quantity <= 3 ? "destructive" : "secondary"}>
                            {p.stock_quantity ?? 10} حبة
                          </Badge>
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
                <CardHeader>
                  <CardTitle>أحدث الطلبات (المُرسلة لواتساب)</CardTitle>
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
                        {orders.map((o) => (
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
                                    if(confirm("هل أنت متأكد من تحويل الطلب لمكتمل؟ (سيتم خصم الكمية من المخزون)")) {
                                      await db.updateOrderStatus(o.id, "completed");
                                      await db.deductStock(o.items);
                                      setOrders(await db.getOrders());
                                      setProducts(await db.getProducts());
                                      toast.success("تم تحديث حالة الطلب وخصم المخزون");
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
                </CardContent>
              </Card>
            </div>
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
                      <Button onClick={handleSaveSettings} disabled={savingSettings}>
                        {savingSettings ? "جاري الحفظ..." : "حفظ الإعدادات"}
                      </Button>
                    </div>
                  </div>
                </div>
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

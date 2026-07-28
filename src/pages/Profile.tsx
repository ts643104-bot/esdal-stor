import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { auth, hasFirebase } from "@/lib/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { db } from "@/lib/db";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft, Package, UserCircle, LogOut, Award, CheckCircle, Clock, Truck } from "lucide-react";
import { MapPicker } from "@/components/MapPicker";
import { EGYPT_GOVERNORATES } from "@/lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Order, UserProfile } from "@/lib/types";

export default function Profile() {
  const { user, profile, loading, logout, refreshProfile } = useAuth();
  const { t, lang } = useLanguage();
  
  const ADMIN_EMAIL = (import.meta as any).env?.VITE_ADMIN_EMAIL?.toString()?.trim()?.toLowerCase() || "admin@hala-alyusr.com";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [showRegSuccess, setShowRegSuccess] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authErrors, setAuthErrors] = useState<{email?: string; password?: string; general?: string}>({});
  
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [confirmingReceiptId, setConfirmingReceiptId] = useState<string | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setPhone(profile.phone || "");
      setAddress(profile.address || "");
      setGovernorate(profile.governorate || "");
    }
  }, [profile]);

  useEffect(() => {
    if (user) {
      setLoadingOrders(true);
      db.getOrdersByUser(user.uid).then(res => {
        setOrders(res);
        setLoadingOrders(false);
      });
    }
  }, [user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setAuthErrors({});
    let hasErr = false;
    const newErrors: any = {};
    
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      newErrors.email = lang === "ar" ? "صيغة البريد الإلكتروني غير صحيحة" : "Invalid email format";
      hasErr = true;
    }
    
    if (!password || password.length < 6) {
      newErrors.password = lang === "ar" ? "كلمة المرور يجب أن تكون 6 أحرف على الأقل" : "Password must be at least 6 characters";
      hasErr = true;
    }

    if (hasErr) {
      setAuthErrors(newErrors);
      return;
    }

    if (email.trim().toLowerCase() === ADMIN_EMAIL) {
      setAuthErrors({ general: "هذا الحساب مخصص لإدارة الموقع فقط. يرجى الدخول من لوحة التحكم." });
      return;
    }

    setAuthLoading(true);
    try {
      if (hasFirebase && auth) {
        if (isRegistering) {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          await db.saveUserProfile({
            id: cred.user.uid,
            name: name || email.split("@")[0],
            phone: phone || "",
            address: address || "",
            governorate: governorate || "",
            joinedAt: new Date().toISOString(),
            loyaltyPoints: 0,
            totalEarnedPoints: 0
          });
          toast.success(t("auth.success.registered" as any) || "تم إنشاء الحساب بنجاح");
          setShowRegSuccess(true);
        } else {
          await signInWithEmailAndPassword(auth, email, password);
          toast.success(t("auth.success.logged_in" as any) || "تم تسجيل الدخول بنجاح");
        }
      } else {
        // Local mock auth
        const uid = "local_" + email.replace(/[^a-zA-Z0-9]/g, "");
        localStorage.setItem("hala_alyusr_local_user", JSON.stringify({ id: uid, email }));
        if (isRegistering) {
          await db.saveUserProfile({
            id: uid,
            name: email.split("@")[0],
            phone: "",
            address: "",
            governorate: "",
            joinedAt: new Date().toISOString()
          });
        }
        window.location.reload();
      }
    } catch (err: any) {
      console.error(err);
      const code = err.code;
      const newErrors: any = {};
      
      if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        newErrors.general = lang === "ar" ? "البريد الإلكتروني أو كلمة المرور غير صحيحة" : "Invalid email or password";
      } else if (code === 'auth/email-already-in-use') {
        newErrors.email = lang === "ar" ? "هذا البريد الإلكتروني مستخدم بالفعل" : "Email already in use";
      } else if (code === 'auth/weak-password') {
        newErrors.password = lang === "ar" ? "كلمة المرور ضعيفة جداً" : "Password is too weak";
      } else {
        newErrors.general = lang === "ar" ? "حدث خطأ غير متوقع، يرجى المحاولة لاحقاً" : "An unexpected error occurred";
      }
      setAuthErrors(newErrors);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleConfirmReceipt = async (order: Order) => {
    setConfirmingReceiptId(order.id);
    try {
      await db.updateOrderStatusAndDeductStock(order.id, order.items);
      setOrders(orders.map(o => o.id === order.id ? { ...o, status: "completed" } : o));
      toast.success(t("profile.order.receipt_confirmed" as any) || "تم تأكيد الاستلام بنجاح");
      
      // Simulate sending a message to the customer
      setTimeout(() => {
        toast("📩 تم إرسال رسالة تأكيد الاستلام إلى بريدك/هاتفك بنجاح!", {
          duration: 5000,
          position: "top-center",
        });
      }, 1000);
      
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تأكيد الاستلام");
    } finally {
      setConfirmingReceiptId(null);
    }
  };

  const handleMapLocation = (link: string, detectedGov?: string) => {
    setAddress(prev => prev + (prev.trim() ? "\n\nرابط الموقع: " : "رابط الموقع: ") + link);
    if (detectedGov) {
      setGovernorate(detectedGov);
      toast.success(lang === "ar" ? `تم تحديد المحافظة (${detectedGov}) تلقائياً` : `Governorate (${detectedGov}) detected automatically`);
    } else {
      toast.success(lang === "ar" ? "تم إرفاق الموقع بالعنوان بنجاح" : "Location added to address successfully");
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    try {
      const p: UserProfile = {
        id: user.uid,
        name,
        phone,
        address,
        governorate,
        joinedAt: profile?.joinedAt || new Date().toISOString(),
        loyaltyPoints: profile?.loyaltyPoints || 0
      };
      await db.saveUserProfile(p);
      await refreshProfile();
      toast.success(t("profile.success.saved" as any) || "تم حفظ البيانات بنجاح");
    } catch (err) {
      console.error(err);
      toast.error(t("profile.error.failed" as any) || "حدث خطأ أثناء حفظ البيانات");
    } finally {
      setSavingProfile(false);
    }
  };

  const totalEarnedPoints = profile?.totalEarnedPoints || 0;
  let currentTierName = t("tier.bronze" as any) || "برونزي";
  let nextTierName = t("tier.silver" as any) || "فضي";
  let nextTierPoints = 500;
  let pointsToNextTier = Math.max(0, 500 - totalEarnedPoints);
  let progressPercentage = Math.min(100, (totalEarnedPoints / 500) * 100);

  if (totalEarnedPoints >= 2000) {
    currentTierName = t("tier.gold" as any) || "ذهبي";
    nextTierName = "";
    nextTierPoints = 2000;
    pointsToNextTier = 0;
    progressPercentage = 100;
  } else if (totalEarnedPoints >= 500) {
    currentTierName = t("tier.silver" as any) || "فضي";
    nextTierName = t("tier.gold" as any) || "ذهبي";
    nextTierPoints = 2000;
    pointsToNextTier = Math.max(0, 2000 - totalEarnedPoints);
    progressPercentage = Math.min(100, ((totalEarnedPoints - 500) / 1500) * 100);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Admin access block on customer profile page
  if (user && user.email?.toLowerCase() === ADMIN_EMAIL) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md bg-card p-8 sm:p-10 rounded-3xl border shadow-2xl animate-in zoom-in duration-300">
          <div className="mx-auto w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center shadow-inner">
            <UserCircle className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-black font-display">حساب إداري</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">أنت مسجل الدخول كمسؤول الموقع. هذه الصفحة مخصصة للعملاء فقط ولا يمكنك تصفحها بصلاحيات الإدارة.</p>
          <div className="pt-6 space-y-3">
            <Button asChild className="w-full h-12 text-md rounded-xl shadow-lg">
              <Link href="/admin">الذهاب للوحة الإدارة</Link>
            </Button>
            <Button variant="ghost" onClick={() => void logout()} className="w-full h-12 text-md rounded-xl text-red-500 hover:text-red-600 hover:bg-red-50">
              تسجيل الخروج
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                {lang === "ar" ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
              </Button>
            </Link>
            <h1 className="text-xl font-bold font-display">{t("nav.profile" as any) || "حسابي"}</h1>
          </div>
          {user && (
            <Button variant="ghost" size="sm" onClick={() => void logout()} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
              <LogOut className="h-4 w-4 me-2" />
              {t("auth.logout" as any) || "تسجيل خروج"}
            </Button>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {showRegSuccess ? (
          <div className="bg-card border-2 border-primary/20 rounded-3xl p-8 shadow-2xl text-center space-y-6 animate-in zoom-in duration-500">
            <div className="mx-auto w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center text-green-600">
               <CheckCircle className="h-12 w-12" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold font-display">مرحباً بك في هلا اليسر! 🎉</h2>
              <p className="text-muted-foreground text-sm">تم إنشاء حسابك بنجاح. يرجى مراجعة بياناتك:</p>
            </div>
            
            <div className="bg-muted/30 rounded-2xl p-5 text-right space-y-4 border border-border/40">
              <div className="flex justify-between items-center border-b border-border/40 pb-2 gap-4">
                <span className="text-xs text-muted-foreground shrink-0">الاسم الكامل:</span>
                <span className="font-bold truncate">{name}</span>
              </div>
              <div className="flex justify-between items-center border-b border-border/40 pb-2 gap-4">
                <span className="text-xs text-muted-foreground shrink-0">رقم الهاتف:</span>
                <span className="font-bold font-mono">{phone}</span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-xs text-muted-foreground shrink-0">البريد الإلكتروني:</span>
                <span className="font-bold text-sm truncate">{email}</span>
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <Button onClick={() => window.location.href = "#/"} className="w-full h-14 text-lg font-bold rounded-2xl shadow-lg shadow-primary/20">
                تأكيد والبدء بالتسوق 🛍️
              </Button>
              <p className="text-[10px] text-muted-foreground italic">
                * يمكنك دائماً تعديل هذه البيانات من ملفك الشخصي لاحقاً.
              </p>
            </div>
          </div>
        ) : !user ? (
          <div className="relative overflow-hidden bg-card border rounded-3xl p-6 sm:p-10 shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10 -translate-x-1/2 translate-y-1/2" />
            
            <div className="text-center mb-10">
              <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <UserCircle className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-3xl font-display font-black text-foreground mb-3 tracking-tight">
                {isRegistering ? (t("auth.register" as any) || "إنشاء حساب جديد") : (t("auth.login" as any) || "تسجيل الدخول")}
              </h2>
              <p className="text-muted-foreground text-sm font-medium">
                {isRegistering 
                  ? (t("auth.register_desc" as any) || "أنشئ حساباً لحفظ بياناتك وتتبع طلباتك بسهولة")
                  : (t("auth.login_desc" as any) || "سجل الدخول لمتابعة طلباتك وتعديل بياناتك")}
              </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-6">
              {isRegistering ? (
                <div className="space-y-4 animate-in fade-in duration-500">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-primary font-bold">{t("profile.name" as any) || "الاسم الكامل"}</Label>
                      <Input 
                        placeholder="مثال: محمد أحمد" 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        required 
                        className="h-12 border-primary/20 focus:border-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-primary font-bold">{t("profile.phone" as any) || "رقم الهاتف"}</Label>
                      <Input 
                        placeholder="01xxxxxxxxx" 
                        value={phone} 
                        onChange={e => setPhone(e.target.value)} 
                        required 
                        dir="ltr" 
                        className="text-left h-12 border-primary/20 focus:border-primary" 
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("auth.email" as any) || "البريد الإلكتروني"}</Label>
                      <Input 
                        type="email" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        required 
                        dir="ltr"
                        className={`text-left h-12 ${authErrors.email ? 'border-red-500 focus-visible:ring-red-500/20' : ''}`}
                      />
                      {authErrors.email && <p className="text-red-500 text-xs mt-1 font-medium">{authErrors.email}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>{t("auth.password" as any) || "كلمة المرور"}</Label>
                      <Input 
                        type="password" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                        dir="ltr"
                        className={`text-left h-12 tracking-widest ${authErrors.password ? 'border-red-500 focus-visible:ring-red-500/20' : ''}`}
                      />
                      {authErrors.password && <p className="text-red-500 text-xs mt-1 font-medium">{authErrors.password}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{t("profile.governorate" as any) || "المحافظة (للتوصيل)"}</Label>
                    <Select value={governorate} onValueChange={setGovernorate} dir="rtl">
                      <SelectTrigger className="h-12 bg-muted/20">
                        <SelectValue placeholder={t("cart.govPlaceholder" as any) || "اختر المحافظة"} />
                      </SelectTrigger>
                      <SelectContent>
                        {EGYPT_GOVERNORATES.map(gov => (
                          <SelectItem key={gov.name} value={gov.name}>
                            {gov.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("profile.address" as any) || "العنوان التفصيلي"}</Label>
                    <Input 
                      placeholder="العنوان أو اللوكيشن" 
                      value={address} 
                      onChange={e => setAddress(e.target.value)} 
                      required 
                      className="h-12"
                    />
                    <div className="mt-2">
                      <MapPicker onLocationSelect={handleMapLocation} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-300">
                  <div className="space-y-2">
                    <Label>{t("auth.email" as any) || "البريد الإلكتروني"}</Label>
                    <Input 
                      type="email" 
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      required 
                      dir="ltr"
                      className={`text-left h-12 ${authErrors.email ? 'border-red-500 focus-visible:ring-red-500/20' : ''}`}
                    />
                    {authErrors.email && <p className="text-red-500 text-xs mt-1 font-medium">{authErrors.email}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>{t("auth.password" as any) || "كلمة المرور"}</Label>
                    <Input 
                      type="password" 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      required 
                      dir="ltr"
                      className={`text-left h-12 tracking-widest ${authErrors.password ? 'border-red-500 focus-visible:ring-red-500/20' : ''}`}
                    />
                    {authErrors.password && <p className="text-red-500 text-xs mt-1 font-medium">{authErrors.password}</p>}
                  </div>
                </div>
              )}
              
              {authErrors.general && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-600 p-3 rounded-xl text-sm font-bold text-center animate-in fade-in">
                  {authErrors.general}
                </div>
              )}
              <Button type="submit" className="w-full h-14 text-lg font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all" disabled={authLoading}>
                {authLoading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent mx-auto"></div> : (isRegistering ? (t("auth.register_btn" as any) || "إنشاء حساب") : (t("auth.login_btn" as any) || "دخول آمن"))}
              </Button>
            </form>

            <div className="mt-8 text-center pt-6 border-t border-border/60">
              <p className="text-sm text-muted-foreground mb-3">
                {isRegistering ? "لديك حساب بالفعل؟" : "ليس لديك حساب بعد؟"}
              </p>
              <button 
                type="button"
                onClick={() => setIsRegistering(!isRegistering)}
                className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg border-2 border-primary/20 text-primary font-bold hover:bg-primary/5 transition-colors"
              >
                {isRegistering ? "تسجيل الدخول" : "إنشاء حساب مجاني"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Loyalty Points */}
            <section className="bg-primary/5 border border-primary/20 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-3 rounded-full">
                    <Award className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{t("loyalty.title" as any) || "نقاط الولاء"}</h2>
                    <p className="text-sm text-muted-foreground">{t("loyalty.earn_desc" as any) || "اربح نقطة واحدة مقابل كل 10 جنيهات تشتري بها."}</p>
                  </div>
                </div>
                <div className="text-center bg-background rounded-xl py-3 px-6 border shadow-sm min-w-32">
                  <p className="text-sm text-muted-foreground mb-1">{t("loyalty.balance" as any) || "الرصيد"}</p>
                  <p className="text-3xl font-bold text-primary">{profile?.loyaltyPoints || 0}</p>
                  <p className="text-xs text-muted-foreground">{t("loyalty.points" as any) || "نقطة"}</p>
                </div>
              </div>

              <div className="bg-background rounded-xl p-4 border shadow-sm mt-4">
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <p className="text-sm text-muted-foreground">المستوى الحالي</p>
                    <p className="font-bold text-lg text-primary">{currentTierName}</p>
                  </div>
                  {nextTierName && (
                    <div className="text-left">
                      <p className="text-sm text-muted-foreground">المستوى القادم</p>
                      <p className="font-bold text-md">{nextTierName}</p>
                    </div>
                  )}
                </div>
                
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2 dark:bg-gray-700">
                  <div className="bg-primary h-2.5 rounded-full" style={{ width: `${progressPercentage}%` }}></div>
                </div>
                
                {nextTierName ? (
                  <p className="text-xs text-muted-foreground text-center">
                    تحتاج إلى <span className="font-bold">{pointsToNextTier}</span> نقطة إضافية للوصول إلى المستوى {nextTierName}
                  </p>
                ) : (
                  <p className="text-xs text-green-600 font-bold text-center">
                    أنت في أعلى مستوى!
                  </p>
                )}
              </div>
            </section>

            {/* Profile Info */}
            <section className="bg-card border rounded-2xl p-6 shadow-sm">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
                <UserCircle className="h-6 w-6 text-primary" />
                {t("profile.personal_info" as any) || "البيانات الشخصية"}
              </h2>
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("profile.name" as any) || "الاسم الكامل"}</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("profile.phone" as any) || "رقم التواصل"}</Label>
                    <Input value={phone} onChange={e => setPhone(e.target.value)} required dir="ltr" className="text-left" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{t("profile.governorate" as any) || "المحافظة"}</Label>
                    <Select value={governorate} onValueChange={setGovernorate} dir="rtl">
                      <SelectTrigger>
                        <SelectValue placeholder={t("cart.govPlaceholder" as any) || "اختر المحافظة"} />
                      </SelectTrigger>
                      <SelectContent>
                        {EGYPT_GOVERNORATES.map(gov => (
                          <SelectItem key={gov.name} value={gov.name}>
                            {gov.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("profile.address" as any) || "العنوان التفصيلي"}</Label>
                    <Input value={address} onChange={e => setAddress(e.target.value)} required />
                    <div className="mt-2">
                      <MapPicker onLocationSelect={handleMapLocation} />
                    </div>
                  </div>
                </div>
                <div className="pt-2">
                  <Button type="submit" disabled={savingProfile}>
                    {savingProfile ? "..." : (t("profile.save" as any) || "حفظ التعديلات")}
                  </Button>
                </div>
              </form>
            </section>

            {/* Order History */}
            <section className="bg-card border rounded-2xl p-6 shadow-sm">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
                <Package className="h-6 w-6 text-primary" />
                {t("profile.order_history" as any) || "سجل الطلبات"}
              </h2>
              
              {loadingOrders ? (
                <div className="text-center py-8 text-muted-foreground">{t("profile.loading" as any) || "جاري التحميل..."}</div>
              ) : orders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t("profile.no_orders" as any) || "لا توجد طلبات سابقة"}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map(order => (
                    <div key={order.id} className="border rounded-xl p-4 flex flex-col sm:flex-row gap-4 justify-between">
                      <div className="w-full">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold font-mono text-primary">#{order.id}</span>
                              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                {new Date(order.date).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { dateStyle: "medium" })}
                              </span>
                            </div>
                            <p className="text-sm mt-1">
                              {order.items.length} {t("profile.order.items" as any) || "عنصر — الإجمالي: "} <span className="font-bold text-primary">{order.total} ج.م</span>
                            </p>
                          </div>
                          <div className="text-left">
                            <span className="text-xs font-bold text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg border">
                              {order.paymentMethod === "cod" ? (t("profile.payment.cod" as any) || "دفع عند الاستلام") : (t("profile.payment.online" as any) || "دفع أونلاين")}
                            </span>
                          </div>
                        </div>

                        {/* Visual Tracking Timeline */}
                        {order.status !== "cancelled" && order.status !== "rejected" ? (
                          <div className="relative flex justify-between items-center w-full px-2 mb-6 mt-2">
                            <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary transition-all duration-500" style={{ 
                                width: order.status === "completed" ? "100%" : 
                                       order.status === "shipped" ? "66%" : 
                                       order.status === "prepared" ? "33%" : "0%" 
                              }}></div>
                            </div>
                            
                            <div className="relative flex flex-col items-center gap-2 z-10">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-4 ${"bg-primary text-primary-foreground border-card shadow-md"}`}>
                                <Clock className="w-4 h-4" />
                              </div>
                              <span className="text-[10px] font-bold">قيد المراجعة</span>
                            </div>
                            
                            <div className="relative flex flex-col items-center gap-2 z-10">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-4 transition-colors ${order.status === "prepared" || order.status === "shipped" || order.status === "completed" ? "bg-primary text-primary-foreground border-card shadow-md" : "bg-card text-muted-foreground border-muted"}`}>
                                <Package className="w-4 h-4" />
                              </div>
                              <span className={`text-[10px] font-bold ${order.status === "prepared" || order.status === "shipped" || order.status === "completed" ? "text-foreground" : "text-muted-foreground"}`}>تم التحضير</span>
                            </div>
                            
                            <div className="relative flex flex-col items-center gap-2 z-10">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-4 transition-colors ${order.status === "shipped" || order.status === "completed" ? "bg-primary text-primary-foreground border-card shadow-md" : "bg-card text-muted-foreground border-muted"}`}>
                                <Truck className="w-4 h-4" />
                              </div>
                              <span className={`text-[10px] font-bold ${order.status === "shipped" || order.status === "completed" ? "text-foreground" : "text-muted-foreground"}`}>تم الشحن</span>
                            </div>

                            <div className="relative flex flex-col items-center gap-2 z-10">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-4 transition-colors ${order.status === "completed" ? "bg-green-500 text-white border-card shadow-md" : "bg-card text-muted-foreground border-muted"}`}>
                                <CheckCircle className="w-4 h-4" />
                              </div>
                              <span className={`text-[10px] font-bold ${order.status === "completed" ? "text-green-600" : "text-muted-foreground"}`}>تم التوصيل</span>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center mb-4">
                            <p className="text-sm font-bold text-red-600">
                              {order.status === "cancelled" ? "لقد قمت بإلغاء هذا الطلب." : "عذراً، تم رفض هذا الطلب من قبل الإدارة."}
                            </p>
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/30 p-3 rounded-xl">
                          <p className="text-xs text-muted-foreground w-full sm:w-auto">
                            {order.status === "pending" ? "الطلب قيد المراجعة، يمكنك إلغاؤه الآن." :
                             order.status === "prepared" ? "يتم الآن تغليف وتجهيز طلبك للشحن." :
                             order.status === "shipped" ? "المندوب في الطريق إليك! يرجى تأكيد الاستلام عند وصوله." :
                             order.status === "completed" ? "تم تسليم الطلب بنجاح. شكراً لتسوقك معنا!" : ""}
                          </p>
                          
                          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                            {(order.status === "shipped" || order.status === "prepared") && (
                              <Button 
                                size="sm" 
                                className="h-9 px-4 bg-green-600 hover:bg-green-700 text-white gap-2 w-full sm:w-auto shadow-md"
                                onClick={() => handleConfirmReceipt(order)}
                                disabled={confirmingReceiptId === order.id}
                              >
                                <CheckCircle className="h-4 w-4" />
                                تأكيد الاستلام
                              </Button>
                            )}
                            
                            {order.status === "pending" && (
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-9 text-red-500 border-red-200 hover:bg-red-50 w-full sm:w-auto"
                                onClick={async () => {
                                  if (confirm("هل أنت متأكد من رغبتك في إلغاء هذا الطلب؟")) {
                                    try {
                                      await db.updateOrderStatus(order.id, "cancelled");
                                      setOrders(orders.map(o => o.id === order.id ? { ...o, status: "cancelled" as const } : o));
                                      toast.success("تم إلغاء الطلب");
                                    } catch {
                                      toast.error("فشل إلغاء الطلب");
                                    }
                                  }
                                }}
                              >
                                إلغاء الطلب
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

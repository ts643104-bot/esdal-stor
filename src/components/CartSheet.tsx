import { useMemo, useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ShoppingCart, Trash2, MessageCircle, ShieldCheck, Copy, Plus, Minus, CheckCircle, CalendarIcon, User, Image as ImageIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { MapPicker } from "@/components/MapPicker";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { EGYPT_GOVERNORATES } from "@/lib/constants";
import { hasFirebase, storage } from "@/lib/firebase";

const WHATSAPP_PHONE_E164 = "201122310891";
const VODAFONE_CASH_NUMBER = "01140971703";

function buildWhatsappMessage(
  items: ReturnType<typeof useCart>["items"],
  subtotal: number,
  shippingCost: number,
  discountAmount: number,
  total: number,
  paymentMethod: "cod" | "online",
  senderPhone: string,
  customerName: string,
  customerAddress: string,
  customerPhone: string,
  governorate: string,
  preferredTime: string,
  preferredDate: string,
  orderId: string,
  note?: string,
  receiptUrl?: string,
  transferredAmount?: number | "",
  onlinePaymentMode?: "full" | "partial",
  depositAmount?: number
) {
  const paymentText = paymentMethod === "cod" ? "الدفع عند الاستلام (COD)" : `أونلاين (${onlinePaymentMode === "partial" ? "عربون: " + (depositAmount || 0) + " ج.م" : "المبلغ بالكامل"})`;
  
  const lines = [
    "السلام عليكم، عايز/ة أعمل طلب من هلا اليسر:",
    `رقم الطلب (للمتابعة): *#${orderId}*`,
    "",
    `الاسم: *${customerName}*`,
    `رقم التواصل: *${customerPhone}*`,
    `المحافظة: *${governorate}*`,
    `العنوان: *${customerAddress}*`,
    `تاريخ التوصيل: *${preferredDate || "أي يوم"}*`,
    `وقت التوصيل المفضل: *${preferredTime}*`,
    ...(note ? [`ملاحظة العميل: _${note}_`] : []),
    "",
    "الطلبات:",
    ...items.map(
      (it, i) =>
        `${i + 1}) ${it.product.name} — الكمية: ${it.qty} — السعر: ${it.product.price_egp.toLocaleString("ar-EG")} ج.م`
    ),
    "",
    `قيمة المنتجات: ${subtotal.toLocaleString("ar-EG")} ج.م`,
    ...(discountAmount > 0 ? [`الخصم المُطبق: -${discountAmount.toLocaleString("ar-EG")} ج.م`] : []),
    `مصاريف الشحن: ${shippingCost.toLocaleString("ar-EG")} ج.م`,
    `الإجمالي الكلي: *${total.toLocaleString("ar-EG")} جنيه*`,
    `طريقة الدفع: *${paymentText}*`,
  ];

  if (paymentMethod === "online") {
    lines.push(`رقم المحفظة المُرسِل: ${senderPhone}`);
    if (transferredAmount) {
      lines.push(`المبلغ المحول: ${transferredAmount} ج.م`);
    }
    if (receiptUrl) {
      lines.push(`رابط إيصال الدفع: ${receiptUrl}`);
    }
    lines.push("");
    lines.push("*هام جداً:* لقد قمت برفع صورة الإيصال، وهذا هو الرابط للمراجعة: " + receiptUrl);
    lines.push("سأقوم الآن بإرسال صورة الإيصال هنا في الدردشة أيضاً للتأكيد.");
  } else {
    lines.push("");
    lines.push("رجاءً تأكيد التوفر وسعر الشحن.");
  }

  return lines.join("\n");
}

export default function CartSheet() {
  const cart = useCart();
  const { user, profile } = useAuth();
  const { t, lang } = useLanguage();
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "online">("cod");
  const [onlinePaymentMode, setOnlinePaymentMode] = useState<"full" | "partial">("full");
  const [senderPhone, setSenderPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [preferredTime, setPreferredTime] = useState("أي وقت");
  const [preferredDate, setPreferredDate] = useState<Date | undefined>(undefined);
  const [shippingType, setShippingType] = useState<"standard" | "express">("standard");
  const [successData, setSuccessData] = useState<{ 
    orderId: string; 
    waUrl: string;
    details: {
      name: string;
      phone: string;
      items: any[];
      total: number;
    }
  } | null>(null);
  const [discountPct, setDiscountPct] = useState(0);
  const [depositAmount, setDepositAmount] = useState(100);
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);
  const [orderNote, setOrderNote] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{code: string; discount: number} | null>(null);
  const [promoError, setPromoError] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [transferredAmount, setTransferredAmount] = useState<number | "">("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  useEffect(() => {
    if (profile) {
      if (profile.name) setCustomerName(profile.name);
      if (profile.phone) setCustomerPhone(profile.phone);
      if (profile.address) setCustomerAddress(profile.address);
      if (profile.governorate) setGovernorate(profile.governorate);
    }
  }, [profile]);

  useEffect(() => {
    import("@/lib/db").then(({ db }) => {
      db.getSettings().then(s => {
        setDiscountPct(s.discountPercentage || 0);
        if (s.depositAmount) setDepositAmount(s.depositAmount);
      });
    });
  }, []);

  const isValidInfo = customerName.trim().length > 1 && customerAddress.trim().length > 5 && customerPhone.trim().length >= 10 && governorate !== "";

  const selectedGov = EGYPT_GOVERNORATES.find(g => g.name === governorate);
  const shippingCost = selectedGov ? selectedGov.cost + (shippingType === "express" ? 30 : 0) : 0;
  
  const totalEarnedPoints = profile?.totalEarnedPoints || 0;
  let tierDiscountPct = 0;
  let currentTierName = "";
  if (totalEarnedPoints >= 2000) {
    tierDiscountPct = 10;
    currentTierName = t("tier.gold" as any) || "ذهبي";
  } else if (totalEarnedPoints >= 500) {
    tierDiscountPct = 5;
    currentTierName = t("tier.silver" as any) || "فضي";
  } else {
    tierDiscountPct = 0;
    currentTierName = t("tier.bronze" as any) || "برونزي";
  }
  
  const tierDiscountAmount = Math.round((cart.totalPrice * tierDiscountPct) / 100);
  const baseDiscountAmount = Math.round((cart.totalPrice * discountPct) / 100);
  
  const userPoints = profile?.loyaltyPoints || 0;
  const maxPointsToRedeem = Math.floor(userPoints / 500) * 500;
  const pointsDiscount = useLoyaltyPoints ? Math.floor(maxPointsToRedeem / 50) : 0;
  const promoDiscountAmount = appliedPromo ? Math.round((cart.totalPrice * appliedPromo.discount) / 100) : 0;
  const totalDiscount = baseDiscountAmount + pointsDiscount + tierDiscountAmount + promoDiscountAmount;

  const finalTotal = Math.max(0, cart.totalPrice - totalDiscount + shippingCost);
  const isValidOnline = paymentMethod === "cod" || (senderPhone.length >= 10 && senderPhone.startsWith("01") && receiptUrl && transferredAmount !== "");
  
  const pointsEarned = Math.floor(cart.totalPrice / 10);

  const handleCheckout = () => {
    if (!user) {
      window.location.href = "#/profile";
      return;
    }
    if (!isValidInfo) {
      toast.error("يرجى إكمال جميع بيانات التوصيل واختيار المحافظة");
      return;
    }
    if (paymentMethod === "online") {
      if (!senderPhone || senderPhone.length < 10 || !senderPhone.startsWith("01")) {
        toast.error("يرجى إدخال رقم محفظة صحيح يبدأ بـ 01");
        return;
      }
      if (!receiptUrl) {
        toast.error("يرجى إرفاق سكرين شوت (صورة) للتحويل");
        return;
      }
      if (transferredAmount === "") {
        toast.error("يرجى إدخال المبلغ الذي قمت بتحويله");
        return;
      }
    }
    if (uploadingReceipt) {
      toast.error("يرجى الانتظار حتى اكتمال رفع الإيصال");
      return;
    }

    import("@/lib/db").then(async ({ db }) => {
      const dateStr = preferredDate ? preferredDate.toLocaleDateString("ar-EG", { dateStyle: "long" }) : "أي يوم";
      const promoText = appliedPromo ? ` [كوبون: ${appliedPromo.code}]` : "";
      const pointsToRedeem = useLoyaltyPoints ? maxPointsToRedeem : 0;
      
      const orderId = await db.addOrder(
        cart.items, finalTotal, paymentMethod, senderPhone, customerName, 
        customerAddress, customerPhone, governorate, shippingCost, 
        `${shippingType === "express" ? "[Express] " : ""}${preferredTime}${promoText}`, 
        totalDiscount, dateStr, user?.uid, pointsEarned, pointsToRedeem, receiptUrl, orderNote, Number(transferredAmount) || undefined,
        paymentMethod === "online" ? onlinePaymentMode : undefined
      );
      
      const itemsList = cart.items.map(it => `${it.qty}x ${it.product.name} (${it.product.price_egp} ج.م)`).join("\n");
      const emailBody = {
        _subject: `طلب جديد من هلا اليسر - رقم #${orderId}`,
        "رقم الطلب": orderId,
        "اسم العميل": customerName,
        "رقم التواصل": customerPhone,
        "المحافظة": governorate,
        "العنوان ورابط الموقع": customerAddress,
        "تاريخ التوصيل": dateStr,
        "وقت التوصيل": preferredTime,
        "طريقة الدفع": paymentMethod === "cod" ? "عند الاستلام" : `أونلاين (${onlinePaymentMode === "full" ? "المبلغ بالكامل" : "جزء كعربون والباقي عند الاستلام"}) - رقم: ` + senderPhone,
        "المنتجات": itemsList,
        "قيمة المنتجات": cart.totalPrice + " ج.م",
        "الخصم": totalDiscount > 0 ? totalDiscount + " ج.م" : "لا يوجد",
        "مصاريف الشحن": shippingCost + " ج.م",
        "الإجمالي الكلي": finalTotal + " ج.م",
        "المبلغ المحول (المُدخل)": transferredAmount ? transferredAmount + " ج.م" : "لا يوجد",
        "رابط الإيصال": receiptUrl || "لا يوجد"
      };

      fetch("https://formsubmit.co/ajax/tkalikrombo@gmail.com", {
        method: "POST",
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(emailBody)
      }).catch(err => console.error("Failed to send email notification", err));
      
      const waMsg = buildWhatsappMessage(cart.items, cart.totalPrice, shippingCost, totalDiscount, finalTotal, paymentMethod, senderPhone, customerName, customerAddress, customerPhone, governorate, `${shippingType === "express" ? "[Express] " : ""}${preferredTime}`, dateStr, orderId, orderNote, receiptUrl, transferredAmount, onlinePaymentMode, depositAmount);
      const waUrl = `https://wa.me/${WHATSAPP_PHONE_E164}?text=${encodeURIComponent(waMsg)}`;
      
      setSuccessData({ 
        orderId, waUrl,
        details: { name: customerName, phone: customerPhone, items: [...cart.items], total: finalTotal }
      });
      
      setTimeout(() => { window.open(waUrl, "_blank"); }, 600);
      cart.clear();
    });
  };

  const copyNumber = () => {
    navigator.clipboard.writeText(VODAFONE_CASH_NUMBER);
    toast.success("تم نسخ رقم فودافون كاش");
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("الصورة كبيرة جداً. يرجى اختيار صورة أقل من 5 ميجابايت");
      return;
    }


    const apiUrl = import.meta.env.VITE_IMGBB_API_URL;
    const apiKey = import.meta.env.VITE_IMGBB_API_KEY;

    if (!apiUrl || !apiKey) {
      toast.error("عذراً، خدمة رفع الصور غير متوفرة حالياً");
      return;
    }

    setUploadingReceipt(true);
    const toastId = toast.loading("جاري رفع صورة الإيصال...");
    try {
      const formData = new FormData();
      formData.append("image", file);
      
      const response = await fetch(`${apiUrl}?key=${apiKey}`, {
        method: "POST",
        body: formData
      });
      
      const data = await response.json();
      if (data.success) {
        setReceiptUrl(data.data.url);
        toast.success("تم إرفاق صورة الإيصال بنجاح", { id: toastId });
      } else {
        throw new Error(data.error?.message || "فشل الرفع");
      }
    } catch (err: any) {
      toast.error("فشل رفع الصورة: " + err.message, { id: toastId });
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleMapLocation = (link: string, detectedGov?: string) => {
    setCustomerAddress(prev => prev + (prev.trim() ? "\n\nرابط الموقع: " : "رابط الموقع: ") + link);
    if (detectedGov) {
      setGovernorate(detectedGov);
      toast.success(`تم إرفاق الموقع وتحديد المحافظة (${detectedGov}) تلقائياً`);
    } else {
      toast.success("تم إرفاق الموقع بالعنوان بنجاح");
    }
  };

  return (
    <Sheet onOpenChange={(open) => { if(!open) setSuccessData(null); }}>
      <SheetTrigger asChild>
        <Button variant="secondary" className="gap-2">
          <ShoppingCart className="h-4 w-4" />
          السلة
          <Badge className="ms-1 bg-primary text-primary-foreground">{cart.totalItems}</Badge>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full sm:max-w-md flex flex-col h-full">
        {successData ? (
          <div className="flex flex-col h-full animate-in slide-in-from-left duration-500">
            <div className="flex-1 overflow-y-auto space-y-6 py-6 px-1 no-scrollbar">
              <div className="text-center space-y-3">
                <div className="mx-auto h-16 w-16 bg-green-500/20 text-green-600 rounded-full flex items-center justify-center shadow-lg shadow-green-500/10">
                  <CheckCircle className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-black font-display text-foreground">تم تسجيل طلبك! 🎉</h2>
                <p className="text-muted-foreground text-xs font-bold px-4">
                  برجاء مراجعة تفاصيل طلبك والضغط على الزر بالأسفل لإرساله عبر الواتساب.
                </p>
              </div>

              <div className="bg-muted/30 border border-border/40 rounded-3xl overflow-hidden shadow-xl">
                <div className="bg-primary/10 p-4 border-b border-border/40 flex justify-between items-center">
                  <span className="text-xs font-black text-primary">رقم الطلب: #{successData.orderId}</span>
                  <Badge className="bg-primary text-primary-foreground font-mono">#{successData.orderId.substring(0,4)}</Badge>
                </div>
                <div className="p-5 space-y-4">
                   <div className="space-y-3 pb-4 border-b border-border/20">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">الاسم:</span>
                        <span className="font-bold text-foreground">{successData.details.name}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">الهاتف:</span>
                        <span className="font-bold font-mono text-foreground">{successData.details.phone}</span>
                      </div>
                   </div>
                   <div className="space-y-3">
                      <span className="text-[10px] font-black uppercase text-muted-foreground block">المنتجات المختارة:</span>
                      {successData.details.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm bg-background/50 p-2 rounded-xl">
                           <span className="font-medium">{it.qty}x {it.product.name}</span>
                           <span className="font-bold text-primary">{(it.qty * it.product.price_egp).toLocaleString()} ج.م</span>
                        </div>
                      ))}
                   </div>
                   <div className="pt-4 border-t border-border/40 flex justify-between items-center">
                      <span className="font-black text-lg">الإجمالي الكلي:</span>
                      <span className="text-2xl font-black text-primary">{successData.details.total.toLocaleString()} ج.م</span>
                   </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t bg-background mt-auto pb-6 space-y-3">
              <Button onClick={() => window.open(successData.waUrl, "_blank")} className="w-full h-14 text-lg font-bold gap-3 rounded-2xl bg-[#25D366] hover:bg-[#20ba56] text-white shadow-xl shadow-green-500/20">
                <MessageCircle className="h-6 w-6" />
                إرسال الطلب عبر واتساب 
              </Button>
              <Button variant="ghost" onClick={() => { setSuccessData(null); window.location.href = "#/"; }} className="w-full text-muted-foreground font-bold h-10">
                العودة للتسوق
              </Button>
            </div>
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="font-display">سلة المشتريات</SheetTitle>
            </SheetHeader>

            <div className="mt-6 flex-1 overflow-y-auto pr-2 no-scrollbar">
              {cart.items.length === 0 ? (
                <div className="text-muted-foreground text-center mt-10">السلة فاضية… اختار/ي منتجات وارجع/ي هنا.</div>
              ) : (
                <div className="space-y-6 pb-6">
                  <div className="space-y-4">
                    {cart.items.map((it) => (
                      <div key={it.product.id} className="flex items-start gap-4 p-2 rounded-xl bg-muted/20 border border-border/30">
                        {it.product.image_url ? (
                          <img src={it.product.image_url} alt={it.product.name} className="h-20 w-20 rounded-lg object-cover border-none" />
                        ) : (
                          <div className="h-20 w-20 bg-muted/40 rounded-lg flex items-center justify-center border border-dashed border-border/60">
                            <span className="text-[10px] font-black text-primary/40">لا توجد صورة</span>
                          </div>
                        )}
                        <div className="flex-1 flex flex-col justify-between min-h-[80px]">
                          <div>
                            <div className="font-semibold leading-snug">{it.product.name}</div>
                            <div className="text-sm font-bold text-primary mt-1">{(it.qty * it.product.price_egp).toLocaleString("ar-EG")} ج.م</div>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-2 bg-background/50 rounded-lg p-0.5 border border-border/60">
                              <Button size="icon" variant="ghost" onClick={() => cart.dec(it.product.id)} className="h-8 w-8 text-muted-foreground"><Minus className="h-4 w-4" /></Button>
                              <span className="text-sm font-bold min-w-6 text-center">{it.qty}</span>
                              <Button size="icon" variant="ghost" onClick={() => cart.add(it.product)} className="h-8 w-8 text-primary"><Plus className="h-4 w-4" /></Button>
                            </div>
                            <Button size="icon" variant="ghost" onClick={() => cart.remove(it.product.id)} className="h-9 w-9 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-muted-foreground font-medium">قيمة المنتجات</div>
                      <div className="font-semibold">{cart.totalPrice.toLocaleString("ar-EG")} ج.م</div>
                    </div>
                    {baseDiscountAmount > 0 && (
                      <div className="flex items-center justify-between text-green-600 dark:text-green-400 font-bold">
                        <div>خصم المتجر ({discountPct}%)</div>
                        <div>-{baseDiscountAmount.toLocaleString("ar-EG")} ج.م</div>
                      </div>
                    )}
                    {tierDiscountAmount > 0 && (
                      <div className="flex items-center justify-between text-green-600 dark:text-green-400 font-bold">
                        <div>خصم المستوى ({currentTierName})</div>
                        <div>-{tierDiscountAmount.toLocaleString("ar-EG")} ج.م</div>
                      </div>
                    )}
                    {userPoints >= 100 && (
                      <div className="bg-primary/5 p-3 rounded-xl border border-primary/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="useLoyalty" className="font-semibold text-xs cursor-pointer flex-1">استخدام نقاط الولاء</Label>
                          <Switch id="useLoyalty" checked={useLoyaltyPoints} onCheckedChange={setUseLoyaltyPoints} />
                        </div>
                        {useLoyaltyPoints && (
                          <div className="flex items-center justify-between text-xs text-green-600 font-bold">
                            <span>خصم النقاط:</span>
                            <span>-{pointsDiscount.toLocaleString("ar-EG")} ج.م</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Input placeholder="كود الخصم" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} className="h-9" />
                      <Button variant="secondary" size="sm" onClick={async () => {
                        const { db } = await import("@/lib/db");
                        const codes = await db.getPromoCodes();
                        const match = codes.find(c => c.code.toLowerCase() === promoCode.trim().toLowerCase() && c.isActive);
                        if (match) { setAppliedPromo({ code: match.code, discount: match.discountPercentage }); toast.success("تم تطبيق الكود"); }
                        else { setAppliedPromo(null); toast.error("كود غير صحيح"); }
                      }}>تطبيق</Button>
                    </div>

                    {governorate && (
                      <div className="flex items-center justify-between">
                        <div className="text-muted-foreground font-medium">مصاريف الشحن ({governorate})</div>
                        <div className="font-semibold">{shippingCost.toLocaleString("ar-EG")} ج.م</div>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-2 pt-2 border-t text-lg font-black">
                      <div className="text-foreground">الإجمالي الكلي</div>
                      <div className="text-primary">{finalTotal.toLocaleString("ar-EG")} ج.م</div>
                    </div>
                  </div>

                  <Separator />

                  {!user ? (
                    <div className="bg-primary/5 border-2 border-dashed border-primary/20 rounded-3xl p-8 text-center space-y-5 animate-in fade-in zoom-in">
                      <div className="mx-auto h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center"><User className="h-8 w-8" /></div>
                      <div className="space-y-1">
                        <h3 className="text-lg font-black text-foreground">سجل دخولك أولاً 🔒</h3>
                        <p className="text-muted-foreground text-xs font-bold leading-relaxed">يرجى تسجيل الدخول بالبريد الإلكتروني لتتمكن من ملء بيانات التوصيل وإتمام الشراء.</p>
                      </div>
                      <Button onClick={() => window.location.href = "#/profile"} className="w-full h-12 font-black rounded-2xl shadow-lg">إنشاء حساب / تسجيل دخول</Button>
                    </div>
                  ) : (
                    <div className="space-y-6 animate-in fade-in duration-500">
                      <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                        <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                        <Label className="text-lg font-bold text-foreground">بيانات التوصيل</Label>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="customerName" className="text-xs font-bold opacity-70">الاسم بالكامل</Label>
                          <Input id="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="rounded-xl h-11" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="customerPhone" className="text-xs font-bold opacity-70">رقم التواصل</Label>
                          <Input id="customerPhone" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="rounded-xl h-11 text-right" dir="ltr" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold opacity-70">المحافظة</Label>
                          <Select value={governorate} onValueChange={setGovernorate} dir="rtl">
                            <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="اختر المحافظة" /></SelectTrigger>
                            <SelectContent>
                              {EGYPT_GOVERNORATES.map(gov => <SelectItem key={gov.name} value={gov.name}>{gov.name} ({gov.cost} ج.م)</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="customerAddress" className="text-xs font-bold opacity-70">العنوان أو رابط الموقع</Label>
                          <Input id="customerAddress" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="rounded-xl h-11" />
                          <MapPicker onLocationSelect={handleMapLocation} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="orderNote" className="text-xs font-bold opacity-70">ملاحظات الطلب</Label>
                          <Textarea id="orderNote" value={orderNote} onChange={(e) => setOrderNote(e.target.value)} className="rounded-xl resize-none h-20" />
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-4">
                        <Label className="text-lg font-bold">طريقة الدفع</Label>
                        <RadioGroup value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)} className="grid gap-3">
                          <div className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${paymentMethod === "cod" ? "bg-primary/5 border-primary" : "bg-card border-border"}`} onClick={() => setPaymentMethod("cod")}>
                            <div className="flex items-center gap-3"><RadioGroupItem value="cod" id="cod" /><Label htmlFor="cod" className="font-bold cursor-pointer">عند الاستلام</Label></div>
                          </div>
                          <div className={`flex flex-col rounded-xl border overflow-hidden cursor-pointer transition-colors ${paymentMethod === "online" ? "bg-primary/5 border-primary" : "bg-card border-border"}`} onClick={() => setPaymentMethod("online")}>
                            <div className="flex items-center justify-between p-4"><div className="flex items-center gap-3"><RadioGroupItem value="online" id="online" /><Label htmlFor="online" className="font-bold cursor-pointer">فودافون كاش / إنستاباي</Label></div></div>
                            {paymentMethod === "online" && (
                              <div className="p-4 bg-muted/10 border-t space-y-4 animate-in slide-in-from-top-2">
                                <div className="space-y-3 mb-4">
                                  <Label className="text-xs font-bold opacity-70">نوع الدفع</Label>
                                  <RadioGroup value={onlinePaymentMode} onValueChange={(v: any) => setOnlinePaymentMode(v)} className="flex flex-col sm:flex-row gap-2">
                                    <div className={`flex items-center gap-2 border p-3 rounded-lg flex-1 cursor-pointer transition-colors ${onlinePaymentMode === "full" ? "border-primary bg-primary/5" : "bg-background"}`} onClick={() => setOnlinePaymentMode("full")}>
                                      <RadioGroupItem value="full" id="full_pay" />
                                      <Label htmlFor="full_pay" className="text-xs cursor-pointer font-bold">دفع المبلغ بالكامل أونلاين</Label>
                                    </div>
                                    <div className={`flex items-center gap-2 border p-3 rounded-lg flex-1 cursor-pointer transition-colors ${onlinePaymentMode === "partial" ? "border-primary bg-primary/5" : "bg-background"}`} onClick={() => setOnlinePaymentMode("partial")}>
                                      <RadioGroupItem value="partial" id="partial_pay" />
                                      <div className="flex flex-col gap-0.5">
                                        <Label htmlFor="partial_pay" className="text-xs cursor-pointer font-bold">دفع عربون والباقي عند الاستلام</Label>
                                        <span className="text-[10px] text-primary font-bold">قيمة العربون: {depositAmount} ج.م</span>
                                      </div>
                                    </div>
                                  </RadioGroup>
                                </div>
                                <div className="bg-background p-3 rounded-lg border border-dashed border-primary/40 text-center">
                                  <p className="text-[10px] font-bold text-muted-foreground mb-1">حول المبلغ إلى الرقم:</p>
                                  <div className="flex items-center justify-center gap-2">
                                    <span className="text-lg font-mono font-black text-primary">{VODAFONE_CASH_NUMBER}</span>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copyNumber}><Copy className="h-4 w-4" /></Button>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs font-bold opacity-70">رقم المحفظة المُرسل منه</Label>
                                  <Input placeholder="01xxxxxxxxx" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} className="h-10 text-right" />
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs font-bold opacity-70">المبلغ المُحول بالجنيه</Label>
                                  <Input type="number" placeholder="مثال: 500" value={transferredAmount} onChange={(e) => setTransferredAmount(e.target.value === "" ? "" : Number(e.target.value))} className="h-10 text-right" />
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs font-bold opacity-70">إرفاق سكرين شوت التحويل (صورة)</Label>
                                  <div className="flex items-center gap-4">
                                    <Input type="file" accept="image/*" onChange={handleReceiptUpload} disabled={uploadingReceipt} className="h-10" />
                                    {receiptUrl && (
                                      <img src={receiptUrl} alt="Receipt" className="h-10 w-10 object-cover rounded border" />
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </RadioGroup>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {cart.items.length > 0 && user && (
              <div className="pt-4 border-t bg-background mt-auto pb-6 px-1">
                <Button className="w-full h-14 text-lg font-black gap-3 rounded-2xl shadow-xl shadow-primary/20" onClick={handleCheckout} disabled={!isValidInfo}>
                  <MessageCircle className="h-6 w-6" />
                  إتمام الطلب عبر واتساب
                </Button>
                <Button variant="ghost" className="w-full text-muted-foreground text-xs font-bold mt-2" onClick={() => cart.clear()}>تفريغ السلة</Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

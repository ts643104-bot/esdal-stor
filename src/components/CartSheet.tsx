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
import { ShoppingCart, Trash2, MessageCircle, ShieldCheck, Copy, Plus, Minus, CheckCircle, CalendarIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { MapPicker } from "@/components/MapPicker";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { EGYPT_GOVERNORATES } from "@/lib/constants";
import { hasFirebase, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { nanoid } from "nanoid";

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
  receiptUrl?: string
) {
  const paymentText = paymentMethod === "cod" ? "الدفع عند الاستلام (COD)" : "فودافون كاش / إنستاباي";
  
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
  const [senderPhone, setSenderPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [preferredTime, setPreferredTime] = useState("أي وقت");
  const [preferredDate, setPreferredDate] = useState<Date | undefined>(undefined);
  const [shippingType, setShippingType] = useState<"standard" | "express">("standard");
  const [successData, setSuccessData] = useState<{ orderId: string; waUrl: string } | null>(null);
  const [discountPct, setDiscountPct] = useState(0);
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);
  const [orderNote, setOrderNote] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{code: string; discount: number} | null>(null);
  const [promoError, setPromoError] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
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
      db.getSettings().then(s => setDiscountPct(s.discountPercentage || 0));
    });
  }, []);

  const isValidInfo = customerName.trim().length > 1 && customerAddress.trim().length > 5 && customerPhone.trim().length >= 10 && governorate !== "";

  const selectedGov = EGYPT_GOVERNORATES.find(g => g.name === governorate);
  const shippingCost = selectedGov ? selectedGov.cost + (shippingType === "express" ? 30 : 0) : 0;
  
  // Calculate Tier Discount
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
  
  // Calculate Loyalty Discount
  const userPoints = profile?.loyaltyPoints || 0;
  const maxPointsToRedeem = Math.floor(userPoints / 500) * 500;
  const pointsDiscount = useLoyaltyPoints ? Math.floor(maxPointsToRedeem / 50) : 0;
  const promoDiscountAmount = appliedPromo ? Math.round((cart.totalPrice * appliedPromo.discount) / 100) : 0;
  const totalDiscount = baseDiscountAmount + pointsDiscount + tierDiscountAmount + promoDiscountAmount;

  const finalTotal = Math.max(0, cart.totalPrice - totalDiscount + shippingCost);
  const isValidOnline = paymentMethod === "cod" || (senderPhone.length >= 10 && senderPhone.startsWith("01"));
  
  const pointsEarned = Math.floor(cart.totalPrice / 10);

  const isFormValid = isValidInfo && isValidOnline && !uploadingReceipt;

  const handleCheckout = () => {
    if (!isValidInfo) {
      toast.error("يرجى إكمال جميع بيانات التوصيل واختيار المحافظة");
      return;
    }
    if (paymentMethod === "online" && !isValidOnline) {
      toast.error("يرجى إدخال رقم هاتف صحيح يبدأ بـ 01 للتحويل");
      return;
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
        totalDiscount, dateStr, user?.uid, pointsEarned, pointsToRedeem, receiptUrl, orderNote
      );
      
      const msg = buildWhatsappMessage(cart.items, cart.totalPrice, shippingCost, totalDiscount, finalTotal, paymentMethod, senderPhone, customerName, customerAddress, customerPhone, governorate, `${shippingType === "express" ? "[Express] " : ""}${preferredTime}`, dateStr, orderId, orderNote, receiptUrl);
      const encoded = encodeURIComponent(msg);
      const waUrl = `https://wa.me/${WHATSAPP_PHONE_E164}?text=${encoded}`;

      // Send email via FormSubmit
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
        "طريقة الدفع": paymentMethod === "cod" ? "عند الاستلام" : "أونلاين (كاش) - رقم: " + senderPhone,
        "المنتجات": itemsList,
        "قيمة المنتجات": cart.totalPrice + " ج.م",
        "الخصم": totalDiscount > 0 ? totalDiscount + " ج.م" : "لا يوجد",
        "مصاريف الشحن": shippingCost + " ج.م",
        "الإجمالي الكلي": finalTotal + " ج.م",
      };

      fetch("https://formsubmit.co/ajax/tkalikrombo@gmail.com", {
        method: "POST",
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(emailBody)
      }).catch(err => console.error("Failed to send email notification", err));
      
      setSuccessData({ orderId, waUrl });
      cart.clear();
    });
  };

  const copyNumber = () => {
    navigator.clipboard.writeText(VODAFONE_CASH_NUMBER);
    toast.success("تم نسخ رقم فودافون كاش");
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
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 animate-in zoom-in duration-500 py-10">
            <div className="h-20 w-20 bg-green-500/20 text-green-600 rounded-full flex items-center justify-center">
              <CheckCircle className="h-10 w-10" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold font-display text-foreground">تم تسجيل طلبك بنجاح! 🎉</h2>
              <p className="text-muted-foreground text-sm">
                تم حفظ بياناتك وتجهيز رسالة الواتساب الخاصة بك.
              </p>
            </div>

            <div className="bg-secondary/50 rounded-xl p-6 w-full space-y-2">
              <p className="text-sm text-muted-foreground font-semibold">رقم الطلب الخاص بك</p>
              <div className="text-3xl font-mono font-bold tracking-wider text-primary">#{successData.orderId}</div>
              <p className="text-xs text-muted-foreground mt-2">
                احتفظ بهذا الرقم لتتمكن من تتبع حالة شحنتك لاحقاً.
              </p>
            </div>

            <div className="space-y-3 w-full pt-4 mt-auto">
              <Button 
                onClick={() => window.open(successData.waUrl, "_blank")} 
                className="w-full h-12 text-md gap-2"
              >
                <MessageCircle className="h-5 w-5" />
                إرسال الرسالة لتأكيد الطلب 
              </Button>
            </div>
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="font-display">سلة المشتريات</SheetTitle>
            </SheetHeader>

            <div className="mt-6 flex-1 overflow-y-auto pr-2">
              {cart.items.length === 0 ? (
            <div className="text-muted-foreground text-center mt-10">السلة فاضية… اختار/ي منتجات وارجع/ي هنا.</div>
          ) : (
            <div className="space-y-6 pb-6">
              {/* Items List */}
              <div className="space-y-4">
                {cart.items.map((it) => (
                  <div key={it.product.id} className="flex items-start gap-4 p-2 rounded-xl bg-muted/20 border border-border/30">
                    <img
                      src={it.product.image_url}
                      alt={it.product.name}
                      className="h-20 w-20 rounded-lg object-cover border-none"
                    />
                    <div className="flex-1 flex flex-col justify-between min-h-[80px]">
                      <div>
                        <div className="font-semibold leading-snug">{it.product.name}</div>
                        <div className="text-sm font-bold text-primary mt-1">
                          {(it.qty * it.product.price_egp).toLocaleString("ar-EG")} ج.م
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-2 bg-background/50 rounded-lg p-0.5 border border-border/60">
                          <Button size="icon" variant="ghost" onClick={() => cart.dec(it.product.id)} className="h-8 w-8 text-muted-foreground">
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="text-sm font-bold min-w-6 text-center">{it.qty}</span>
                          <Button size="icon" variant="ghost" onClick={() => cart.add(it.product)} className="h-8 w-8 text-primary">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => cart.remove(it.product.id)} className="h-9 w-9 text-muted-foreground hover:text-destructive active:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Separator />

              {/* Total */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="text-muted-foreground font-medium">قيمة المنتجات</div>
                  <div className="font-semibold">{cart.totalPrice.toLocaleString("ar-EG")} ج.م</div>
                </div>
                {baseDiscountAmount > 0 && (
                  <div className="flex items-center justify-between text-sm text-green-600 dark:text-green-400">
                    <div className="font-medium">خصم المتجر ({discountPct}%)</div>
                    <div className="font-bold">-{baseDiscountAmount.toLocaleString("ar-EG")} ج.م</div>
                  </div>
                )}
                {tierDiscountAmount > 0 && (
                  <div className="flex items-center justify-between text-sm text-green-600 dark:text-green-400">
                    <div className="font-medium">{t("cart.tier_discount" as any, { tier: currentTierName }) || `خصم المستوى (${currentTierName})`}</div>
                    <div className="font-bold">-{tierDiscountAmount.toLocaleString("ar-EG")} ج.م</div>
                  </div>
                )}
                
                {/* Loyalty Points Option */}
                {userPoints >= 100 && (
                  <div className="bg-primary/5 p-3 rounded-xl border border-primary/20 space-y-2 mt-2 mb-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="useLoyalty" className="font-semibold text-sm cursor-pointer flex-1">{t("loyalty.use_points" as any) || "استخدام نقاط الولاء"}</Label>
                      <Switch id="useLoyalty" checked={useLoyaltyPoints} onCheckedChange={setUseLoyaltyPoints} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {lang === "ar" 
                        ? `لديك ${userPoints} نقطة. يمكنك استبدال ${maxPointsToRedeem} نقطة بخصم ${pointsDiscount > 0 ? pointsDiscount : Math.floor(maxPointsToRedeem / 50)} ج.م`
                        : `You have ${userPoints} pts. You can redeem ${maxPointsToRedeem} pts for ${pointsDiscount > 0 ? pointsDiscount : Math.floor(maxPointsToRedeem / 50)} EGP discount`}
                    </p>
                    {useLoyaltyPoints && (
                      <div className="flex items-center justify-between text-sm text-green-600 font-bold">
                        <span>{t("loyalty.points_applied" as any) || "تم تطبيق الخصم بالنقاط"}</span>
                        <span>-{pointsDiscount.toLocaleString("ar-EG")} ج.م</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 mb-4">
                  <Input 
                    placeholder="كود الخصم (إن وجد)" 
                    value={promoCode} 
                    onChange={(e) => {
                      setPromoCode(e.target.value);
                      setPromoError("");
                    }} 
                    className="flex-1"
                  />
                  <Button 
                    variant="secondary" 
                    onClick={async () => {
                      if (!promoCode.trim()) return;
                      const { db } = await import("@/lib/db");
                      const codes = await db.getPromoCodes();
                      const match = codes.find(c => c.code.toLowerCase() === promoCode.trim().toLowerCase() && c.isActive);
                      if (match) {
                        setAppliedPromo({ code: match.code, discount: match.discountPercentage });
                        setPromoError("");
                        toast.success(`تم تطبيق خصم ${match.discountPercentage}% بنجاح`);
                      } else {
                        setAppliedPromo(null);
                        setPromoError("كود الخصم غير صحيح أو غير فعال");
                      }
                    }}
                  >
                    تطبيق
                  </Button>
                </div>
                {promoError && <p className="text-xs text-red-500 mb-2">{promoError}</p>}
                {appliedPromo && (
                  <div className="flex items-center justify-between text-sm text-green-600 font-bold mb-2">
                    <span>كوبون ({appliedPromo.code}):</span>
                    <span>-{promoDiscountAmount.toLocaleString("ar-EG")} ج.م</span>
                  </div>
                )}
                {governorate && (
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-muted-foreground font-medium">مصاريف الشحن ({governorate})</div>
                    <div className="font-semibold">{shippingCost.toLocaleString("ar-EG")} ج.م</div>
                  </div>
                )}
                <div className="flex items-center justify-between mt-2 pt-2 border-t">
                  <div className="text-foreground font-bold">الإجمالي الكلي</div>
                  <div className="font-display text-xl text-primary">{finalTotal.toLocaleString("ar-EG")} ج.م</div>
                </div>
                {profile && (
                  <div className="text-xs text-center text-muted-foreground mt-1">
                    {lang === "ar" ? (
                      <>سوف تحصل على <span className="font-bold text-primary">{pointsEarned}</span> نقطة ولاء من هذا الطلب</>
                    ) : (
                      <>You will earn <span className="font-bold text-primary">{pointsEarned}</span> loyalty points from this order</>
                    )}
                  </div>
                )}
              </div>

              <Separator />
              
              {/* Customer Info */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                  <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                  <Label className="text-lg font-bold text-foreground">بيانات التوصيل</Label>
                </div>
                
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="customerName" className="text-sm font-semibold pr-1">الاسم بالكامل</Label>
                    <Input 
                      id="customerName" 
                      placeholder="مثال: أحمد محمد" 
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="h-12 rounded-xl bg-muted/30 border-border/60"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="customerPhone" className="text-sm font-semibold pr-1">رقم التواصل</Label>
                    <Input 
                      id="customerPhone" 
                      type="tel"
                      placeholder="مثال: 01xxxxxxxxx" 
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      dir="ltr"
                      className="h-12 text-right rounded-xl bg-muted/30 border-border/60"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold pr-1">المحافظة</Label>
                    <Select value={governorate} onValueChange={setGovernorate} dir="rtl">
                      <SelectTrigger className="h-12 rounded-xl bg-muted/30 border-border/60">
                        <SelectValue placeholder="اختر المحافظة لمعرفة الشحن" />
                      </SelectTrigger>
                      <SelectContent>
                        {EGYPT_GOVERNORATES.map(gov => (
                          <SelectItem key={gov.name} value={gov.name}>
                            {gov.name} ({gov.cost} ج.م)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="customerAddress" className="text-sm font-semibold pr-1">{t("cart.address" as any)}</Label>
                    <Input 
                      id="customerAddress" 
                      placeholder="ضع رابط اللوكيشن أو العنوان المختصر هنا..." 
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      className="h-12 rounded-xl bg-muted/30 border-border/60"
                    />
                    <div className="pt-1">
                      <MapPicker onLocationSelect={handleMapLocation} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="orderNote" className="text-sm font-semibold pr-1">{t("cart.note" as any)}</Label>
                    <Textarea 
                      id="orderNote" 
                      placeholder="مثال: رن الجرس مرتين، أو اترك الطلب عند البواب..." 
                      value={orderNote}
                      onChange={(e) => setOrderNote(e.target.value)}
                      className="resize-none h-24 rounded-xl bg-muted/30 border-border/60"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">تاريخ التوصيل (اختياري)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={`w-full justify-start text-right font-normal ${!preferredDate && "text-muted-foreground"}`}>
                          <CalendarIcon className="ml-2 h-4 w-4" />
                          {preferredDate ? preferredDate.toLocaleDateString("ar-EG", { dateStyle: "long" }) : "اختر تاريخ التوصيل"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={preferredDate}
                          onSelect={setPreferredDate}
                          initialFocus
                          dir="ltr"
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">وقت التوصيل المفضل</Label>
                    <Select value={preferredTime} onValueChange={setPreferredTime} dir="rtl">
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الوقت المفضل" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="أي وقت">أي وقت (أسرع توصيل)</SelectItem>
                        <SelectItem value="صباحاً (10 ص - 2 م)">صباحاً (10 ص - 2 م)</SelectItem>
                        <SelectItem value="عصراً (2 م - 6 م)">عصراً (2 م - 6 م)</SelectItem>
                        <SelectItem value="مساءً (6 م - 10 م)">مساءً (6 م - 10 م)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Payment Methods */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">طريقة الدفع</Label>
                <RadioGroup 
                  value={paymentMethod} 
                  onValueChange={(val) => setPaymentMethod(val as "cod" | "online")}
                  className="gap-3"
                >
                  <div className={`flex items-center space-x-2 rtl:space-x-reverse rounded-xl border p-4 transition-colors ${paymentMethod === "cod" ? "border-primary bg-primary/5" : "border-border bg-card/50"}`}>
                    <RadioGroupItem value="cod" id="cod" />
                    <Label htmlFor="cod" className="flex-1 cursor-pointer font-medium">الدفع عند الاستلام (COD)</Label>
                  </div>
                  
                  <div className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors ${paymentMethod === "online" ? "border-primary bg-primary/5" : "border-border bg-card/50"}`}>
                    <div className="flex items-center space-x-2 rtl:space-x-reverse">
                      <RadioGroupItem value="online" id="online" />
                      <Label htmlFor="online" className="flex-1 cursor-pointer font-medium">دفع أونلاين (فودافون كاش / إنستاباي)</Label>
                    </div>
                    
                    {paymentMethod === "online" && (
                      <div className="pl-6 rtl:pr-6 space-y-4 animate-in fade-in slide-in-from-top-2">
                        <div className="bg-background rounded-lg p-3 border border-primary/20 flex flex-col gap-2">
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            قم بتحويل <strong className="text-foreground">{finalTotal.toLocaleString("ar-EG")} ج.م</strong> إلى الرقم التالي:
                          </p>
                          <div className="flex items-center gap-2">
                            <code className="bg-muted px-2 py-1 rounded text-lg font-bold flex-1 text-center tracking-widest">
                              {VODAFONE_CASH_NUMBER}
                            </code>
                            <Button size="icon" variant="outline" onClick={copyNumber}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="senderPhone" className="text-sm text-muted-foreground">رقم الهاتف المُرسل منه (للتأكيد)</Label>
                          <Input 
                            id="senderPhone" 
                            type="tel" 
                            placeholder="مثال: 01xxxxxxxxx" 
                            value={senderPhone}
                            onChange={(e) => setSenderPhone(e.target.value)}
                            dir="ltr"
                            className="text-right"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="receiptImage" className="text-sm text-muted-foreground">صورة إيصال التحويل (سكرين شوت) - اختياري</Label>
                          <Input 
                            id="receiptImage" 
                            type="file"
                            accept="image/*"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 2 * 1024 * 1024) {
                                  toast.error("الصورة كبيرة جداً. يرجى اختيار صورة أقل من 2MB");
                                  return;
                                }
                                if (hasFirebase && storage) {
                                  if (!user?.uid) {
                                    toast.error("لا يمكن رفع الإيصال قبل تفعيل جلسة المستخدم. أعد فتح الصفحة وحاول مرة أخرى.");
                                    return;
                                  }

                                  setUploadingReceipt(true);
                                  const toastId = toast.loading("جاري رفع الإيصال...");
                                  try {
                                    const safeName = file.name
                                      .replace(/[\\/]/g, "_")
                                      .replace(/[\u0000-\u001F\u007F]/g, "")
                                      .slice(0, 120);

                                    // Store path is per-user to prevent spam / overwrites
                                    const fileRef = ref(storage!, `receipts/${user.uid}/${nanoid()}_${safeName}`);
                                    const uploadTask = await uploadBytes(fileRef, file, { contentType: file.type });
                                    const url = await getDownloadURL(uploadTask.ref);
                                    setReceiptUrl(url);
                                    toast.success("تم إرفاق الإيصال بنجاح", { id: toastId });
                                  } catch {
                                    toast.error("فشل رفع صورة الإيصال", { id: toastId });
                                  } finally {
                                    setUploadingReceipt(false);
                                  }
                                } else {
                                  toast.error("رفع الإيصال غير متاح لأن Firebase Storage غير متصل.");
                                }
                              }
                            }}
                            disabled={uploadingReceipt}
                          />
                        </div>

                        <div className="flex gap-2 text-xs text-primary bg-primary/10 p-2 rounded-lg items-start">
                          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                          <p>
                            طريقة آمنة 100%. لن يتم تجهيز الطلب إلا بعد التأكد من وصول المبلغ للمحفظة. يرجى إرفاق صورة التحويل في الواتساب.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </RadioGroup>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {cart.items.length > 0 && (
          <div className="pt-4 border-t bg-background mt-auto pb-4">
            <div className="grid gap-3">
              <Button 
                className="gap-2 h-12 text-md"
                onClick={handleCheckout}
                disabled={!isFormValid}
              >
                <MessageCircle className="h-5 w-5" />
                إتمام الطلب عبر واتساب
              </Button>
              <Button variant="ghost" className="text-muted-foreground" onClick={() => cart.clear()}>
                تفريغ السلة
              </Button>
            </div>
          </div>
        )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

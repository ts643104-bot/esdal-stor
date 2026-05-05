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
import { MapPicker } from "@/components/MapPicker";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";

const WHATSAPP_PHONE_E164 = "201122310891";
const VODAFONE_CASH_NUMBER = "01140971703";

const EGYPT_GOVERNORATES = [
  { name: "القاهرة", cost: 50 },
  { name: "الجيزة", cost: 50 },
  { name: "الإسكندرية", cost: 60 },
  { name: "القليوبية", cost: 70 },
  { name: "الدقهلية", cost: 70 },
  { name: "الشرقية", cost: 70 },
  { name: "الغربية", cost: 70 },
  { name: "المنوفية", cost: 70 },
  { name: "البحيرة", cost: 70 },
  { name: "كفر الشيخ", cost: 70 },
  { name: "دمياط", cost: 70 },
  { name: "بورسعيد", cost: 70 },
  { name: "الإسماعيلية", cost: 70 },
  { name: "السويس", cost: 70 },
  { name: "الفيوم", cost: 90 },
  { name: "بني سويف", cost: 90 },
  { name: "المنيا", cost: 90 },
  { name: "أسيوط", cost: 100 },
  { name: "سوهاج", cost: 100 },
  { name: "قنا", cost: 100 },
  { name: "الأقصر", cost: 100 },
  { name: "أسوان", cost: 100 },
  { name: "البحر الأحمر", cost: 120 },
  { name: "الوادي الجديد", cost: 120 },
  { name: "مطروح", cost: 120 },
  { name: "شمال سيناء", cost: 120 },
  { name: "جنوب سيناء", cost: 120 },
];

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
  orderId: string
) {
  const paymentText = paymentMethod === "cod" ? "الدفع عند الاستلام (COD)" : "فودافون كاش / إنستاباي";
  
  const lines = [
    "السلام عليكم، عايز/ة أعمل طلب من Esdal Store:",
    `رقم الطلب (للمتابعة): *#${orderId}*`,
    "",
    `الاسم: *${customerName}*`,
    `رقم التواصل: *${customerPhone}*`,
    `المحافظة: *${governorate}*`,
    `العنوان: *${customerAddress}*`,
    `تاريخ التوصيل: *${preferredDate || "أي يوم"}*`,
    `وقت التوصيل المفضل: *${preferredTime}*`,
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
    lines.push("");
    lines.push("ملاحظة: سأقوم بإرسال صورة إيصال التحويل (Screenshot) لتأكيد الدفع.");
  } else {
    lines.push("");
    lines.push("رجاءً تأكيد التوفر وسعر الشحن.");
  }

  return lines.join("\n");
}

export default function CartSheet() {
  const cart = useCart();
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "online">("cod");
  const [senderPhone, setSenderPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [preferredTime, setPreferredTime] = useState("أي وقت");
  const [preferredDate, setPreferredDate] = useState<Date | undefined>(undefined);
  const [successData, setSuccessData] = useState<{ orderId: string; waUrl: string } | null>(null);
  const [discountPct, setDiscountPct] = useState(0);

  useEffect(() => {
    import("@/lib/db").then(({ db }) => {
      db.getSettings().then(s => setDiscountPct(s.discountPercentage || 0));
    });
  }, []);

  const isValidInfo = customerName.trim().length > 1 && customerAddress.trim().length > 5 && customerPhone.trim().length >= 10 && governorate !== "";

  const selectedGov = EGYPT_GOVERNORATES.find(g => g.name === governorate);
  const shippingCost = selectedGov ? selectedGov.cost : 0;
  const discountAmount = Math.round((cart.totalPrice * discountPct) / 100);
  const finalTotal = cart.totalPrice - discountAmount + shippingCost;
  const isValidOnline = paymentMethod === "cod" || (senderPhone.length >= 10 && senderPhone.startsWith("01"));

  const isFormValid = isValidInfo && isValidOnline;

  const handleCheckout = () => {
    if (!isValidInfo) {
      toast.error("يرجى إكمال جميع بيانات التوصيل واختيار المحافظة");
      return;
    }
    if (paymentMethod === "online" && !isValidOnline) {
      toast.error("يرجى إدخال رقم هاتف صحيح يبدأ بـ 01 للتحويل");
      return;
    }

    import("@/lib/db").then(async ({ db }) => {
      const dateStr = preferredDate ? preferredDate.toLocaleDateString("ar-EG", { dateStyle: "long" }) : "أي يوم";
      const orderId = await db.addOrder(cart.items, finalTotal, paymentMethod, senderPhone, customerName, customerAddress, customerPhone, governorate, shippingCost, preferredTime, discountAmount, dateStr);
      const msg = buildWhatsappMessage(cart.items, cart.totalPrice, shippingCost, discountAmount, finalTotal, paymentMethod, senderPhone, customerName, customerAddress, customerPhone, governorate, preferredTime, dateStr, orderId);
      const encoded = encodeURIComponent(msg);
      const waUrl = `https://wa.me/${WHATSAPP_PHONE_E164}?text=${encoded}`;

      // Send email via FormSubmit
      const itemsList = cart.items.map(it => `${it.qty}x ${it.product.name} (${it.product.price_egp} ج.م)`).join("\n");
      const emailBody = {
        _subject: `طلب جديد من متجر إسدال - رقم #${orderId}`,
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
        "الخصم": discountAmount > 0 ? discountAmount + " ج.م" : "لا يوجد",
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
                  <div key={it.product.id} className="flex gap-3">
                    <img
                      src={it.product.image_url}
                      alt={it.product.name}
                      className="h-20 w-20 rounded-lg object-cover border"
                    />
                    <div className="flex-1 flex flex-col justify-between py-1">
                      <div>
                        <div className="font-semibold leading-snug">{it.product.name}</div>
                        <div className="text-sm font-bold text-primary mt-1">
                          {(it.qty * it.product.price_egp).toLocaleString("ar-EG")} ج.م
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-3 bg-secondary rounded-lg px-2 py-1">
                          <button onClick={() => cart.dec(it.product.id)} className="p-1 hover:bg-background rounded text-muted-foreground">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-sm font-semibold min-w-4 text-center">{it.qty}</span>
                          <button onClick={() => cart.add(it.product)} className="p-1 hover:bg-background rounded text-foreground">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => cart.remove(it.product.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
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
                {discountAmount > 0 && (
                  <div className="flex items-center justify-between text-sm text-green-600 dark:text-green-400">
                    <div className="font-medium">خصم المتجر ({discountPct}%)</div>
                    <div className="font-bold">-{discountAmount.toLocaleString("ar-EG")} ج.م</div>
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
              </div>

              <Separator />
              
              {/* Customer Info */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">بيانات التوصيل</Label>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="customerName" className="text-xs text-muted-foreground">الاسم بالكامل</Label>
                    <Input 
                      id="customerName" 
                      placeholder="مثال: أحمد محمد" 
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="customerPhone" className="text-xs text-muted-foreground">رقم التواصل</Label>
                    <Input 
                      id="customerPhone" 
                      type="tel"
                      placeholder="مثال: 01xxxxxxxxx" 
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      dir="ltr"
                      className="text-right"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">المحافظة</Label>
                    <Select value={governorate} onValueChange={setGovernorate} dir="rtl">
                      <SelectTrigger>
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
                  <div className="space-y-1.5">
                    <Label htmlFor="customerAddress" className="text-xs text-muted-foreground">العنوان بالتفصيل (المنطقة، الشارع، العمارة)</Label>
                    <Textarea 
                      id="customerAddress" 
                      placeholder="مثال: القاهرة، مدينة نصر، شارع مكرم عبيد..." 
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      className="resize-none h-20"
                    />
                    <MapPicker onLocationSelect={handleMapLocation} />
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

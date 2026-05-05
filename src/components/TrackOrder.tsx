import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Package, CheckCircle2, Clock } from "lucide-react";
import { db } from "@/lib/db";
import type { Order } from "@/lib/types";

export default function TrackOrder() {
  const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim()) return;

    setLoading(true);
    // Remove # if user entered it
    const cleanId = orderId.replace("#", "").trim().toUpperCase();
    
    try {
      const result = await db.getOrderById(cleanId);
      setOrder(result);
      setSearched(true);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setOrderId("");
      setOrder(null);
      setSearched(false);
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="hidden sm:flex gap-2 text-primary border-primary/30 hover:bg-primary/10">
          <Package className="h-4 w-4" />
          تتبع الطلب
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            تتبع حالة طلبك
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleTrack} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="orderId">رقم الطلب</Label>
            <div className="flex gap-2">
              <Input
                id="orderId"
                placeholder="مثال: X7B9K2M"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                dir="ltr"
                className="text-right flex-1"
                autoComplete="off"
              />
              <Button type="submit" disabled={loading} className="px-4">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              أدخل رقم الطلب الذي حصلت عليه في رسالة الواتساب بدون علامة #.
            </p>
          </div>
        </form>

        {searched && (
          <div className="mt-4 border-t pt-6 animate-in fade-in slide-in-from-bottom-2">
            {!order ? (
              <div className="text-center py-6 text-destructive bg-destructive/10 rounded-lg">
                <p className="font-semibold">لم نتمكن من العثور على هذا الطلب</p>
                <p className="text-sm mt-1">تأكد من كتابة الرقم بشكل صحيح</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b pb-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">رقم الطلب</p>
                    <p className="font-mono font-bold text-lg">#{order.id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground mb-1">التاريخ</p>
                    <p className="font-medium text-sm" dir="ltr">{new Date(order.date).toLocaleDateString("ar-EG")}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-3">حالة الطلب الحالية:</h4>
                  <div className="relative">
                    <div className="absolute top-0 bottom-0 right-[15px] w-[2px] bg-muted z-0"></div>
                    
                    <div className="relative z-10 flex gap-4 mb-6">
                      <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div className="pt-1">
                        <p className="font-bold">تم استلام الطلب</p>
                        <p className="text-xs text-muted-foreground mt-1">في انتظار المراجعة</p>
                      </div>
                    </div>

                    <div className="relative z-10 flex gap-4">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${order.status === 'completed' ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                        {order.status === 'completed' ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                      </div>
                      <div className="pt-1">
                        <p className={`font-bold ${order.status === 'completed' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                          {order.status === 'completed' ? 'تم التجهيز والشحن' : 'قيد التجهيز / المراجعة'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {order.status === 'completed' ? 'طلبك في الطريق إليك!' : 'سيتم التواصل معك لتأكيد الشحن.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex justify-between items-center text-sm font-semibold mb-2">
                    <span>الإجمالي:</span>
                    <span>{order.total.toLocaleString("ar-EG")} ج.م</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">طريقة الدفع:</span>
                    <span>{order.paymentMethod === 'cod' ? 'عند الاستلام' : 'أونلاين (كاش)'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

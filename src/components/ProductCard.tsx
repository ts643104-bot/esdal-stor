import { ShoppingBag, Plus, Minus, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Product } from "@/lib/types";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, memo } from "react";
import { motion } from "framer-motion";

const ProductCard = memo(function ProductCard({ product }: { product: Product }) {
  const cart = useCart();
  const { t, lang } = useLanguage();

  const inCart = cart.items.find((x) => x.product.id === product.id);
  const [activeImage, setActiveImage] = useState(product.image_url);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const showRating = typeof product.rating === "number";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4 }}
    >
      <Card className="group h-full overflow-hidden rounded-[22px] border border-border/70 bg-card/95 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-primary/30">
        <div className="relative">
          <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
            <div className="relative">
              <button
                type="button"
                className="block w-full bg-transparent p-0 text-left"
                onClick={() => setIsDetailsOpen(true)}
                aria-label={`عرض تفاصيل ${product.name}`}
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-muted/30">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                      style={{ contentVisibility: "auto" }}
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted/50 to-muted/20 text-primary">
                      <div className="font-display text-xl font-black tracking-tighter opacity-60">لا توجد صورة متاحة</div>
                      <div className="h-px w-12 bg-primary/20" />
                      <span className="text-[9px] font-black uppercase tracking-[0.3em] opacity-30">هلا اليسر</span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-black/5 to-transparent" />

                  <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                    <Badge variant="secondary" className="rounded-full border-white/10 bg-white/90 text-[11px] font-semibold text-foreground shadow-sm">
                      {product.category}
                    </Badge>
                    {showRating && (
                      <Badge variant="secondary" className="rounded-full border-amber-200 bg-amber-500/95 text-[11px] font-semibold text-white">
                        ★ {product.rating!.toFixed(1)}
                      </Badge>
                    )}
                  </div>

                  {!product.in_stock && (
                    <div className="absolute bottom-3 left-3 rounded-full bg-destructive px-2.5 py-1 text-[11px] font-semibold text-destructive-foreground">
                      {lang === "ar" ? "غير متوفر" : "Out of stock"}
                    </div>
                  )}

                  <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <div className="rounded-full bg-white/90 p-2 shadow-lg">
                      <ImageIcon className="h-7 w-7 text-primary" />
                    </div>
                  </div>
                </div>
              </button>
            </div>

            <DialogContent className="overflow-hidden bg-background p-0 sm:max-w-2xl">
              <div className="flex h-[60vh] flex-col sm:flex-row">
                <div className="flex flex-1 flex-col items-center justify-center bg-muted p-4">
                  <div className="mb-3 flex items-center gap-2 self-end">
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoomLevel((value) => Math.max(1, Number((value - 0.25).toFixed(2))))}>
                      <span className="text-lg leading-none">−</span>
                    </Button>
                    <span className="min-w-16 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-center text-sm font-semibold shadow-sm">{zoomLevel.toFixed(2)}x</span>
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoomLevel((value) => Math.min(2.5, Number((value + 0.25).toFixed(2))))}>
                      <span className="text-lg leading-none">+</span>
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => setZoomLevel(1)}>100%</Button>
                  </div>
                  <div className="flex w-full flex-1 items-center justify-center overflow-auto">
                    {activeImage ? (
                      <img src={activeImage} style={{ transform: `scale(${zoomLevel})`, transformOrigin: "center center" }} className="max-h-full max-w-full rounded-md object-contain transition-transform duration-200" alt={product.name} />
                    ) : (
                      <div className="space-y-3 text-center">
                        <div className="font-display text-2xl font-black text-primary/70">لا توجد صورة متاحة</div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-50">سيتم إضافة الصورة عند توفرها</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex w-full flex-col border-t p-4 sm:w-1/3 sm:border-l sm:border-t-0">
                  <DialogHeader className="mb-4">
                    <DialogTitle>{product.name}</DialogTitle>
                  </DialogHeader>
                  <div className="flex-1 overflow-y-auto">
                    <p className="mb-4 text-xl font-bold text-primary">{product.price_egp.toLocaleString("ar-EG")} ج.م</p>
                    <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{product.description}</p>

                    {(product.images && product.images.length > 0) && (
                      <div>
                        <h4 className="mb-2 text-sm font-semibold">معرض الصور</h4>
                        <div className="grid grid-cols-3 gap-2">
                          <div
                            className={`aspect-square cursor-pointer overflow-hidden rounded-md border-2 ${activeImage === product.image_url ? "border-primary" : "border-transparent"}`}
                            onClick={() => setActiveImage(product.image_url)}
                          >
                            <img src={product.image_url} className="h-full w-full object-cover" alt="Main" />
                          </div>
                          {product.images.map((img, idx) => (
                            <div
                              key={idx}
                              className={`aspect-square cursor-pointer overflow-hidden rounded-md border-2 ${activeImage === img ? "border-primary" : "border-transparent"}`}
                              onClick={() => setActiveImage(img)}
                            >
                              <img src={img} className="h-full w-full object-cover" alt={`Gallery ${idx}`} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 border-t pt-4">
                    <Button className="w-full" disabled={!product.in_stock} onClick={() => cart.add(product)}>
                      <ShoppingBag className="mr-2 h-4 w-4" />
                      {product.in_stock ? t("product.addToCart") : (lang === "ar" ? "نفد من المخزون" : "Out of stock")}
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                {product.category}
              </p>
              <h3 className="line-clamp-2 text-sm font-semibold leading-6 text-foreground">{product.name}</h3>
            </div>
            <div className="whitespace-nowrap rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary">
              {product.in_stock ? (lang === "ar" ? "متوفر" : "In stock") : (lang === "ar" ? "غير متوفر" : "Out of stock")}
            </div>
          </div>

          <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
            {product.description || (lang === "ar" ? "لا يوجد وصف إضافي متاح حالياً." : "No additional description is available yet.")}
          </p>

          <div className="mt-auto space-y-3">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {lang === "ar" ? "السعر" : "Price"}
                </p>
                <p className="text-xl font-black text-primary">
                  {product.price_egp.toLocaleString("ar-EG")}
                  <span className="ml-1 text-sm font-semibold text-muted-foreground">{lang === "ar" ? "ج.م" : "EGP"}</span>
                </p>
              </div>
              {showRating && (
                <div className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  ★ {product.rating!.toFixed(1)}
                </div>
              )}
            </div>

            {inCart ? (
              <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-secondary/35 p-1">
                <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl text-destructive" onClick={() => cart.dec(product.id)}>
                  <Minus className="h-5 w-5" />
                </Button>
                <div className="flex flex-col items-center">
                  <span className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{lang === "ar" ? "الكمية" : "Qty"}</span>
                  <span className="text-sm font-bold leading-none">{inCart.qty}</span>
                </div>
                <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl text-primary" onClick={() => cart.add(product)}>
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <Button
                className="h-11 w-full rounded-2xl font-bold shadow-sm transition-all active:scale-[0.98]"
                disabled={!product.in_stock}
                onClick={() => cart.add(product)}
              >
                <ShoppingBag className="ml-2 h-5 w-5" />
                {t("product.addToCart")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

export default ProductCard;

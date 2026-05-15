import { ShoppingBag, Plus, Minus, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Product } from "@/lib/types";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";

export default function ProductCard({ product }: { product: Product }) {
  const cart = useCart();
  const { t, lang } = useLanguage();

  const inCart = cart.items.find((x) => x.product.id === product.id);
  const [activeImage, setActiveImage] = useState(product.image_url);

  return (
    <Card className="overflow-hidden bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60 border-border/60">
      <div className="relative aspect-[4/3] overflow-hidden">
        <Dialog>
          <DialogTrigger asChild>
            <div className="cursor-pointer group">
              <img
                src={product.image_url}
                alt={product.name}
                className="h-full w-full object-cover scale-[1.02] group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ImageIcon className="h-8 w-8 text-white" />
              </div>
            </div>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl p-0 overflow-hidden bg-background">
            <div className="flex flex-col sm:flex-row h-[60vh]">
              <div className="flex-1 bg-muted flex items-center justify-center p-4">
                <img src={activeImage} className="max-w-full max-h-full object-contain rounded-md" alt={product.name} />
              </div>
              <div className="w-full sm:w-1/3 p-4 flex flex-col border-l">
                <DialogHeader className="mb-4">
                  <DialogTitle>{product.name}</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto">
                  <p className="text-xl font-bold text-primary mb-4">{product.price_egp.toLocaleString("ar-EG")} ج.م</p>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">{product.description}</p>
                  
                  {(product.images && product.images.length > 0) && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">معرض الصور</h4>
                      <div className="grid grid-cols-3 gap-2">
                        <div 
                          className={`aspect-square rounded-md overflow-hidden cursor-pointer border-2 ${activeImage === product.image_url ? 'border-primary' : 'border-transparent'}`}
                          onClick={() => setActiveImage(product.image_url)}
                        >
                          <img src={product.image_url} className="w-full h-full object-cover" alt="Main" />
                        </div>
                        {product.images.map((img, idx) => (
                          <div 
                            key={idx}
                            className={`aspect-square rounded-md overflow-hidden cursor-pointer border-2 ${activeImage === img ? 'border-primary' : 'border-transparent'}`}
                            onClick={() => setActiveImage(img)}
                          >
                            <img src={img} className="w-full h-full object-cover" alt={`Gallery ${idx}`} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="pt-4 border-t mt-4">
                  <Button
                    className="w-full"
                    disabled={!product.in_stock}
                    onClick={() => cart.add(product)}
                  >
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    {product.in_stock ? t("product.addToCart") : (lang === "ar" ? "نفد من المخزون" : "Out of stock")}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        <div className="absolute top-3 right-3 flex gap-2">
          <Badge variant="secondary" className="bg-black/45 text-white border-white/10">
            {product.category}
          </Badge>
          {!product.in_stock && (
            <Badge className="bg-destructive text-destructive-foreground">نفد</Badge>
          )}
        </div>
        <div className="absolute bottom-2 left-2 right-2">
          <div className="font-display text-base sm:text-lg text-white leading-tight truncate">{product.name}</div>
          <div className="text-white/90 text-sm">{product.price_egp.toLocaleString("ar-EG")} {lang === "ar" ? "جنيه" : "EGP"}</div>
        </div>
      </div>

      <CardContent className="p-4">
        {product.description ? (
          <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground leading-relaxed">خامة ممتازة وتفاصيل عملية.</p>
        )}
      </CardContent>

      <CardFooter className="p-3 pt-0 flex flex-col gap-3">
        {inCart ? (
          <div className="flex items-center justify-between w-full bg-secondary/30 rounded-xl p-1 border border-border/40">
            <Button size="icon" variant="ghost" className="h-10 w-10 rounded-lg text-destructive" onClick={() => cart.dec(product.id)}>
              <Minus className="h-5 w-5" />
            </Button>
            <div className="flex flex-col items-center">
              <span className="text-xs text-muted-foreground leading-none mb-0.5">الكمية</span>
              <span className="text-sm font-bold leading-none">{inCart.qty}</span>
            </div>
            <Button size="icon" variant="ghost" className="h-10 w-10 rounded-lg text-primary" onClick={() => cart.add(product)}>
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <Button
            className="w-full h-11 sm:h-12 rounded-xl font-bold shadow-sm active:scale-[0.98] transition-all"
            disabled={!product.in_stock}
            onClick={() => cart.add(product)}
          >
            <ShoppingBag className="ml-2 h-5 w-5" />
            {t("product.addToCart")}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

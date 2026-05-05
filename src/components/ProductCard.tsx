import { ShoppingBag, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Product } from "@/lib/types";
import { useCart } from "@/contexts/CartContext";

export default function ProductCard({ product }: { product: Product }) {
  const cart = useCart();

  const inCart = cart.items.find((x) => x.product.id === product.id);

  return (
    <Card className="overflow-hidden bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60 border-border/60">
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={product.image_url}
          alt={product.name}
          className="h-full w-full object-cover scale-[1.02]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        <div className="absolute top-3 right-3 flex gap-2">
          <Badge variant="secondary" className="bg-black/45 text-white border-white/10">
            {product.category}
          </Badge>
          {!product.in_stock && (
            <Badge className="bg-destructive text-destructive-foreground">نفد</Badge>
          )}
        </div>
        <div className="absolute bottom-3 left-3">
          <div className="font-display text-lg text-white leading-snug">{product.name}</div>
          <div className="text-white/90 text-sm">{product.price_egp.toLocaleString("ar-EG")} جنيه</div>
        </div>
      </div>

      <CardContent className="p-4">
        {product.description ? (
          <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground leading-relaxed">خامة ممتازة وتفاصيل عملية.</p>
        )}
      </CardContent>

      <CardFooter className="p-4 pt-0 flex items-center justify-between gap-3">
        <Button
          className="flex-1"
          disabled={!product.in_stock}
          onClick={() => cart.add(product)}
        >
          <ShoppingBag className="ms-2 h-4 w-4" />
          أضف للسلة
        </Button>

        {inCart && (
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={() => cart.dec(product.id)}>
              <Minus className="h-4 w-4" />
            </Button>
            <div className="min-w-8 text-center font-semibold">{inCart.qty}</div>
            <Button size="icon" variant="outline" onClick={() => cart.add(product)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

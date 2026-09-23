import React, { createContext, useContext, useMemo, useState } from "react";
import type { CartItem, Product } from "@/lib/types";
import { toast } from "sonner";

type CartState = {
  items: CartItem[];
  add: (p: Product, selectedSize?: Product["size"]) => void;
  dec: (productId: string, selectedSize?: Product["size"]) => void;
  remove: (productId: string, selectedSize?: Product["size"]) => void;
  clear: () => void;
  totalItems: number;
  totalPrice: number;
};

const CartCtx = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const add = (p: Product, selectedSize?: Product["size"]) => {
    const product = selectedSize ? { ...p, size: selectedSize } : p;
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.product.id === product.id && x.product.size === product.size);
      const maxStock = product.stock_quantity ?? 10;
      if (idx >= 0) {
        if (prev[idx].qty >= maxStock) {
          toast.error(`عفواً، الكمية المتاحة في المخزون هي ${maxStock} فقط.`);
          return prev;
        }
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      if (maxStock < 1) {
        toast.error(`عفواً، المنتج نفد من المخزون.`);
        return prev;
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  const dec = (productId: string, selectedSize?: Product["size"]) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.product.id === productId && x.product.size === selectedSize);
      if (idx < 0) return prev;
      const next = [...prev];
      const cur = next[idx];
      if (cur.qty <= 1) return next.filter((x) => !(x.product.id === productId && x.product.size === selectedSize));
      next[idx] = { ...cur, qty: cur.qty - 1 };
      return next;
    });
  };

  const remove = (productId: string, selectedSize?: Product["size"]) => {
    setItems((prev) => prev.filter((x) => !(x.product.id === productId && x.product.size === selectedSize)));
  };

  const clear = () => setItems([]);

  const { totalItems, totalPrice } = useMemo(() => {
    const totalItems = items.reduce((s, x) => s + x.qty, 0);
    const totalPrice = items.reduce((s, x) => s + x.qty * x.product.price_egp, 0);
    return { totalItems, totalPrice };
  }, [items]);

  const value: CartState = {
    items,
    add,
    dec,
    remove,
    clear,
    totalItems,
    totalPrice,
  };

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useCart() {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

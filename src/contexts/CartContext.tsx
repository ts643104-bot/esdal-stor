import React, { createContext, useContext, useMemo, useState } from "react";
import type { CartItem, Product } from "@/lib/types";
import { toast } from "sonner";

type CartState = {
  items: CartItem[];
  add: (p: Product) => void;
  dec: (productId: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
  totalItems: number;
  totalPrice: number;
};

const CartCtx = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const add = (p: Product) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.product.id === p.id);
      const maxStock = p.stock_quantity ?? 10;
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
      return [...prev, { product: p, qty: 1 }];
    });
  };

  const dec = (productId: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.product.id === productId);
      if (idx < 0) return prev;
      const next = [...prev];
      const cur = next[idx];
      if (cur.qty <= 1) return next.filter((x) => x.product.id !== productId);
      next[idx] = { ...cur, qty: cur.qty - 1 };
      return next;
    });
  };

  const remove = (productId: string) => {
    setItems((prev) => prev.filter((x) => x.product.id !== productId));
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

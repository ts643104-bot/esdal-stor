import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, RefreshCw } from "lucide-react";
import heroImg from "@/assets/hero.jpeg";
import ProductCard from "@/components/ProductCard";
import CartSheet from "@/components/CartSheet";
import TrackOrder from "@/components/TrackOrder";
import { loadProducts } from "@/lib/products";
import type { Product } from "@/lib/types";

interface HomeProps {
  targetSection?: string;
}

export default function Home({ targetSection }: HomeProps) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("الكل");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"google" | "fallback" | "local">("fallback");

  // Scroll to target section when URL changes
  useEffect(() => {
    if (targetSection) {
      document.getElementById(targetSection)?.scrollIntoView({ behavior: "smooth" });
    }
  }, [targetSection]);

  const reload = async () => {
    setLoading(true);
    try {
      const { db } = await import("@/lib/db");
      const { hasSupabase } = await import("@/lib/supabase");
      const items = await db.getProducts();
      setProducts(items);
      setSource(hasSupabase ? "google" : "local");
    } catch {
      toast.error("حصلت مشكلة أثناء تحميل المنتجات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>(["الكل"]);
    products.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [products]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return products.filter((p) => {
      const okCat = cat === "الكل" ? true : p.category === cat;
      const okQ = !query ? true : p.name.toLowerCase().includes(query);
      return okCat && okQ;
    });
  }, [products, q, cat]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/15 border border-primary/25 grid place-items-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="font-display text-lg leading-none">Esdal Store</div>
              <div className="text-xs text-muted-foreground">تسوق سريع • طلب بضغطة واتساب</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <TrackOrder />
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:flex text-muted-foreground hover:text-foreground"
              onClick={() => void reload()}
              title="تحديث البيانات"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <CartSheet />
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden">
          <img
            src={heroImg}
            alt="خلفية زخرفة هندسية"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-black/55" />
          <div className="absolute inset-0 esdal-noise" />

          <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-18">
            <div className="max-w-2xl">
              <Badge className="bg-primary text-primary-foreground">الدفع عند الاستلام</Badge>
              <h1 className="mt-4 font-display text-4xl sm:text-5xl leading-tight">
                إسدالات صلاة وملابس تقليدية…
                <span className="text-primary"> والطلب في رسالة واحدة</span>
              </h1>
              <p className="mt-4 text-white/85 leading-relaxed">
                اختار/ي اللي يعجبك، ضيف/ي للسلة، و"إتمام الطلب" هيفتح واتساب برسالة جاهزة فيها كل التفاصيل.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" })}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-primary-foreground font-semibold"
                >
                  ابدأ التسوق
                </button>
                <button
                  onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}
                  className="inline-flex items-center justify-center rounded-xl border border-white/25 bg-black/20 px-5 py-3 text-white font-semibold"
                >
                  كيف يعمل؟
                </button>
              </div>

              <div className="mt-6 text-xs text-white/70">
                مصدر المنتجات: {source === "google" ? "Supabase (Global)" : "Local Storage (Device only)"}
              </div>
            </div>
          </div>
        </section>

        {/* HOW */}
        <section id="how" className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-card/60 p-5">
              <div className="font-display text-lg">1) اختار المنتج</div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">تصفح الإسدالات والملابس، وحدد الكمية بسهولة.</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card/60 p-5">
              <div className="font-display text-lg">2) ضيف للسلة</div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">السلة بتجمع كل اختياراتك وتحسب الإجمالي فوراً.</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card/60 p-5">
              <div className="font-display text-lg">3) واتساب = طلب جاهز</div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">زر واحد يفتح واتساب على رقم المتجر برسالة مرتبة.</p>
            </div>
          </div>
        </section>

        {/* PRODUCTS */}
        <section id="products" className="mx-auto max-w-6xl px-4 pb-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-2xl">المنتجات</h2>
              <p className="text-sm text-muted-foreground">ابحث/ي أو فلتر/ي حسب التصنيف.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم المنتج…" />
              <div className="flex flex-wrap gap-2">
                {categories.slice(0, 6).map((c) => (
                  <Button
                    key={c}
                    size="sm"
                    variant={c === cat ? "default" : "outline"}
                    onClick={() => setCat(c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6">
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-border/60 overflow-hidden">
                    <Skeleton className="h-48 w-full" />
                    <div className="p-4 space-y-3">
                      <Skeleton className="h-5 w-4/5" />
                      <Skeleton className="h-4 w-3/5" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="mt-10 rounded-2xl border border-border/60 bg-card/60 p-6 text-muted-foreground">
                مفيش نتائج… جرّب/ي كلمة بحث تانية أو اختار/ي تصنيف مختلف.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="font-display">Esdal Store</div>
            <div className="text-xs text-muted-foreground">طلبات واتساب • دفع عند الاستلام</div>
          </div>
          <div className="flex items-center gap-4">
            <a href="#/admin" className="text-sm font-semibold text-primary hover:underline">لوحة تحكم الإدارة</a>
            <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} Esdal Store</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

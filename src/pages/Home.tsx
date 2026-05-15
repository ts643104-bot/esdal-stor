import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, RefreshCw, Globe, User } from "lucide-react";
import heroImg from "@/assets/hero.jpeg";
import ProductCard from "@/components/ProductCard";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "wouter";
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
  const { t, lang, setLang } = useLanguage();

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
      const { hasFirebase } = await import("@/lib/firebase");
      const items = await db.getProducts();
      setProducts(items);
      setSource(hasFirebase ? "google" : "local");
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

  const [page, setPage] = useState(1);
  const productsPerPage = 12;

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return products.filter((p) => {
      const okCat = cat === "الكل" ? true : p.category === cat;
      const okQ = !query ? true : p.name.toLowerCase().includes(query);
      return okCat && okQ;
    });
  }, [products, q, cat]);

  const pagedProducts = useMemo(() => {
    return filtered.slice(0, page * productsPerPage);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [q, cat]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-6xl px-4 py-2 sm:py-3 flex items-center justify-between gap-2">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-primary/15 border border-primary/25 grid place-items-center">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div className="flex flex-col">
              <div className="font-display text-base sm:text-xl font-bold leading-tight">{t("app.title")}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground hidden xs:block">{t("app.subtitle")}</div>
            </div>
          </div>

          {/* Navigation Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 border-l border-border/40 pl-2 ml-1 sm:pl-3 sm:ml-2">
              <TrackOrder />
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10 text-muted-foreground hover:text-foreground active:bg-muted/80" 
                asChild
              >
                <Link href="/profile" title={t("nav.profile" as any) || "حسابي"}>
                  <User className="h-5 w-5" />
                </Link>
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                className="h-10 px-2 text-muted-foreground hover:text-foreground hidden xs:flex"
                onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              >
                <Globe className="h-5 w-5 sm:ml-2" />
                <span className="text-xs uppercase font-bold hidden sm:inline">{lang === "ar" ? "EN" : "AR"}</span>
              </Button>
            </div>

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
              <Badge className="bg-primary text-primary-foreground">{t("hero.badge")}</Badge>
              <h1 className="mt-4 font-display text-4xl sm:text-5xl leading-tight">
                {t("hero.title1")}
                <span className="text-primary">{t("hero.title2")}</span>
              </h1>
              <p className="mt-4 text-white/85 leading-relaxed">
                {t("hero.desc")}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" })}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-primary-foreground font-semibold"
                >
                  {t("hero.start")}
                </button>
                <button
                  onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}
                  className="inline-flex items-center justify-center rounded-xl border border-white/25 bg-black/20 px-5 py-3 text-white font-semibold"
                >
                  {t("hero.how")}
                </button>
              </div>

              <div className="mt-6 text-xs text-white/70">
                مصدر المنتجات: {source === "google" ? "Cloud Sync" : "Local Storage"}
              </div>
            </div>
          </div>
        </section>

        {/* HOW */}
        <section id="how" className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-card/60 p-5">
              <div className="font-display text-lg">{t("how.title1")}</div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t("how.desc1")}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card/60 p-5">
              <div className="font-display text-lg">{t("how.title2")}</div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t("how.desc2")}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card/60 p-5">
              <div className="font-display text-lg">{t("how.title3")}</div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t("how.desc3")}</p>
            </div>
          </div>
        </section>

        {/* PRODUCTS */}
        <section id="products" className="mx-auto max-w-6xl px-4 pb-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="mb-4">
              <h2 className="font-display text-2xl sm:text-3xl">{t("products.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("products.subtitle")}</p>
            </div>

            <div className="flex flex-col gap-4 sm:w-full max-w-lg">
              <div className="relative group">
                <Input 
                  value={q} 
                  onChange={(e) => setQ(e.target.value)} 
                  placeholder={t("products.search")} 
                  className="h-11 sm:h-12 pr-10 rounded-xl bg-muted/40 border-none focus-visible:ring-primary/30"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                  <Sparkles className="h-4 w-4" />
                </div>
              </div>
              
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar">
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCat(c)}
                    className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all active:scale-95
                      ${c === cat 
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                        : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}
                  >
                    {c}
                  </button>
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
              <div className="mt-10 rounded-2xl border border-border/60 bg-card/60 p-6 text-muted-foreground text-center">
                {t("products.empty")}
              </div>
            ) : (
              <>
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {pagedProducts.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
                {filtered.length > pagedProducts.length && (
                  <div className="mt-10 flex justify-center">
                    <Button 
                      variant="outline" 
                      size="lg" 
                      onClick={() => setPage(p => p + 1)}
                      className="px-10 rounded-full border-primary/30 hover:bg-primary/10"
                    >
                      {lang === "ar" ? "تحميل المزيد من المنتجات..." : "Load More Products"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="font-display">{t("footer.title")}</div>
            <div className="text-xs text-muted-foreground">{t("footer.subtitle")}</div>
          </div>
          <div className="flex items-center gap-4">
            <a href="#/admin" className="text-sm font-semibold text-primary hover:underline">{t("footer.admin")}</a>
            <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} هلا اليسر</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

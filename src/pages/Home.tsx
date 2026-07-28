import { useEffect, useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, RefreshCw, Globe, User, Search, Filter, SlidersHorizontal, ArrowDownWideNarrow, X, MessageCircle as WhatsAppIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// heroImg removed as per user request
import ProductCard from "@/components/ProductCard";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "wouter";
import { motion } from "framer-motion";
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
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [dbCategories, setDbCategories] = useState<string[]>([]);
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
      const [items, cats] = await Promise.all([db.getProducts(), db.getCategories()]);
      setProducts(items);
      setDbCategories(cats.map(c => c.name));
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
    const set = new Set<string>(["الكل", ...dbCategories]);
    products.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [dbCategories, products]);

  const [page, setPage] = useState(1);
  const productsPerPage = 12;
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);

    return products
      .filter((p) => {
        const okCat = cat === "الكل" ? true : p.category === cat;
        
        // Match by Name OR Price
        const okQ = !query ? true : (
          p.name.toLowerCase().includes(query) || 
          p.price_egp.toString().includes(query)
        );

        // Price Range
        const okMin = isNaN(min) ? true : p.price_egp >= min;
        const okMax = isNaN(max) ? true : p.price_egp <= max;

        // Availability
        const okAvailable = onlyAvailable ? p.in_stock : true;
        
        return okCat && okQ && okMin && okMax && okAvailable;
      })
      .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0)); // Best Selling First
  }, [products, q, cat, minPrice, maxPrice, onlyAvailable]);

  const pagedProducts = useMemo(() => {
    return filtered.slice(0, page * productsPerPage);
  }, [filtered, page]);

  // Reset page when search or category changes
  useEffect(() => {
    setPage(1);
  }, [q, cat]);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && filtered.length > page * productsPerPage) {
          setPage((p) => p + 1);
        }
      },
      { rootMargin: "300px" } // Load before the user actually reaches the bottom
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [filtered.length, page, productsPerPage]);

  const handleWhatsAppQuickChat = () => {
    const phone = "201122310891";
    const msg = encodeURIComponent("أهلاً متجر هلا اليسر، كنت أرغب في الاستفسار عن بعض المنتجات المتاحة..");
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-6xl px-4 py-2 sm:py-3 flex items-center justify-between gap-2">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-xl bg-primary/5 border border-primary/20 overflow-hidden shrink-0 shadow-sm p-0.5">
              <img src="./logo.png" alt="Logo" className="w-full h-full object-contain rounded-lg" />
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
        <section className="relative overflow-hidden bg-zinc-950 py-20 sm:py-32">
          {/* Professional Premium Background */}
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40 mix-blend-luminosity" 
            style={{ backgroundImage: "url('./hero-bg.png')" }} 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/50 to-transparent" />

          <div className="relative mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-12">
            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="w-full lg:w-1/2 text-right z-10"
            >
              <Badge className="bg-primary/20 text-primary border-primary/30 mb-4">{t("hero.badge")}</Badge>
              <h1 className="font-display text-3xl sm:text-5xl font-black leading-tight text-white">
                {t("hero.title1")}
                <span className="text-primary block mt-2">{t("hero.title2")}</span>
              </h1>
              <p className="mt-6 text-zinc-400 text-lg leading-relaxed max-w-lg">
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
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.2 }}
              className="hidden lg:block w-1/2 relative"
            >
              <div className="relative w-full max-w-[400px] aspect-square mx-auto rounded-full overflow-hidden border border-primary/20 shadow-2xl shadow-primary/20">
                <img src="./logo.png" alt="Logo" className="w-full h-full object-cover" />
                <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/10" />
              </div>
            </motion.div>
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
              <h2 className="font-display text-xl sm:text-2xl">{t("products.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("products.subtitle")}</p>
            </div>

            <div className="flex flex-col gap-4 w-full max-w-3xl">
              <div className="flex gap-2">
                <div className="relative flex-1 group">
                  <Input 
                    value={q} 
                    onChange={(e) => setQ(e.target.value)} 
                    placeholder={lang === "ar" ? "ابحث بالاسم أو السعر..." : "Search by name or price..."} 
                    className="h-12 pr-10 rounded-2xl bg-card border-border/40 shadow-sm focus-visible:ring-primary/30 text-lg"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                    <Search className="h-5 w-5" />
                  </div>
                </div>

                <Popover open={showFilters} onOpenChange={setShowFilters}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-12 w-12 rounded-2xl p-0 border-border/40 bg-card shadow-sm active:scale-95 transition-transform">
                      <SlidersHorizontal className="h-5 w-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-5 rounded-2xl shadow-xl" align="end" sideOffset={10}>
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 border-b pb-2">
                        <Filter className="h-4 w-4 text-primary" />
                        <h4 className="font-bold text-sm">{lang === "ar" ? "تصفية متقدمة" : "Advanced Filter"}</h4>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-xs text-muted-foreground">{lang === "ar" ? "نطاق السعر (جنيه)" : "Price Range (EGP)"}</Label>
                        <div className="flex items-center gap-2">
                          <Input 
                            type="number" 
                            placeholder={lang === "ar" ? "من" : "Min"} 
                            value={minPrice} 
                            onChange={(e) => setMinPrice(e.target.value)}
                            className="h-10 rounded-xl bg-muted/30 border-none"
                          />
                          <span className="text-muted-foreground"> - </span>
                          <Input 
                            type="number" 
                            placeholder={lang === "ar" ? "إلى" : "Max"} 
                            value={maxPrice} 
                            onChange={(e) => setMaxPrice(e.target.value)}
                            className="h-10 rounded-xl bg-muted/30 border-none"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-muted/20 p-3 rounded-xl border border-border/40">
                        <div className="space-y-0.5">
                          <Label htmlFor="available" className="text-sm font-semibold cursor-pointer">{lang === "ar" ? "متوفر الآن فقط" : "In Stock Only"}</Label>
                          <p className="text-[10px] text-muted-foreground">{lang === "ar" ? "إخفاء المنتجات غير المتوفرة" : "Hide out of stock items"}</p>
                        </div>
                        <Switch id="available" checked={onlyAvailable} onCheckedChange={setOnlyAvailable} />
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t text-[10px] text-muted-foreground italic">
                        <ArrowDownWideNarrow className="h-3 w-3" />
                        {lang === "ar" ? "يتم الترتيب آلياً حسب الأكثر مبيعاً" : "Sorted automatically by best selling"}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              
              {/* Active Filter Badges */}
              {(cat !== "الكل" || minPrice || maxPrice || onlyAvailable) && (
                <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1 px-1 mb-2">
                  {cat !== "الكل" && (
                    <Badge variant="secondary" className="gap-1.5 h-7 px-3 bg-primary/10 text-primary border-primary/20 rounded-lg">
                      {cat}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => setCat("الكل")} />
                    </Badge>
                  )}
                  {minPrice && (
                    <Badge variant="secondary" className="gap-1.5 h-7 px-3 bg-primary/10 text-primary border-primary/20 rounded-lg">
                      {lang === "ar" ? "أكبر من" : "Min"} {minPrice}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => setMinPrice("")} />
                    </Badge>
                  )}
                  {maxPrice && (
                    <Badge variant="secondary" className="gap-1.5 h-7 px-3 bg-primary/10 text-primary border-primary/20 rounded-lg">
                      {lang === "ar" ? "أقل من" : "Max"} {maxPrice}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => setMaxPrice("")} />
                    </Badge>
                  )}
                  {onlyAvailable && (
                    <Badge variant="secondary" className="gap-1.5 h-7 px-3 bg-primary/10 text-primary border-primary/20 rounded-lg">
                      {lang === "ar" ? "المتوفر فقط" : "In Stock"}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => setOnlyAvailable(false)} />
                    </Badge>
                  )}
                  <button 
                    onClick={() => { setCat("الكل"); setMinPrice(""); setMaxPrice(""); setOnlyAvailable(false); }}
                    className="text-[10px] font-bold text-muted-foreground hover:text-destructive underline underline-offset-4 px-2"
                  >
                    {lang === "ar" ? "مسح الكل" : "Clear all"}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar scroll-smooth rtl:flex-row-reverse justify-start">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] uppercase tracking-widest font-black text-primary/60 whitespace-nowrap px-2 py-1 bg-primary/5 rounded-md border border-primary/10">
                    {lang === "ar" ? "الفئات" : "Categories"}
                  </span>
                  <div className="flex items-center gap-2">
                    {categories.map((c) => (
                      <button
                        key={c}
                        onClick={() => setCat(c)}
                        className={`whitespace-nowrap h-10 px-6 rounded-2xl text-sm font-bold transition-all duration-300 active:scale-95 border-2
                          ${c === cat 
                            ? "bg-primary text-primary-foreground border-primary shadow-xl shadow-primary/30 -translate-y-0.5" 
                            : "bg-card text-muted-foreground border-border/40 hover:border-primary/30 hover:text-foreground"}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
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
                  <div ref={loadMoreRef} className="mt-10 flex justify-center py-6">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-sm"></div>
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
          <div className="flex flex-col sm:items-end gap-2 text-right">
            <div className="flex items-center gap-4">
              <a href="#/admin" className="text-sm font-semibold text-primary hover:underline">{t("footer.admin")}</a>
              <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} هلا اليسر</div>
            </div>
            <div className="group relative">
               <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 to-primary opacity-20 blur group-hover:opacity-40 transition duration-500"></div>
               <div className="relative text-[10px] font-black uppercase tracking-widest bg-background/80 border border-primary/20 px-3 py-1.5 rounded-lg shadow-sm">
                 {lang === "ar" ? "برمجة وتطوير طه سلطان" : "Developed by Taha Sultan"}
               </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Removed Redundant WhatsApp Widget (Handled by App.tsx) */}
    </div>
  );
}

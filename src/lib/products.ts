import { parseCsv } from "@/lib/csv";
import type { Product } from "@/lib/types";

const FALLBACK_PRODUCTS: Product[] = [
  {
    id: "esdal-001",
    name: "إسدال صلاة سادة (كريب)",
    price_egp: 450,
    image_url:
      "https://images.unsplash.com/photo-1736342182213-6c037467cb38?fm=jpg&q=60&w=1200&auto=format&fit=crop",
    category: "إسدالات",
    in_stock: true,
    description: "قماش كريب خفيف – مناسب للاستخدام اليومي.",
  },
  {
    id: "abaya-002",
    name: "عباية سوداء كلاسيك",
    price_egp: 750,
    image_url:
      "https://images.unsplash.com/photo-1750190321725-65a717efc8a6?fm=jpg&q=60&w=1200&auto=format&fit=crop",
    category: "ملابس تقليدية",
    in_stock: true,
    description: "قصّة مريحة ولمسة نهائية أنيقة.",
  },
  {
    id: "khimar-003",
    name: "خمار طويل (قطن)",
    price_egp: 320,
    image_url:
      "https://images.unsplash.com/photo-1597578843067-5d33f44383db?fm=jpg&q=60&w=1200&auto=format&fit=crop",
    category: "ملابس تقليدية",
    in_stock: false,
    description: "نفدت الكمية حالياً.",
  },
];

export async function loadProducts(): Promise<{ products: Product[]; source: "google" | "fallback" }>{
  const csvUrl = import.meta.env.VITE_GOOGLE_SHEET_CSV_URL as string | undefined;
  if (!csvUrl) {
    return { products: FALLBACK_PRODUCTS, source: "fallback" };
  }

  const res = await fetch(csvUrl, { cache: "no-store" });
  if (!res.ok) {
    return { products: FALLBACK_PRODUCTS, source: "fallback" };
  }

  const text = await res.text();
  const rows = parseCsv(text);

  const products: Product[] = rows
    .map((r) => rowToProduct(r))
    .filter((p): p is Product => Boolean(p));

  if (products.length === 0) return { products: FALLBACK_PRODUCTS, source: "fallback" };
  return { products, source: "google" };
}

function rowToProduct(row: Record<string, string>): Product | null {
  // الأعمدة المقترحة في Google Sheets:
  // id, name, price_egp, image_url, category, in_stock, description
  const id = (row.id || row.ID || "").trim();
  const name = (row.name || row.Name || "").trim();
  const priceRaw = (row.price_egp || row.price || row.Price || "").trim();
  const image_url = (row.image_url || row.image || row.Image || "").trim();
  const category = (row.category || row.Category || "غير مصنّف").trim() || "غير مصنّف";
  const inStockRaw = (row.in_stock || row.stock || row.available || "true").trim();
  const description = (row.description || row.desc || "").trim();

  if (!id || !name || !priceRaw) return null;

  const price_egp = Number(String(priceRaw).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(price_egp)) return null;

  const in_stock = !/^(0|false|no|نفد|غير متاح)$/i.test(inStockRaw);

  return {
    id,
    name,
    price_egp,
    image_url:
      image_url ||
      "https://images.unsplash.com/photo-1736342182213-6c037467cb38?fm=jpg&q=60&w=1200&auto=format&fit=crop",
    category,
    in_stock,
    description: description || undefined,
  };
}

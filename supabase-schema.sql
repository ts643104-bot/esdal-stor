-- اذهب إلى موقع Supabase.com
-- قم بإنشاء مشروع جديد، ثم افتح قائمة SQL Editor من القائمة الجانبية.
-- الصق الكود التالي واضغط على زر Run لتجهيز قاعدة البيانات.

-- 1. إنشاء جدول المنتجات (Products)
CREATE TABLE IF NOT EXISTS public.products (
  id text PRIMARY KEY,
  name text NOT NULL,
  price_egp numeric NOT NULL,
  image_url text,
  category text,
  in_stock boolean DEFAULT true,
  description text,
  stock_quantity numeric DEFAULT 10
);

-- 2. إنشاء جدول الطلبات (Orders)
CREATE TABLE IF NOT EXISTS public.orders (
  id text PRIMARY KEY,
  date timestamp with time zone DEFAULT now(),
  items jsonb NOT NULL,
  total numeric NOT NULL,
  status text DEFAULT 'pending',
  "paymentMethod" text DEFAULT 'cod',
  "senderPhone" text,
  "customerName" text,
  "customerAddress" text
);

-- 3. إنشاء جدول المصروفات (Expenses)
CREATE TABLE IF NOT EXISTS public.expenses (
  id text PRIMARY KEY,
  name text NOT NULL,
  amount numeric NOT NULL,
  date timestamp with time zone DEFAULT now()
);

-- 4. إغلاق أمان القراءة والكتابة للعامة (بما أن هذا مشروع سريع، نسمح للواجهة بالوصول)
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses DISABLE ROW LEVEL SECURITY;

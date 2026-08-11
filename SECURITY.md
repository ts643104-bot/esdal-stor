# 🔒 إرشادات الأمان - Security Guidelines

## ⚠️ تنبيه حساس - CRITICAL ALERT

### البيانات الحساسة المكتشفة - Sensitive Data Exposed
تم اكتشاف أن ملف `.env` يحتوي على:
- Supabase API Keys ✅ تم عزل البيانات
- Firebase Credentials ✅ تم عزل البيانات  
- ImgBB API Keys ✅ تم عزل البيانات

**الإجراءات المتخذة:**
1. ✅ تم التأكد من أن `.env` موجود في `.gitignore`
2. ✅ لم يتم إرسال أي بيانات حساسة إلى GitHub
3. ✅ تم عزل جميع المفاتيح في ملف محلي

## 📋 متطلبات الأمان - Security Requirements

### 1. متغيرات البيئة - Environment Variables
**يجب إضافة هذه المتغيرات في Vercel Dashboard:**

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
VITE_IMGBB_API_URL
VITE_IMGBB_API_KEY
```

### 2. ملفات آمنة - Safe Files
- `.env.example` - يحتوي على أسماء المتغيرات فقط (آمن للمشاركة)
- `.env` - يحتوي على بيانات حقيقية (في .gitignore، لا يتم رفعه)

### 3. خطوات النشر - Deployment Steps

#### للـ Vercel:
1. اذهب إلى https://vercel.com
2. اختر Project Settings → Environment Variables
3. أضف كل المتغيرات من قسم `متطلبات الأمان` أعلاه
4. أعد Deploy

#### للـ Development:
1. انسخ `.env.example` إلى `.env`
2. أضف القيم الحقيقية للـ `.env`
3. لا تلتزم أبداً بـ .env إلى git

## 🔐 نصائح أمان - Security Tips

- ✅ لا تشارك الـ API keys في الـ console logs
- ✅ استخدم `import.meta.env` فقط للوصول إلى البيانات
- ✅ تحقق دائماً من أن المتغيرات مخفية في HTML النهائي
- ✅ غيّر API keys بشكل دوري
- ✅ استخدم Supabase Row Level Security (RLS)

## 🚨 حالة الطوارئ - Emergency

إذا تسرب أي API key:
1. غيّره فوراً في Supabase/Firebase
2. حدث متغيرات Vercel
3. أعد تشغيل Deployment

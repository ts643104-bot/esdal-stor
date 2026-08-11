import { MessageCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { getActiveWhatsappNumber } from "@/lib/utils";

export default function WhatsAppFloat() {
  const { lang } = useLanguage();
  const [phone, setPhone] = useState("201122310891");

  useEffect(() => {
    const loadPhone = async () => {
      try {
        const settings = await db.getSettings();
        const activePhone = getActiveWhatsappNumber(settings.whatsappNumbers);
        setPhone(activePhone);
      } catch (err) {
        console.error("Failed to load WhatsApp numbers", err);
      }
    };
    loadPhone();
  }, []);

  const message = lang === "ar" ? "مرحباً، لدي استفسار..." : "Hello, I have a question...";

  return (
    <a
      href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex items-center justify-center h-16 w-16 bg-[#25D366] text-white rounded-full shadow-2xl hover:scale-110 transition-transform active:scale-95"
      style={{ boxShadow: '0 8px 30px rgba(37, 211, 102, 0.4)' }}
    >
      <MessageCircle className="h-9 w-9" />
      <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-[11px] font-black text-white border-2 border-white animate-bounce shadow-lg">
        1
      </span>
    </a>
  );
}

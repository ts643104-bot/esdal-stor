import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { getActiveWhatsappNumber } from "@/lib/utils";

export default function WhatsAppIcon() {
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

  const message = lang === "ar" 
    ? "مرحباً متجر هلا اليسر، لدي استفسار..." 
    : "Hi Hala Al-Yusr, I have a question...";
    
  const handleClick = () => {
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  return (
    <div 
      className={`fixed bottom-6 ${lang === "ar" ? "left-6" : "right-6"} z-50`}
    >
      <div className="relative group">
         {/* Notification Badge "1" */}
         <div className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-black h-5 w-5 rounded-full border-2 border-white flex items-center justify-center shadow-lg z-10 animate-pulse">
           1
         </div>

         {/* Floating Label */}
         <div className={`absolute bottom-full mb-3 ${lang === "ar" ? "left-0" : "right-0"} bg-white dark:bg-zinc-800 text-black dark:text-white text-[10px] font-black py-2 px-4 rounded-2xl border-2 border-primary/10 shadow-2xl whitespace-nowrap hidden sm:block animate-in fade-in slide-in-from-bottom-2`}>
            {lang === "ar" ? "تحتاج مساعدة؟ تواصل معنا! 👇" : "Need help? Chat now! 👇"}
         </div>
         
         <Button
            onClick={handleClick}
            size="icon"
            className="h-16 w-16 rounded-full bg-[#25D366] hover:bg-[#20ba56] text-white shadow-2xl shadow-green-500/30 transition-all duration-300 active:scale-90 hover:scale-110"
         >
            <MessageCircle className="h-9 w-9" />
            <span className="sr-only">WhatsApp Chat</span>
         </Button>
      </div>
    </div>
  );
}

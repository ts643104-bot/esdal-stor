import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MapPin, MapPinned } from "lucide-react";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

// Fix default icon issue with react-leaflet
const DefaultIcon = L.icon({
  iconUrl,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

function LocationMarker({ position, setPosition }: { position: L.LatLng | null, setPosition: (pos: L.LatLng) => void }) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });

  return position === null ? null : (
    <Marker position={position}></Marker>
  );
}

export function MapPicker({ onLocationSelect }: { onLocationSelect: (url: string, governorate?: string) => void }) {
  const [position, setPosition] = useState<L.LatLng | null>(null);
  const [open, setOpen] = useState(false);

  // Set default center to Cairo
  const defaultCenter: [number, number] = [30.0444, 31.2357];

  const handleConfirm = async () => {
    if (position) {
      const link = `https://maps.google.com/?q=${position.lat},${position.lng}`;
      let detectedGov: string | undefined = undefined;

      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.lat}&lon=${position.lng}&accept-language=ar`);
        const data = await res.json();
        
        if (data && data.address) {
          const stateStr = data.address.state || data.address.city || data.address.region || "";
          
          // Map OSM common names to our EGYPT_GOVERNORATES
          const mapping: Record<string, string> = {
            "القاهرة": "القاهرة", "Cairo": "القاهرة",
            "الجيزة": "الجيزة", "Giza": "الجيزة",
            "الإسكندرية": "الإسكندرية", "Alexandria": "الإسكندرية",
            "القليوبية": "القليوبية", "Qalyubia": "القليوبية",
            "الدقهلية": "الدقهلية", "Dakahlia": "الدقهلية",
            "الشرقية": "الشرقية", "Sharqia": "الشرقية",
            "الغربية": "الغربية", "Gharbia": "الغربية",
            "المنوفية": "المنوفية", "Monufia": "المنوفية",
            "البحيرة": "البحيرة", "Beheira": "البحيرة",
            "كفر الشيخ": "كفر الشيخ", "Kafr El Sheikh": "كفر الشيخ",
            "دمياط": "دمياط", "Damietta": "دمياط",
            "بورسعيد": "بورسعيد", "Port Said": "بورسعيد",
            "الإسماعيلية": "الإسماعيلية", "Ismailia": "الإسماعيلية",
            "السويس": "السويس", "Suez": "السويس",
            "الفيوم": "الفيوم", "Faiyum": "الفيوم",
            "بني سويف": "بني سويف", "Beni Suef": "بني سويف",
            "المنيا": "المنيا", "Minya": "المنيا",
            "أسيوط": "أسيوط", "Asyut": "أسيوط",
            "سوهاج": "سوهاج", "Sohag": "سوهاج",
            "قنا": "قنا", "Qena": "قنا",
            "الأقصر": "الأقصر", "Luxor": "الأقصر",
            "أسوان": "أسوان", "Aswan": "أسوان",
            "البحر الأحمر": "البحر الأحمر", "Red Sea": "البحر الأحمر",
            "الوادي الجديد": "الوادي الجديد", "New Valley": "الوادي الجديد",
            "مطروح": "مطروح", "Matrouh": "مطروح",
            "شمال سيناء": "شمال سيناء", "North Sinai": "شمال سيناء",
            "جنوب سيناء": "جنوب سيناء", "South Sinai": "جنوب سيناء"
          };

          for (const key in mapping) {
            if (stateStr.includes(key)) {
              detectedGov = mapping[key];
              break;
            }
          }
        }
      } catch (e) {
        console.error("Reverse geocoding failed", e);
      }

      onLocationSelect(link, detectedGov);
      setOpen(false);
    }
  };

  const handleGetLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setPosition(L.latLng(pos.coords.latitude, pos.coords.longitude));
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" type="button" className="w-full gap-2 mt-2 bg-secondary/50">
          <MapPinned className="h-4 w-4" />
          إرسال الموقع من الخريطة (اختياري)
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]" dir="rtl">
        <DialogHeader>
          <DialogTitle>تحديد موقع التوصيل</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            انقر على الخريطة لتحديد موقعك بدقة، أو استخدم زر "موقعي الحالي".
          </div>
          <div className="h-[300px] w-full rounded-md overflow-hidden border z-10 relative">
            <MapContainer center={defaultCenter} zoom={13} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <LocationMarker position={position} setPosition={setPosition} />
            </MapContainer>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleGetLocation} className="gap-2 flex-1">
              <MapPin className="h-4 w-4" />
              موقعي الحالي
            </Button>
            <Button onClick={handleConfirm} disabled={!position} className="flex-1">
              تأكيد الموقع
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

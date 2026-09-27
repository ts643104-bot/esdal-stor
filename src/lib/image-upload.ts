const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export async function uploadImage(file: Blob, filename = "image.jpg"): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("اختر ملف صورة صالحًا");
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("يجب ألا يتجاوز حجم الصورة 3 ميجابايت");
  }

  const imageData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("تعذرت قراءة ملف الصورة"));
    };
    reader.onerror = () => reject(new Error("تعذرت قراءة ملف الصورة"));
    reader.readAsDataURL(file);
  });

  if (import.meta.env.DEV && import.meta.env.VITE_IMGBB_API_KEY) {
    const formData = new FormData();
    formData.append("image", file, filename);
    const directUpload = new URL("https://api.imgbb.com/1/upload");
    directUpload.searchParams.set("key", import.meta.env.VITE_IMGBB_API_KEY);
    const directResponse = await fetch(directUpload, { method: "POST", body: formData });
    const directResult = await directResponse.json().catch(() => null);
    if (!directResponse.ok || typeof directResult?.data?.url !== "string") {
      throw new Error(directResult?.error?.message || "فشل رفع الصورة");
    }
    return directResult.data.url;
  }

  const response = await fetch("/api/image-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageData, filename }),
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || typeof result?.imageUrl !== "string") {
    throw new Error(result?.error || "فشل رفع الصورة");
  }

  return result.imageUrl;
}

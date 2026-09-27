const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body);

  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      const error = new Error("حجم الطلب أكبر من المسموح");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "الطريقة غير مدعومة" });
  }

  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    return response.status(503).json({ error: "خدمة رفع الصور غير مهيأة" });
  }

  try {
    const contentLength = Number(request.headers["content-length"] || 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      return response.status(413).json({ error: "حجم الطلب أكبر من المسموح" });
    }

    const body = await readJsonBody(request);
    const match = typeof body.image === "string"
      ? body.image.match(/^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/)
      : null;

    if (!match) {
      return response.status(400).json({ error: "صيغة الصورة غير صالحة" });
    }

    const [, imageType, base64Image] = match;
    const imageBytes = Buffer.from(base64Image, "base64");
    if (!imageBytes.length || imageBytes.length > MAX_IMAGE_BYTES) {
      return response.status(413).json({ error: "حجم الصورة أكبر من 3 ميجابايت" });
    }

    const formData = new FormData();
    const extension = imageType === "jpeg" ? "jpg" : imageType;
    const filename = typeof body.filename === "string"
      ? body.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100)
      : `image.${extension}`;
    formData.append("image", new Blob([imageBytes], { type: `image/${imageType}` }), filename || `image.${extension}`);

    const uploadUrl = new URL("https://api.imgbb.com/1/upload");
    uploadUrl.searchParams.set("key", apiKey);
    const uploadResponse = await fetch(uploadUrl, { method: "POST", body: formData });
    const uploadResult = await uploadResponse.json();
    const imageUrl = uploadResult.data?.url;
    const parsedImageUrl = typeof imageUrl === "string" ? new URL(imageUrl) : null;

    if (
      !uploadResponse.ok ||
      !uploadResult.success ||
      parsedImageUrl?.protocol !== "https:" ||
      !(parsedImageUrl.hostname === "ibb.co" || parsedImageUrl.hostname.endsWith(".ibb.co"))
    ) {
      console.error("ImgBB upload failed:", uploadResult.error?.message || uploadResponse.status);
      return response.status(502).json({ error: "تعذر رفع الصورة، حاول مرة أخرى" });
    }

    return response.status(200).json({ imageUrl });
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 400;
    if (statusCode >= 500) console.error("Image upload request failed:", error.message);
    return response.status(statusCode).json({ error: statusCode === 413 ? error.message : "تعذر معالجة الصورة" });
  }
}

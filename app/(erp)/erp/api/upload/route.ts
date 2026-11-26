import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { handler } from "@/lib/erp-comercial/api";

const PERMITIDOS = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".3gp", ".pdf"];

export const POST = handler(async (req: Request) => {
  const form = await req.formData();
  const files = form.getAll("files") as File[];
  if (!files.length) throw new Error("No se recibieron archivos");
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const urls: string[] = [];
  for (const f of files) {
    const ext = path.extname(f.name).toLowerCase();
    if (!PERMITIDOS.includes(ext)) throw new Error(`Formato no permitido: ${ext}`);
    if (f.size > 16 * 1024 * 1024) throw new Error("Maximo 16 MB por archivo (limite WhatsApp)");
    const nombre = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    await writeFile(path.join(dir, nombre), Buffer.from(await f.arrayBuffer()));
    urls.push(`/uploads/${nombre}`);
  }
  return { urls };
});

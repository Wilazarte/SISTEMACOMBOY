import type { MetadataRoute } from "next";

/** ERP privado: ningún buscador debe rastrearlo. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}

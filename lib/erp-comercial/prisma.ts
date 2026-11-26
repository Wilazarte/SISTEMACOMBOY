import { PrismaClient } from "@prisma/client";
// @ts-expect-error modulo JS compartido con scripts/vercel-build.mjs
import { limpiarDatabaseUrl } from "./db-url.mjs";

const url = limpiarDatabaseUrl(process.env.DATABASE_URL);
if (url) process.env.DATABASE_URL = url;

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient(url ? { datasourceUrl: url } : undefined);
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

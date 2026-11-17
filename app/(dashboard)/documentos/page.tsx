import { GestionDocumental } from "@/components/documentos/GestionDocumental";

/**
 * Gestión Documentaria auditada (Williams, 2026-11-17): módulo independiente con tablas propias
 * (SQL 20261204_gestion_documentaria.sql) y Edge Function gestion-documental. Entra cualquier usuario
 * con perfil; cada uno ve solo los documentos propios o con permiso explícito (lo decide la base).
 */
export default function DocumentosPage() {
  return <GestionDocumental />;
}

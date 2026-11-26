"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, Tags, Users, KanbanSquare, FileText, Swords, MessageCircle, Send, Megaphone,
  FileStack, Bot, Zap, BookOpen, LogOut,
} from "lucide-react";
import { cn } from "@/lib/erp-comercial/utils";
import { logout } from "@/lib/auth";

// Paginas publicas sin menu del ERP Comercial
const SIN_MENU = ["/erp/privacidad"];
const INICIO = "/erp/comercial";

// Sesion unica: la de SISTEMACOMBOY (Supabase)
async function cerrarSesion() {
  await logout().catch(() => null);
  window.location.href = "/login";
}

const grupos = [
  {
    titulo: "Comercial",
    items: [
      { href: INICIO, label: "Dashboard", icon: LayoutDashboard },
      { href: "/erp/equipos", label: "Equipos", icon: Package },
      { href: "/erp/fichas", label: "Fichas", icon: BookOpen },
      { href: "/erp/precios", label: "Precios", icon: Tags },
      { href: "/erp/cotizaciones", label: "Cotizaciones", icon: FileText },
      { href: "/erp/competencia", label: "Competencia", icon: Swords },
    ],
  },
  {
    titulo: "CRM",
    items: [
      { href: "/erp/clientes", label: "Clientes", icon: Users },
      { href: "/erp/crm", label: "Pipeline Kanban", icon: KanbanSquare },
    ],
  },
  {
    titulo: "WhatsApp",
    items: [
      { href: "/erp/whatsapp", label: "Bandeja de chats", icon: MessageCircle },
      { href: "/erp/whatsapp/ofertas", label: "Enviar ofertas", icon: Send },
      { href: "/erp/whatsapp/campanas", label: "Campañas masivas", icon: Megaphone },
      { href: "/erp/whatsapp/plantillas", label: "Plantillas", icon: FileStack },
      { href: "/erp/automatizaciones", label: "Automatizaciones", icon: Bot },
    ],
  },
];

export function Sidebar({ waConectado, noLeidos }: { waConectado: boolean; noLeidos: number }) {
  const path = usePathname();
  const activo = (href: string) => (href === INICIO ? path === INICIO : href === "/erp/whatsapp" ? path === "/erp/whatsapp" : path.startsWith(href));
  if (SIN_MENU.includes(path)) return null;
  return (
    <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card/60 backdrop-blur md:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 shadow-lg shadow-blue-500/30">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-bold tracking-wide">COMBOY</div>
          <div className="text-[11px] text-muted-foreground">ERP Comercial</div>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {grupos.map((g) => (
          <div key={g.titulo}>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">{g.titulo}</div>
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    activo(it.href) && "bg-primary/10 font-medium text-primary hover:bg-primary/15 hover:text-primary",
                  )}
                >
                  <it.icon className="h-4 w-4" />
                  <span className="flex-1">{it.label}</span>
                  {it.href === "/erp/whatsapp" && noLeidos > 0 && (
                    <span className="rounded-full bg-wa px-1.5 text-[10px] font-bold text-black">{noLeidos}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t p-4">
        <div className="flex items-center gap-2 text-xs">
          <span className={cn("h-2 w-2 rounded-full", waConectado ? "bg-wa shadow-[0_0_8px] shadow-wa" : "bg-amber-400")} />
          <span className="text-muted-foreground">{waConectado ? "WhatsApp Cloud API conectada" : "WhatsApp: modo simulación"}</span>
        </div>
        <button
          onClick={cerrarSesion}
          className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const path = usePathname();
  const items = grupos.flatMap((g) => g.items);
  if (SIN_MENU.includes(path)) return null;
  return (
    <nav className="no-print flex gap-1 overflow-x-auto border-b bg-card/80 px-3 py-2 md:hidden">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={cn("flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground", path === it.href && "bg-primary/10 text-primary")}
        >
          <it.icon className="h-3.5 w-3.5" />
          {it.label}
        </Link>
      ))}
      <button onClick={cerrarSesion} className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground">
        <LogOut className="h-3.5 w-3.5" />
        Salir
      </button>
    </nav>
  );
}

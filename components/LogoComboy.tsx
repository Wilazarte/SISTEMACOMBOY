import Image from "next/image";

const TAMANOS = {
  sm: { w: 220, h: 70, cls: "h-[70px] w-[220px]" },
  md: { w: 340, h: 110, cls: "h-[110px] w-[340px]" },
  lg: { w: 500, h: 160, cls: "h-[160px] w-[500px]" },
} as const;

/** Logo COMBOY VID SOLUCIONES MINERAS transparente (/logo.png), el mismo del login del ERP. */
export function LogoComboy({ size = "md", className = "" }: { size?: keyof typeof TAMANOS; className?: string }) {
  const t = TAMANOS[size];
  return (
    <Image
      src="/logo.png"
      alt="COMBOY VID Soluciones Mineras"
      width={t.w}
      height={t.h}
      priority
      className={`${t.cls} max-w-full object-contain drop-shadow-[0_0_18px_rgba(0,0,0,0.6)] ${className}`}
    />
  );
}

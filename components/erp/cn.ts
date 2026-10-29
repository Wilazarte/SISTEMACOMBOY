/** Une clases (igual que cn de components/ui, sin importar ese archivo: ui re-exporta ErpTable). */
export const cn = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(" ");

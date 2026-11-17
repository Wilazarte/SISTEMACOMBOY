// =====================================================================
// Categorías de los productos del catálogo maestro (productos_maestro.categoria).
// La lista vive en Supabase (tabla productos_categorias: editable por el administrador);
// CATEGORIAS_BASE es la lista inicial y la que se usa mientras no se corra
// supabase/migrations/20261203_categorias_productos.sql (misma lista y mismas palabras clave).
// Sin "use client": solo datos y funciones puras.
// =====================================================================

export interface CategoriaProducto {
  id?: string;
  nombre: string;
  descripcion?: string | null;
  /** Palabras clave (MAYÚSCULAS, sin tildes) para sugerir la categoría por el nombre del producto. */
  palabras: string[];
  orden: number;
  activo: boolean;
}

/** Valor del filtro "Sin categoría". */
export const SIN_CATEGORIA = "__SIN__";

const c = (orden: number, nombre: string, descripcion: string, palabras: string): CategoriaProducto => ({
  nombre,
  descripcion,
  palabras: palabras.split(",").map((p) => p.trim()).filter(Boolean),
  orden,
  activo: true,
});

export const CATEGORIAS_BASE: CategoriaProducto[] = [
  c(10, "Repuestos", "Repuestos de equipos y vehículos", "REPUESTO,BUJIA,FAJA,CORREA,EMPAQUE,EMPAQUETADURA,PASTILLA DE FRENO,ZAPATA,DISCO DE FRENO,AMORTIGUADOR,MUELLE,RESORTE,BOMBA,ALTERNADOR,ARRANCADOR,RADIADOR,EMBRAGUE,CRUCETA,ROTULA,CARBURADOR,INYECTOR,PISTON,PIÑON,PINON,CATALINA,CADENA DE TRANSMISION,ESPEJO,BOCAMASA,TAMBOR,CAJA DE CAMBIOS,CORONA,DIFERENCIAL,PALIER,TERMINAL DE DIRECCION,SOPORTE DE MOTOR,KIT DE ARRASTRE,KIT DE REPARACION"),
  c(20, "Equipos", "Equipos y maquinaria", "REMOLCADOR,ECO MINE,LOCOMOTORA,WINCHE,CARRO MINERO,MOTOCARGUERO,COMPRESORA,COMPRESOR,GENERADOR,GRUPO ELECTROGENO,ELECTROBOMBA,MOTOBOMBA,MOTOR,MAQUINA DE SOLDAR,SOLDADORA,TORNO,EQUIPO"),
  c(30, "Herramientas", "Herramientas manuales y eléctricas", "HERRAMIENTA,LLAVE,ALICATE,DESARMADOR,DESTORNILLADOR,MARTILLO,COMBA,TALADRO,AMOLADORA,ESMERIL,BROCA,DADO,RACHE,RATCHET,SIERRA,ARCO DE SIERRA,HOJA DE SIERRA,LIMA,CINCEL,PRENSA,TORNILLO DE BANCO,GATA,TECLE,EXTRACTOR,MACHO,TARRAJA,NIVEL,ESCUADRA,REMACHADORA,PISTOLA,CIZALLA,CARRETILLA,PALA,PICO,BARRETA,ESCALERA,TIJERA,CUTER,CUCHILLA,ESPATULA,PUNZON,ENGRASADORA,JUEGO DE LLAVES,JUEGO DE DADOS"),
  c(40, "Insumos de soldadura", "Electrodos, alambres y consumibles de soldar", "SOLDADURA,ELECTRODO,ALAMBRE MIG,ALAMBRE TUBULAR,ALAMBRE DE SOLDAR,VARILLA DE APORTE,BOQUILLA,TOBERA,DIFUSOR,PUNTA DE CONTACTO,TIP DE CONTACTO,ANTORCHA,PORTAELECTRODO,PORTA ELECTRODO,PINZA DE TIERRA,FUNDENTE,CELLOCORD,SUPERCITO,CHAMFERCORD,TUNGSTENO,LINER,ANTISALPICADURA,ANTI SALPICADURA,MIG,TIG"),
  c(50, "Pernocentro", "Pernos, tuercas, arandelas y fijaciones", "PERNO,TUERCA,ARANDELA,ESPARRAGO,TORNILLO,AUTOPERFORANTE,PRISIONERO,ANILLO DE PRESION,VOLANDA,REMACHE,CHAVETA,PASADOR,TIRAFON,HUACHA,SEGURO SEEGER,STOVE BOLT"),
  c(60, "Pintura", "Pinturas, bases, disolventes y accesorios", "PINTURA,ESMALTE,THINNER,TINER,ANTICORROSIVO,ANTICORROSIVA,BARNIZ,LACA,MASILLA,BROCHA,RODILLO,SPRAY,AEROSOL,DILUYENTE,TEMPLE,IMPRIMANTE,SELLADOR,EPOXICA,EPOXICO,CATALIZADOR,PRIMER,WASH PRIMER,CINTA MASKING,MASKING,ZINCROMATO,GLOSS"),
  c(70, "Combustibles", "Gasolina, petróleo y otros combustibles", "COMBUSTIBLE,GASOLINA,GASOHOL,PETROLEO,DIESEL,DB5,GLP,KEROSENE"),
  c(80, "Lubricantes y grasas", "Aceites, grasas, refrigerantes y aditivos", "ACEITE,GRASA,LUBRICANTE,REFRIGERANTE,LIQUIDO DE FRENO,LIQUIDO DE FRENOS,HIDROLINA,WD40,WD 40,AFLOJATODO,ADITIVO"),
  c(90, "EPP", "Equipos de protección personal", "EPP,GUANTE,CASCO,LENTE,RESPIRADOR,MASCARILLA,BOTA,BOTIN,ZAPATO,CHALECO,MAMELUCO,OVEROL,TAPON,TAPON DE OIDO,OREJERA,ARNES,LINEA DE VIDA,CARETA,MANDIL,ESCARPIN,MANGA DE CUERO,BARBIQUEJO,CORTAVIENTO,UNIFORME,POLO,PANTALON,CASACA,FILTRO PARA RESPIRADOR,CARTUCHO PARA RESPIRADOR,TRAJE TYVEK,RODILLERA"),
  c(100, "Neumáticos", "Llantas, cámaras y aros", "NEUMATICO,LLANTA,CAMARA,ARO,PARCHE,VALVULA DE LLANTA,PITON"),
  c(110, "Oficina", "Útiles y equipos de oficina", "PAPEL,PAPEL BOND,LAPICERO,LAPIZ,FOLDER,ARCHIVADOR,TONER,TINTA,CUADERNO,ENGRAPADOR,GRAPA,PERFORADOR,RESALTADOR,PLUMON,SOBRE,CLIP,CORRECTOR,TAMPON PARA SELLO,SELLO,IMPRESORA,MOUSE,TECLADO,USB,POST IT,BORRADOR,TAJADOR,FILE,MICA"),
  c(120, "Piezas torneadas", "Piezas fabricadas en torno o maquinadas", "TORNEADO,TORNEADA,BOCINA,BUJE,BRIDA,PIN,MAQUINADO,MAQUINADA,FRESADO,FRESADA,MECANIZADO,MECANIZADA,CASQUILLO,POLEA"),
  c(130, "Aceros y perfiles", "Planchas, tubos, ángulos, platinas y barras", "PLANCHA,TUBO,ANGULO,PLATINA,VIGA,CANAL U,PERFIL,FIERRO,BARRA,VARILLA,ACERO,PLATABANDA,MALLA,LAMINA,CALAMINA,ALUMINIO,BRONCE"),
  c(140, "Abrasivos y corte", "Discos, lijas y escobillas", "ABRASIVO,DISCO,LIJA,PIEDRA DE ESMERIL,PIEDRA ESMERIL,ESCOBILLA DE ACERO,ESCOBILLA CIRCULAR,ESCOBILLA DE COPA,FLAP,GRATA,POLIFAN,PASTA DE PULIR"),
  c(150, "Eléctricos y electrónicos", "Cables, baterías, luces y control", "CABLE,BATERIA,FOCO,FARO,FUSIBLE,INTERRUPTOR,ENCHUFE,TOMACORRIENTE,CONTACTOR,RELAY,RELE,TERMINAL,CINTA AISLANTE,LLAVE TERMICA,LLAVE TERMOMAGNETICA,TERMOMAGNETICO,BREAKER,LED,LUMINARIA,REFLECTOR,FLUORESCENTE,SENSOR,CONTROLADOR,CARGADOR,INVERSOR,PULSADOR,BORNE,CONECTOR,EXTENSION,SIRENA,CIRCULINA,ALARMA,CLAXON,PILA,TABLERO,MOTOR ELECTRICO"),
  c(160, "Hidráulica y neumática", "Mangueras, válvulas, cilindros y conexiones", "MANGUERA,CILINDRO HIDRAULICO,BOMBA HIDRAULICA,VALVULA,ACOPLE,NIPLE,RACOR,CONEXION,UNION,CODO,ORING,O RING,FERRUL,ADAPTADOR,REDUCCION"),
  c(170, "Rodamientos y retenes", "Rodajes, retenes y chumaceras", "RODAMIENTO,RODAJE,RETEN,CHUMACERA,COJINETE"),
  c(180, "Filtros", "Filtros de aire, aceite, combustible e hidráulicos", "FILTRO"),
  c(190, "Ferretería general", "Materiales varios de ferretería", "ALAMBRE,CLAVO,SOGA,CADENA,CANDADO,BISAGRA,SILICONA,PEGAMENTO,TEFLON,CINTA TEFLON,ABRAZADERA,CEMENTO,ARENA,TARUGO,CINTILLO,PRECINTO,CERRADURA,PICAPORTE,CINTA,PLASTICO,MANTA,LONA,TRIPLAY,MADERA,CAUCHO,JEBE,SIKA,SOLDIMIX"),
  c(200, "Limpieza", "Artículos de limpieza", "DETERGENTE,LEJIA,ESCOBA,TRAPO,TRAPEADOR,WAYPE,WAIPE,JABON,DESINFECTANTE,DESENGRASANTE,RECOGEDOR,BOLSA DE BASURA,PAPEL HIGIENICO,PAPEL TOALLA,AMBIENTADOR,ESPONJA,FRANELA,ALCOHOL"),
  c(210, "Seguridad y señalización", "Extintores, conos, señales y botiquín", "EXTINTOR,CONO,CINTA DE SEGURIDAD,CINTA REFLECTIVA,CINTA DE SEÑALIZACION,CINTA DE SENALIZACION,SEÑAL,SENAL,SEÑALETICA,SENALETICA,LETRERO,BOTIQUIN,MALLA DE SEGURIDAD,TRANQUERA,CANDADO DE BLOQUEO,TARJETA DE BLOQUEO"),
  c(220, "Gases industriales", "Oxígeno, argón, CO2 y acetileno", "OXIGENO,ARGON,CO2,ACETILENO,NITROGENO,MEZCLA ARGON,BALON DE GAS,GAS"),
  c(230, "Instrumentos de medición", "Vernier, multímetros, manómetros y balanzas", "VERNIER,CALIBRADOR,MICROMETRO,MULTIMETRO,PINZA AMPERIMETRICA,TERMOMETRO,MANOMETRO,FLEXOMETRO,WINCHA,BALANZA,RELOJ COMPARADOR,GALGA,TORQUIMETRO"),
  c(240, "Embalaje", "Material para embalar y despachar", "STRETCH FILM,FILM,CARTON,CAJA,ZUNCHO,BOLSA,CINTA DE EMBALAJE,BURBUPACK,PALLET,PARIHUELA"),
  c(990, "Otros", "Lo que no entra en ninguna otra categoría", ""),
];

/** MAYÚSCULAS sin tildes y con todo lo que no es letra o número como espacio (igual que public.categoria_texto()). */
export function textoCategoria(t: string): string {
  return (t ?? "")
    .toUpperCase()
    .replace(/Ñ/g, "N")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Categoría sugerida por el nombre: gana la palabra clave que aparece primero en el nombre
 * ("ACEITE HIDRAULICO" -> Lubricantes, "FILTRO DE ACEITE" -> Filtros); si empatan, la más larga
 * ("DISCO DE FRENO" antes que "DISCO") y luego el orden de la categoría.
 * Palabra entera, también en plural (PERNO / PERNOS, ARNES / ARNESES).
 * Misma regla que public.categoria_sugerida() en Supabase.
 */
export function sugerirCategoria(nombre: string, categorias: CategoriaProducto[] = CATEGORIAS_BASE): string | null {
  const n = ` ${textoCategoria(nombre)} `;
  if (n.trim() === "") return null;
  let mejor: { nombre: string; pos: number; largo: number; orden: number } | null = null;
  for (const cat of categorias) {
    if (!cat.activo) continue;
    for (const palabra of cat.palabras ?? []) {
      const p = textoCategoria(palabra);
      if (!p) continue;
      const pos = [` ${p} `, ` ${p}S `, ` ${p}ES `].map((x) => n.indexOf(x)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
      if (pos === undefined) continue;
      if (!mejor || pos < mejor.pos || (pos === mejor.pos && (p.length > mejor.largo || (p.length === mejor.largo && cat.orden < mejor.orden)))) mejor = { nombre: cat.nombre, pos, largo: p.length, orden: cat.orden };
    }
  }
  return mejor?.nombre ?? null;
}

/** Nombre oficial de una categoría escrita a mano ("repuesto", "REPUESTOS " -> "Repuestos"); si no coincide, null. */
export function categoriaOficial(texto: string | null | undefined, categorias: CategoriaProducto[]): string | null {
  const t = textoCategoria(texto ?? "");
  if (!t) return null;
  const formas = (x: string) => [x, `${x}S`, `${x}ES`, x.replace(/E?S$/, "")];
  return categorias.find((x) => formas(textoCategoria(x.nombre)).some((f) => formas(t).includes(f)))?.nombre ?? null;
}

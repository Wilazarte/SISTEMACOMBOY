-- CreateTable
CREATE TABLE "Vendedor" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "fichaTecnica" TEXT NOT NULL DEFAULT '{}',
    "fotos" TEXT NOT NULL DEFAULT '[]',
    "videoUrl" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "costoBase" DOUBLE PRECISION NOT NULL,
    "precioLista" DOUBLE PRECISION NOT NULL,
    "intervaloMantenimientoMeses" INTEGER NOT NULL DEFAULT 3,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaPrecio" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "equipoId" TEXT,
    "tipoCliente" TEXT,
    "region" TEXT,
    "minCantidad" INTEGER,
    "maxCantidad" INTEGER,
    "porcentaje" DOUBLE PRECISION NOT NULL,
    "descripcion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReglaPrecio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL DEFAULT 'RUC',
    "documento" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "contacto" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "email" TEXT,
    "direccion" TEXT,
    "region" TEXT NOT NULL,
    "tipoCliente" TEXT NOT NULL,
    "vendedorId" TEXT,
    "limiteCredito" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditoUsado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diasCredito" INTEGER NOT NULL DEFAULT 0,
    "etapa" TEXT NOT NULL DEFAULT 'PROSPECTO',
    "ultimoContacto" TIMESTAMP(3),
    "proximoContacto" TIMESTAMP(3),
    "fechaGanado" TIMESTAMP(3),
    "encuestaEnviada" BOOLEAN NOT NULL DEFAULT false,
    "optIn" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nota" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Nota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cotizacion" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "clienteId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotizacionItem" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "equipoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioLista" DOUBLE PRECISION NOT NULL,
    "precioUnitario" DOUBLE PRECISION NOT NULL,
    "costoUnitario" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CotizacionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "cotizacionId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" DOUBLE PRECISION NOT NULL,
    "costo" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentaItem" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "equipoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" DOUBLE PRECISION NOT NULL,
    "costoUnitario" DOUBLE PRECISION NOT NULL,
    "intervaloMantenimientoMeses" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "VentaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mantenimiento" (
    "id" TEXT NOT NULL,
    "ventaItemId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "equipoId" TEXT NOT NULL,
    "fechaProgramada" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "notificadoAt" TIMESTAMP(3),
    "completadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tarea" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fechaVence" TIMESTAMP(3) NOT NULL,
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tarea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competidor" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "web" TEXT,
    "pais" TEXT,
    "fortalezas" TEXT NOT NULL DEFAULT '',
    "debilidades" TEXT NOT NULL DEFAULT '',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competidor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoCompetencia" (
    "id" TEXT NOT NULL,
    "competidorId" TEXT NOT NULL,
    "equipoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "fichaTecnica" TEXT NOT NULL DEFAULT '{}',
    "fortalezas" TEXT NOT NULL DEFAULT '',
    "debilidades" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductoCompetencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plantilla" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "metaTemplateName" TEXT,
    "idioma" TEXT NOT NULL DEFAULT 'es',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plantilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensaje" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'text',
    "contenido" TEXT NOT NULL DEFAULT '',
    "mediaUrl" TEXT,
    "mediaNombre" TEXT,
    "waMessageId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "error" TEXT,
    "leido" BOOLEAN NOT NULL DEFAULT false,
    "origen" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campana" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "plantillaId" TEXT,
    "mensaje" TEXT NOT NULL,
    "equipoId" TEXT,
    "adjuntarFoto" BOOLEAN NOT NULL DEFAULT false,
    "adjuntarPdf" BOOLEAN NOT NULL DEFAULT false,
    "adjuntarVideo" BOOLEAN NOT NULL DEFAULT false,
    "filtroRegion" TEXT,
    "filtroTipoCliente" TEXT,
    "filtroEtapa" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campana_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampanaEnvio" (
    "id" TEXT NOT NULL,
    "campanaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "mensajeId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "error" TEXT,
    "enviadoAt" TIMESTAMP(3),

    CONSTRAINT "CampanaEnvio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracion" (
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "AutomatizacionLog" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomatizacionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostoProduccion" (
    "id" TEXT NOT NULL,
    "equipoId" TEXT NOT NULL,
    "diasFabricacion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostoProduccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "costoProduccionId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "nombre" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "unidad" TEXT NOT NULL,
    "costoUnitario" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManoObra" (
    "id" TEXT NOT NULL,
    "costoProduccionId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "rol" TEXT NOT NULL,
    "horas" DOUBLE PRECISION NOT NULL,
    "costoHora" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ManoObra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Servicio" (
    "id" TEXT NOT NULL,
    "costoProduccionId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "nombre" TEXT NOT NULL,
    "costoMensual" DOUBLE PRECISION NOT NULL,
    "diasFabricacion" DOUBLE PRECISION NOT NULL,
    "prorrateo" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Servicio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendedor_email_key" ON "Vendedor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Equipo_codigo_key" ON "Equipo"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_documento_key" ON "Cliente"("documento");

-- CreateIndex
CREATE UNIQUE INDEX "Cotizacion_numero_key" ON "Cotizacion"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_cotizacionId_key" ON "Venta"("cotizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Plantilla_nombre_key" ON "Plantilla"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Mensaje_waMessageId_key" ON "Mensaje"("waMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "CampanaEnvio_mensajeId_key" ON "CampanaEnvio"("mensajeId");

-- CreateIndex
CREATE UNIQUE INDEX "CampanaEnvio_campanaId_clienteId_key" ON "CampanaEnvio"("campanaId", "clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "CostoProduccion_equipoId_key" ON "CostoProduccion"("equipoId");

-- CreateIndex
CREATE INDEX "Material_costoProduccionId_idx" ON "Material"("costoProduccionId");

-- CreateIndex
CREATE INDEX "ManoObra_costoProduccionId_idx" ON "ManoObra"("costoProduccionId");

-- CreateIndex
CREATE INDEX "Servicio_costoProduccionId_idx" ON "Servicio"("costoProduccionId");

-- AddForeignKey
ALTER TABLE "ReglaPrecio" ADD CONSTRAINT "ReglaPrecio_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "Equipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionItem" ADD CONSTRAINT "CotizacionItem_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionItem" ADD CONSTRAINT "CotizacionItem_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "Equipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaItem" ADD CONSTRAINT "VentaItem_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaItem" ADD CONSTRAINT "VentaItem_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "Equipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mantenimiento" ADD CONSTRAINT "Mantenimiento_ventaItemId_fkey" FOREIGN KEY ("ventaItemId") REFERENCES "VentaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mantenimiento" ADD CONSTRAINT "Mantenimiento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mantenimiento" ADD CONSTRAINT "Mantenimiento_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "Equipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoCompetencia" ADD CONSTRAINT "ProductoCompetencia_competidorId_fkey" FOREIGN KEY ("competidorId") REFERENCES "Competidor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoCompetencia" ADD CONSTRAINT "ProductoCompetencia_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "Equipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensaje" ADD CONSTRAINT "Mensaje_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campana" ADD CONSTRAINT "Campana_plantillaId_fkey" FOREIGN KEY ("plantillaId") REFERENCES "Plantilla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campana" ADD CONSTRAINT "Campana_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "Equipo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampanaEnvio" ADD CONSTRAINT "CampanaEnvio_campanaId_fkey" FOREIGN KEY ("campanaId") REFERENCES "Campana"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampanaEnvio" ADD CONSTRAINT "CampanaEnvio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampanaEnvio" ADD CONSTRAINT "CampanaEnvio_mensajeId_fkey" FOREIGN KEY ("mensajeId") REFERENCES "Mensaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostoProduccion" ADD CONSTRAINT "CostoProduccion_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "Equipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_costoProduccionId_fkey" FOREIGN KEY ("costoProduccionId") REFERENCES "CostoProduccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManoObra" ADD CONSTRAINT "ManoObra_costoProduccionId_fkey" FOREIGN KEY ("costoProduccionId") REFERENCES "CostoProduccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Servicio" ADD CONSTRAINT "Servicio_costoProduccionId_fkey" FOREIGN KEY ("costoProduccionId") REFERENCES "CostoProduccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "EstadoCotizacionComercial" AS ENUM ('NUEVA', 'CONTACTADA', 'GANADA', 'PERDIDA');

-- CreateTable
CREATE TABLE "CotizacionComercial" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "conjuntos" JSONB NOT NULL DEFAULT '[]',
    "precioUnitario" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "descuentoPct" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "descuento" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT,
    "empresa" TEXT,
    "nit" TEXT,
    "email" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "ciudad" TEXT,
    "mensaje" TEXT,
    "estado" "EstadoCotizacionComercial" NOT NULL DEFAULT 'NUEVA',
    "notas" TEXT,
    "origen" TEXT,
    "ip" TEXT,
    "validaHasta" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CotizacionComercial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CotizacionComercial_numero_key" ON "CotizacionComercial"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "CotizacionComercial_token_key" ON "CotizacionComercial"("token");

-- CreateIndex
CREATE INDEX "CotizacionComercial_estado_idx" ON "CotizacionComercial"("estado");

-- CreateIndex
CREATE INDEX "CotizacionComercial_createdAt_idx" ON "CotizacionComercial"("createdAt");

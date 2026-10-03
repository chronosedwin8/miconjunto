-- CreateEnum
CREATE TYPE "CategoriaObjeto" AS ENUM ('LLAVES', 'DOCUMENTOS', 'BILLETERA', 'CELULAR', 'ELECTRONICO', 'ROPA', 'JUGUETE', 'MASCOTA', 'BICICLETA', 'JOYA', 'GAFAS', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoReclamoObjeto" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoObjetoPerdido" ADD VALUE 'EN_CUSTODIA';
ALTER TYPE "EstadoObjetoPerdido" ADD VALUE 'RECLAMADO';
ALTER TYPE "EstadoObjetoPerdido" ADD VALUE 'DONADO';

-- AlterTable
ALTER TABLE "Invitacion" ADD COLUMN     "capacidadesHogar" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "derivadoDeId" TEXT;

-- AlterTable
ALTER TABLE "ObjetoPerdido" ADD COLUMN     "categoria" "CategoriaObjeto" NOT NULL DEFAULT 'OTRO',
ADD COLUMN     "codigo" TEXT,
ADD COLUMN     "coincideConId" TEXT,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "custodia" TEXT,
ADD COLUMN     "disposicion" TEXT,
ADD COLUMN     "entregadoDocumento" TEXT,
ADD COLUMN     "entregadoEn" TIMESTAMP(3),
ADD COLUMN     "entregadoPorId" TEXT,
ADD COLUMN     "firmaUrl" TEXT,
ADD COLUMN     "fotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "marca" TEXT,
ADD COLUMN     "rasgosPrivados" TEXT,
ADD COLUMN     "recibidoEn" TIMESTAMP(3),
ADD COLUMN     "recibidoPorId" TEXT,
ADD COLUMN     "recompensa" TEXT,
ADD COLUMN     "titulo" TEXT,
ADD COLUMN     "unidadId" TEXT,
ADD COLUMN     "venceEn" TIMESTAMP(3),
ADD COLUMN     "zonaId" TEXT;

-- AlterTable
ALTER TABLE "VinculoUnidad" ADD COLUMN     "accesoPausado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "capacidadesHogar" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "derivadoDeId" TEXT;

-- CreateTable
CREATE TABLE "ReclamoObjeto" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "objetoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "unidadId" TEXT,
    "descripcion" TEXT NOT NULL,
    "estado" "EstadoReclamoObjeto" NOT NULL DEFAULT 'PENDIENTE',
    "respuesta" TEXT,
    "resueltoPorId" TEXT,
    "resueltoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReclamoObjeto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReclamoObjeto_conjuntoId_idx" ON "ReclamoObjeto"("conjuntoId");

-- CreateIndex
CREATE INDEX "ReclamoObjeto_objetoId_idx" ON "ReclamoObjeto"("objetoId");

-- CreateIndex
CREATE INDEX "ObjetoPerdido_conjuntoId_estado_idx" ON "ObjetoPerdido"("conjuntoId", "estado");

-- CreateIndex
CREATE INDEX "VinculoUnidad_derivadoDeId_idx" ON "VinculoUnidad"("derivadoDeId");

-- AddForeignKey
ALTER TABLE "VinculoUnidad" ADD CONSTRAINT "VinculoUnidad_derivadoDeId_fkey" FOREIGN KEY ("derivadoDeId") REFERENCES "VinculoUnidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReclamoObjeto" ADD CONSTRAINT "ReclamoObjeto_objetoId_fkey" FOREIGN KEY ("objetoId") REFERENCES "ObjetoPerdido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

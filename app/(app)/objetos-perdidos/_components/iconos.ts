import { Bike, Gem, Glasses, Headphones, IdCard, KeyRound, Package, PawPrint, Shirt, Smartphone, ToyBrick, Wallet, type LucideIcon } from "lucide-react";
import type { CategoriaObjeto } from "@prisma/client";

/** Ícono por categoría de objeto (compartido entre componentes de servidor y cliente). */
export const ICONO_CATEGORIA: Record<CategoriaObjeto, LucideIcon> = {
  LLAVES: KeyRound,
  DOCUMENTOS: IdCard,
  BILLETERA: Wallet,
  CELULAR: Smartphone,
  ELECTRONICO: Headphones,
  ROPA: Shirt,
  JUGUETE: ToyBrick,
  MASCOTA: PawPrint,
  BICICLETA: Bike,
  JOYA: Gem,
  GAFAS: Glasses,
  OTRO: Package,
};

import "next-auth";

declare module "next-auth" {
  interface Session {
    conjuntoId: string | null;
    rol: string | null;
    sv: number;
    superAdmin: boolean;
    impersonadoPor: string | null;
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

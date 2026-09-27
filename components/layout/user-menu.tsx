"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { LogOut, Moon, Sun, User, Building2, Type, ShieldCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction, toggleTextoGrandeAction } from "@/app/(auth)/actions";

export function UserMenu({
  nombre,
  email,
  rolNombre,
  multiConjunto,
  esSuperAdmin,
  textoGrande,
}: {
  nombre: string;
  email: string;
  rolNombre: string;
  multiConjunto: boolean;
  esSuperAdmin: boolean;
  textoGrande: boolean;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const initials = nombre
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="grid size-10 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Menú de usuario"
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
        <DropdownMenuLabel>
          <p className="truncate text-sm font-semibold text-foreground">{nombre}</p>
          <p className="truncate text-xs font-normal">{email}</p>
          <p className="text-xs font-normal">{rolNombre}</p>
        </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/perfil" />}>
          <User /> Mi perfil y privacidad
        </DropdownMenuItem>
        {(multiConjunto || esSuperAdmin) && (
          <DropdownMenuItem render={<Link href="/seleccionar-conjunto" />}>
            <Building2 /> Cambiar de conjunto
          </DropdownMenuItem>
        )}
        {esSuperAdmin && (
          <DropdownMenuItem render={<Link href="/superadmin" />}>
            <ShieldCheck /> Panel SuperAdmin
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          {resolvedTheme === "dark" ? <Sun /> : <Moon />} Tema {resolvedTheme === "dark" ? "claro" : "oscuro"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await toggleTextoGrandeAction();
            router.refresh();
          }}
        >
          <Type /> {textoGrande ? "Texto normal" : "Texto grande"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => logoutAction()}>
          <LogOut /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

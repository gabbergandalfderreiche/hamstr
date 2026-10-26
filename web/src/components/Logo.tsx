"use client";

import Link from "next/link";
import { Hamster } from "./Hamster";
import { BRAND } from "@/lib/brand";
import { useT } from "@/i18n/client";

export function Logo() {
  const { t, path } = useT();
  return (
    <Link href={path()} className="flex items-center gap-2" aria-label={t.brand.homeLabel(BRAND.name)}>
      <Hamster size={40} mood="happy" coin={false} title="" />
      <span className="font-display text-xl font-extrabold tracking-tight">{BRAND.name}</span>
    </Link>
  );
}

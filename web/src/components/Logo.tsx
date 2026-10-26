import Link from "next/link";
import { Hamster } from "./Hamster";
import { BRAND } from "@/lib/brand";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label={`${BRAND.name} Startseite`}>
      <Hamster size={40} mood="happy" coin={false} title="" />
      <span className="font-display text-xl font-extrabold tracking-tight">{BRAND.name}</span>
    </Link>
  );
}

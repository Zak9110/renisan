import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { phase2Enabled } from "@/lib/features";

export default function Phase2Layout({ children }: { children: ReactNode }) {
  if (!phase2Enabled) notFound();
  return children;
}

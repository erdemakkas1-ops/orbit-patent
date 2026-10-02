import "server-only";
import { cache } from "react";
import { patentProvider } from "@/lib/patents";

export const getPatent = cache((id: string) =>
  patentProvider.getPatentById(id),
);

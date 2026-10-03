import type {
  Patent,
  PatentSearch,
  SearchResult,
  LegalEvent,
  DiscoveryFilters,
} from "@/types/patent";
export interface PatentProvider {
  readonly source: "mock" | "epo";
  searchPatents(query: PatentSearch): Promise<SearchResult>;
  getPatentById(id: string): Promise<Patent | null>;
  getPatentFamily(id: string): Promise<Patent["family"]>;
  getLegalEvents(id: string): Promise<LegalEvent[]>;
  getPatentDrawings?(id: string): Promise<Patent["drawings"]>;
  getPatentDrawingPage?(
    id: string,
    page: number,
    variant?: "full" | "card",
  ): Promise<{ body: Uint8Array; contentType: "image/png" }>;
  discoverPatents?(filters: DiscoveryFilters): Promise<SearchResult>;
  getFeaturedPatents?(limit?: number): Promise<Patent[]>;
}

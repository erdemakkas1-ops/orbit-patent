export type Locale = "tr" | "en";
export type Localized = Record<Locale, string>;
export interface PatentTextTranslation {
  title: string;
  abstract: string;
  description: string;
}
export enum LegalStatus {
  ACTIVE = "ACTIVE",
  EXPIRED = "EXPIRED",
  LAPSED = "LAPSED",
  WITHDRAWN = "WITHDRAWN",
  ABANDONED = "ABANDONED",
  REVOKED = "REVOKED",
  UNKNOWN = "UNKNOWN",
}
export type LegalEventKind =
  | "FILED"
  | "GRANTED"
  | "RENEWED"
  | "REINSTATED"
  | "EXPIRED"
  | "LAPSED"
  | "WITHDRAWN"
  | "ABANDONED"
  | "REVOKED"
  | "UNMAPPED";
export interface LegalEvent {
  id: string;
  date: string;
  jurisdiction: string;
  kind: LegalEventKind;
  description: Localized;
  source: "mock" | "epo";
}
export interface Patent {
  id: string;
  publicationNumber: string;
  applicationNumber: string;
  title: Localized;
  abstract: Localized;
  description: Localized;
  originalLanguage?: string;
  translations?: Partial<Record<Locale, PatentTextTranslation>>;
  inventors: string[];
  applicants: string[];
  publicationDate: string;
  applicationDate: string;
  priorityDate: string;
  cpc: string[];
  ipc: string[];
  legalStatus: LegalStatus;
  legalEvents: LegalEvent[];
  drawings: { url: string; caption: Localized }[];
  drawingStatus?: "available" | "none" | "unavailable";
  family: { publicationNumber: string; country: string }[];
  source: "mock" | "epo";
}
export interface PatentSearch {
  q?: string;
  anyTerms?: readonly string[];
  pageSize?: number;
  cpc?: string;
  ipc?: string;
  year?: number;
  yearRange?: { from?: number; to?: number };
  status?: LegalStatus;
  sort: "newest" | "oldest" | "relevance";
  page: number;
}
export interface SearchResult {
  patents: Patent[];
  total: number;
  page: number;
  pageSize: number;
  source: "mock" | "epo";
}
export type DiscoveryCategory =
  | "robotics"
  | "automation"
  | "sensors"
  | "electronics"
  | "energy"
  | "mechanical"
  | "manufacturing"
  | "assistive";
export type DiscoverySort = "featured" | "newest" | "oldest";
export interface DiscoveryFilters {
  category?: DiscoveryCategory;
  legalStatus?: LegalStatus;
  yearRange?: { from?: number; to?: number };
  sort: DiscoverySort;
  page: number;
  pageSize: number;
}

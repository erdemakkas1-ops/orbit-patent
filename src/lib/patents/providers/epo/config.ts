export const EPO_CONFIG = {
  baseUrl: "https://ops.epo.org/3.2/rest-services",
  tokenUrl: "https://ops.epo.org/3.2/auth/accesstoken",
  pageSize: 20,
  timeoutMs: 15_000,
  searchCacheMs: 5 * 60_000,
  detailCacheMs: 30 * 60_000,
  drawingMetadataCacheMs: 60 * 60_000,
  drawingPageCacheMs: 60 * 60_000,
  maxDrawingPages: 5,
};

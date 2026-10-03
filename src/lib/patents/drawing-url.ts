export const CARD_DRAWING_VERSION = "5";

export function cardDrawingUrl(url: string) {
  if (!url.startsWith("/api/patents/")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}variant=card&v=${CARD_DRAWING_VERSION}`;
}

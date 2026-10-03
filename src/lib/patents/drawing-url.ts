export const CARD_DRAWING_VERSION = "2";

export function cardDrawingUrl(url: string) {
  if (!url.startsWith("/api/patents/")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}variant=card&v=${CARD_DRAWING_VERSION}`;
}

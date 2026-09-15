/**
 * MCB Memory Music Video™ — the order page's view of availability and its
 * offer counters. The server decides availability (and holds the space at
 * checkout); nothing here can make a space exist.
 */

export interface VideoAvailability {
  available: boolean;
  message: string;
  remaining: number | null;
  price_minor: number;
}

export const fetchVideoAvailability = async (): Promise<VideoAvailability | null> => {
  try {
    const response = await fetch("/api/video-availability", { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const body = (await response.json()) as VideoAvailability;
    return typeof body.available === "boolean" && typeof body.message === "string" ? body : null;
  } catch {
    return null;
  }
};

export type VideoOfferEvent = "OFFER_VIEWED" | "SELECTED" | "DESELECTED";

/** A counter for MCB's own offer metrics: the event and the product only — never a name, story or photograph. */
export const countVideoOffer = (event: VideoOfferEvent, productId: string): void => {
  try {
    void fetch("/api/video-offer-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, productId }), keepalive: true }).catch(() => undefined);
  } catch {
    /* counting never interrupts an order */
  }
};

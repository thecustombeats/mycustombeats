/**
 * MCB legal policy — one import surface.
 *
 * The internal legal-review register is deliberately NOT re-exported here. It
 * is governance addressed to whoever ships this, and adding it to this barrel
 * is exactly how it would end up imported into a page and rendered to a
 * customer. Import it by its own path if you genuinely need it.
 */

export * from "./versions";
export * from "./production";
export * from "./delivery";
export * from "./consent";
export * from "./terms";
export * from "./refunds";
export * from "./privacy";

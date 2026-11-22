// Landing imagery. AI-generated illustrations (Canva) — they depict no real ALUMS members and are labelled as such.
// A slot renders only when its file is listed here, so the page never shows an empty placeholder.
export type LandingImage = { src: string; width: number; height: number; alt: string };

export const LANDING_IMAGES: { hero?: LandingImage; celebrate?: LandingImage } = {};

export const AI_IMAGE_LABEL = "AI-generated illustration";

// Landing imagery. AI-generated illustrations (Canva) — they depict no real ALUMS members and are labelled as such.
// A slot renders only when its file is listed here, so the page never shows an empty placeholder.
export type LandingImage = { src: string; width: number; height: number; alt: string };

export const LANDING_IMAGES: { hero?: LandingImage; celebrate?: LandingImage } = {
  hero: {
    src: "/images/graduates-hero.png", width: 549, height: 310,
    alt: "Illustration: four smiling graduates in gowns throwing their caps in the air in front of a university building",
  },
  celebrate: {
    src: "/images/graduates-celebrate.png", width: 441, height: 549,
    alt: "Illustration: a group of graduating classmates celebrating together as caps fly overhead on a sunny campus lawn",
  },
};

export const AI_IMAGE_LABEL = "AI-generated illustration";

export type Archetype =
  | "90s supermodel"
  | "quiet luxury"
  | "western americana"
  | "street heritage"
  | "vintage workwear"
  | "minimal clean"
  | "rock & roll";

export type Fit = "Straight" | "Relaxed" | "Tapered" | "Slim" | "Wide" | "Bootcut";
export type Rise = "High" | "Mid" | "Low";
export type Wash = "Light wash" | "Mid wash" | "Dark rinse" | "Black" | "Raw denim";
export type Stretch = "Rigid" | "Some stretch" | "Stretch";
export type BudgetTier = "under_100" | "under_150" | "invest";

export type DraftProfile = {
  id: string;
  vibe_default: Archetype;
  aesthetic_archetype: Archetype;

  fit_preference: Fit;
  rise_preference: Rise;
  wash_preference: Wash[];
  stretch_preference: Stretch;

  waist: number | string | null;
  inseam: number | string | null;

  jean_style_preferences: string[];
  budget_tier: BudgetTier;
  avoid_brands: string[];
};

export type InitialProfile = Partial<DraftProfile> & { id: string };

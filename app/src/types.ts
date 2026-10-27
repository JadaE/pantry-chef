// Data model. SCHEMA_VERSION bumps when the stored shape changes; logic.migrate() moves old data forward.
// Fields marked "future" are stored but not used by the v0.0.1 UI yet; they reserve room for later versions.
export const SCHEMA_VERSION = 2;  // 1: v0.0.1 (profiles). 2: v0.0.2 adds expiryEstimated, brand, OFF nutrition (all optional, no migration needed)

export type ISODate = string; // 'YYYY-MM-DD'

export type NutrientAmount = { amount: number | null; unit: string; dv?: number | null };
/** future: nutrition label captured by on-device OCR, Open Food Facts barcode lookup, or typed in */
export type NutritionFacts = {
  servingSize?: string;
  servingsPerContainer?: number | null;
  calories?: number | null;
  nutrients: Record<string, NutrientAmount>; // per serving when known, else per 100 g. keys: calories, fat, saturatedFat, carbs, sugars, addedSugars, fiber, protein, sodium(mg)
  per100g?: Record<string, NutrientAmount>;   // Open Food Facts values per 100 g / 100 ml
  perServing?: Record<string, NutrientAmount>; // Open Food Facts values per serving (when the label gives one)
  servingQuantityG?: number | null;            // grams (or ml) in one serving
  packageQuantity?: string | null;             // e.g. "1 gal", "16 oz"
  ingredientsText?: string | null;
  source: 'manual' | 'ocr' | 'openfoodfacts';
  rawText?: string; // OCR text kept for re-parsing
  capturedAt?: number;
};

export type Item = {
  id: string;
  name: string;
  category: string;
  quantity: number | null;
  unit: string;
  /** how much is left, 0-100 (presets: 100 full, 75, 50 half, 25 quarter, 10 low, 0 empty) */
  percentLeft: number;
  purchasedOn: ISODate | null;
  expiresOn: ISODate | null;
  /** true when expiresOn was filled from the typical shelf-life table, not by the user (shown with a dashed "est." badge) */
  expiryEstimated?: boolean;
  photoUri: string | null;
  notes: string;
  createdAt: number;
  updatedAt: number;
  /** optional name used for recipe matching, e.g. item "Store brand 2% milk" -> "milk" */
  recipeName?: string;
  // future
  barcode?: string | null;
  brand?: string | null;
  source?: 'manual' | 'receipt' | 'barcode' | 'shopping';
  ingredientsText?: string | null; // label ingredient list, for bad-ingredient warnings
  nutrition?: NutritionFacts | null;
  tags?: string[];
};

export type Settings = {
  soonDays: number;              // "expiring soon" window
  assumeStaples: boolean;        // treat salt, pepper, water, oil as on hand for recipes
  warnIngredients: string[];     // future: household-wide "bad ingredient" list, flag items whose label lists these
};

/** Daily nutrient limits per person. Defaults follow FDA Daily Values where one exists (editable later).
 *  future: feeds intake tracking + %DV / serving-count warnings. null = no limit set. */
export type NutrientLimits = {
  addedSugarsG: number | null;   // FDA DV 50 g
  sodiumMg: number | null;       // FDA DV 2300 mg
  totalSugarsG: number | null;   // no FDA DV; user-set
  saturatedFatG?: number | null; // FDA DV 20 g (not enforced yet)
  caloriesKcal?: number | null;  // FDA reference 2000 (not enforced yet)
};
export const FDA_DEFAULT_LIMITS: NutrientLimits = { addedSugarsG: 50, sodiumMg: 2300, totalSugarsG: null, saturatedFatG: 20, caloriesKcal: null };
export type GoalNutrient = keyof NutrientLimits;
/** future: optional goal with an optional date range, e.g. "watch added sugars this month" */
export type Goal = { id: string; label: string; nutrient?: GoalNutrient; dailyLimit?: number | null; startOn?: ISODate | null; endOn?: ISODate | null; active: boolean };

/** A household member. No names are built in; the user adds people. */
export type Profile = {
  id: string;
  name: string;
  guest: boolean;           // visiting family / contacts who don't use the app; not selected by default
  dislikes: string[];       // soft: "doesn't like / don't suggest"
  restrictions: string[];   // hard: "can't have" (allergy/diet). Known groups expand via RESTRICTION_RULES (dairy -> milk, butter, ...)
  limits: NutrientLimits;   // future: used by intake tracking + warnings
  goals: Goal[];            // future
  createdAt: number;
};

/** future: shopping list built from recipe missing ingredients */
export type ShoppingItem = { id: string; name: string; measure?: string; fromRecipeId?: string; fromRecipeName?: string; checked: boolean; addedAt: number };
/** future: what was eaten, for calorie / %DV tracking */
export type IntakeEntry = { id: string; at: number; profileId?: string; itemId?: string; recipeId?: string; label: string; servings: number; calories?: number | null; nutrients?: Record<string, NutrientAmount> };

export type RecipeSummary = { id: string; name: string; thumb: string; category: string };
export type RecipeIngredient = { name: string; measure: string };
export type RecipeDetail = RecipeSummary & { area: string; instructions: string; ingredients: RecipeIngredient[]; youtube?: string; source?: string; tags?: string[] };

export type DB = {
  schema: number;
  items: Item[];
  profiles: Profile[];
  eatingIds: string[] | null;   // last "Who's eating" selection on Recipes; null = everyone in the household (non-guests)
  settings: Settings;
  bookmarks: RecipeDetail[];
  dismissedRecipes: string[];             // recipe ids hidden from suggestions
  categoryOffset: Record<string, number>; // "refresh" position per recipe category
  shopping: ShoppingItem[];               // future
  intake: IntakeEntry[];                  // future
  cookingProgress?: Record<string, number>; // future: recipeId -> current step in cooking mode
};

export const DEFAULT_SETTINGS: Settings = { soonDays: 5, assumeStaples: true, warnIngredients: [] };
export const emptyDB = (): DB => ({ schema: SCHEMA_VERSION, items: [], profiles: [], eatingIds: null, settings: { ...DEFAULT_SETTINGS }, bookmarks: [], dismissedRecipes: [], categoryOffset: {}, shopping: [], intake: [] });

export const CATEGORIES = ['Produce', 'Meat & Fish', 'Dairy & Eggs', 'Bakery', 'Pantry', 'Canned', 'Frozen', 'Spices', 'Snacks', 'Drinks', 'Condiments', 'Other'];
export const UNITS = ['pcs', 'lb', 'oz', 'g', 'kg', 'cup', 'L', 'ml', 'can', 'box', 'bag', 'jar', 'bottle', 'pack', 'dozen'];
export const LEFT_PRESETS: { label: string; pct: number }[] = [
  { label: 'Full', pct: 100 }, { label: '¾', pct: 75 }, { label: 'Half', pct: 50 }, { label: '¼', pct: 25 }, { label: 'Low', pct: 10 }, { label: 'Empty', pct: 0 },
];

import type { MenuRow } from "@/lib/api";

// The menu API has no allergen data, so allergens are guessed from the dish name
// and description using ingredients these dishes usually contain. Guesses can miss
// allergens, so the UI must call them "likely" and tell people to ask staff.
// Each word list matches whole words, with an optional plural "s"/"es".
const RULES: [allergen: string, words: string][] = [
  [
    "Milk",
    "milk|cheese|cheesy|cheddar|mozzarella|provolone|parmesan|parm|feta|ricotta|swiss|gouda|brie|queso|paneer|cream|creamy|crema|butter|buttermilk|yogurt|alfredo|ranch|caesar|custard|pudding|latte|whipped|ghee|korma|tikka masala|tzatziki|raita|mac|chowder|bisque|risotto|mashed|pizza|calzone|lasagna|manicotti|tortellini|ravioli|quesadilla|nachos|cheesecake|scone|pancake|waffle|muffin|brownie|blondie|cookie|cake|cupcake|beignet|turnover|cannoli|tiramisu|torte|tart|flan|panna cotta|creme brulee|parfait|ice cream",
  ],
  [
    "Egg",
    "egg|omelet|omelette|frittata|quiche|mayo|mayonnaise|aioli|tartar|hollandaise|benedict|custard|meringue|french toast|pancake|waffle|crepe|brownie|blondie|cookie|cake|cupcake|muffin|scone|beignet|caesar|carbonara|brioche|challah|meatball|meatloaf|fritter|tempura|fried rice|lasagna|manicotti|surimi",
  ],
  [
    "Wheat",
    "bread|breadstick|toast|bun|roll|bagel|wrap|tortilla|pita|naan|focaccia|ciabatta|pasta|spaghetti|penne|rigatoni|ziti|linguine|cavatappi|macaroni|mac|noodle|lo mein|chow mein|ramen|udon|pizza|flatbread|calzone|sandwich|panini|sub|po boy|crouton|pancake|waffle|crepe|muffin|scone|biscuit|cake|cupcake|cookie|brownie|blondie|beignet|turnover|cannoli|churro|cobbler|pie|pastry|danish|croissant|donut|breaded|tender|nugget|fritter|tempura|meatball|meatloaf|couscous|seitan|orzo|dumpling|gnocchi|tortellini|ravioli|lasagna|manicotti|soy sauce|teriyaki|hoisin|general tso|stir fry|stir-fry|fried rice|pretzel|cracker|stuffing|gravy|cereal|granola|surimi",
  ],
  [
    "Soy",
    "soy|shoyu|tofu|edamame|tempeh|miso|teriyaki|hoisin|general tso|kung pao|mongolian|bulgogi|gochujang|japchae|stir fry|stir-fry|fried rice|lo mein|chow mein|plant-based",
  ],
  ["Peanuts", "peanut|satay|pad thai|kung pao"],
  [
    "Tree nuts",
    "almond|walnut|pecan|cashew|pistachio|hazelnut|macadamia|pine nut|nutella|praline|pesto|marzipan|baklava|korma",
  ],
  [
    "Fish",
    "fish|salmon|tuna|cod|tilapia|pollock|haddock|hake|steelhead|stealhead|anchovy|sardine|swordfish|mahi|seafood|surimi|nigiri|poke|caesar|worcestershire",
  ],
  [
    "Shellfish",
    "shrimp|crab|lobster|clam|mussel|oyster|scallop|crawfish|prawn|calamari|squid|seafood|surimi",
  ],
  ["Sesame", "sesame|tahini|hummus|furikake|everything|bibimbap|bulgogi|japchae"],
];

const PATTERNS = RULES.map(
  ([allergen, words]) => [allergen, new RegExp(`\\b(?:${words})(?:e?s)?\\b`, "i")] as const,
);

/** Allergens a dish likely contains, ruling out ones its API diet flags exclude. */
export function guessAllergens(r: MenuRow) {
  const text = `${r.item_name} ${r.description ?? ""}`;
  const ruledOut = new Set<string>([
    ...(r.vegan ? ["Milk", "Egg", "Fish", "Shellfish"] : []),
    ...(r.vegetarian ? ["Fish", "Shellfish"] : []),
    ...(r.gluten_free ? ["Wheat"] : []),
  ]);
  return PATTERNS.filter(([a, re]) => !ruledOut.has(a) && re.test(text)).map(([a]) => a);
}

// Built-in common-grocery list + typical shelf life (days, stored the usual way: fridge for perishables,
// cupboard for dry goods). Used to clean up receipt/barcode names, guess a category, and estimate an
// expiration date when none is entered. Figures are rough "use within" guides (USDA FoodKeeper-style ranges,
// using the shorter end), not safety guarantees.
import { singular, addDays } from './logic';
const GSTOP = new Set(['of', 'and', 'the', 'a', 'with', 'in', 'for', 'ct', 'oz', 'lb', 'pk', 'ea']);
/** grocery tokenizer: unlike recipe matching it keeps words like "ground", "frozen", "whole" */
export const gwords = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !GSTOP.has(w)).map(singular);

export type Grocery = { name: string; cat: string; days: number; aka: string[] };

/** Fallback shelf life by category when the item itself isn't recognised. */
export const CATEGORY_DAYS: Record<string, number | null> = {
  Produce: 7, 'Meat & Fish': 2, 'Dairy & Eggs': 10, Bakery: 5, Pantry: 270, Canned: 540, Frozen: 120,
  Spices: 730, Snacks: 90, Drinks: 180, Condiments: 180, Other: null,
};

// name | category | days | other names (comma separated). Category codes keep the table short.
const CAT: Record<string, string> = { P: 'Produce', M: 'Meat & Fish', D: 'Dairy & Eggs', B: 'Bakery', A: 'Pantry', C: 'Canned', F: 'Frozen', S: 'Spices', N: 'Snacks', R: 'Drinks', O: 'Condiments', X: 'Other' };
const TABLE = `
milk|D|7|whole milk,2% milk,skim milk,1% milk,fat free milk,reduced fat milk,lactose free milk
almond milk|D|7|almondmilk
oat milk|D|7|oatmilk
eggs|D|28|egg,large eggs,brown eggs
butter|D|60|unsalted butter,salted butter
cheese|D|28|cheddar,cheddar cheese,mozzarella,mozzarella cheese,colby jack,monterey jack,swiss cheese,provolone,pepper jack,american cheese,parmesan,cheese slices
shredded cheese|D|21|shredded cheddar,shredded mozzarella,mexican blend
cream cheese|D|21|
cottage cheese|D|10|
sour cream|D|14|
heavy cream|D|10|whipping cream,heavy whipping cream,half and half,half & half,coffee creamer,creamer
yogurt|D|14|greek yogurt,yoghurt,yogurt cup
string cheese|D|21|cheese sticks
bread|B|5|white bread,wheat bread,whole wheat bread,sandwich bread,sourdough,loaf
bagels|B|5|bagel
tortillas|B|14|tortilla,flour tortillas,corn tortillas
buns|B|5|hamburger buns,hot dog buns,rolls,dinner rolls,hawaiian rolls
english muffins|B|7|muffins
croissants|B|3|croissant
cake|B|4|cupcakes,donuts,doughnuts,pastries
bananas|P|5|banana
apples|P|30|apple,gala,fuji,honeycrisp,granny smith,red delicious
oranges|P|21|orange,navel oranges,clementines,mandarins,cuties
lemons|P|21|lemon
limes|P|21|lime
grapes|P|7|red grapes,green grapes
strawberries|P|4|strawberry
blueberries|P|7|blueberry
raspberries|P|3|raspberry
blackberries|P|3|blackberry
avocados|P|4|avocado,hass avocado
tomatoes|P|7|tomato,roma tomatoes,cherry tomatoes,grape tomatoes
potatoes|P|30|potato,russet potatoes,red potatoes,yukon gold,sweet potatoes,sweet potato
onions|P|30|onion,yellow onion,red onion,white onion,sweet onion
green onions|P|7|scallions
garlic|P|60|
carrots|P|21|carrot,baby carrots
celery|P|14|
lettuce|P|7|romaine,romaine hearts,iceberg,salad mix,spring mix,salad
spinach|P|5|baby spinach
kale|P|7|
broccoli|P|7|broccoli crowns
cauliflower|P|7|
cucumbers|P|7|cucumber
bell peppers|P|10|bell pepper,green pepper,red pepper,yellow pepper,peppers
jalapenos|P|10|jalapeno
zucchini|P|7|squash,yellow squash
mushrooms|P|5|mushroom,white mushrooms,baby bella
corn|P|3|corn on the cob,sweet corn
green beans|P|7|
asparagus|P|4|
cabbage|P|30|coleslaw mix
cilantro|P|7|
parsley|P|7|
ginger|P|21|
pineapple|P|4|
watermelon|P|7|
cantaloupe|P|5|melon
peaches|P|4|peach,nectarines
pears|P|7|pear
mango|P|5|mangoes
chicken breast|M|2|boneless skinless chicken breast,chicken breasts,chicken tenders,chicken tenderloins
chicken thighs|M|2|chicken thigh
chicken wings|M|2|wings
chicken drumsticks|M|2|drumsticks
whole chicken|M|2|chicken,rotisserie chicken
ground beef|M|2|hamburger,ground chuck,ground sirloin,lean ground beef
steak|M|3|ribeye,sirloin,new york strip,flank steak,skirt steak,chuck roast,beef roast,stew meat,beef
ground turkey|M|2|
turkey|M|3|turkey breast
pork chops|M|3|pork chop,pork loin,pork tenderloin,pork shoulder,pork
bacon|M|7|
sausage|M|2|breakfast sausage,italian sausage,smoked sausage,kielbasa,bratwurst
hot dogs|M|7|franks,hot dog
ham|M|5|deli ham,sliced ham
deli meat|M|5|lunch meat,sliced turkey,turkey breast deli,salami,pepperoni,roast beef
salmon|M|2|salmon fillet,atlantic salmon
tilapia|M|2|cod,fish fillet,white fish,catfish
shrimp|M|2|prawns
tuna steak|M|2|
tofu|M|7|
rice|A|365|white rice,brown rice,jasmine rice,basmati rice,long grain rice
pasta|A|365|spaghetti,penne,macaroni,rotini,elbow macaroni,fettuccine,linguine,egg noodles,noodles,lasagna
ramen|A|365|instant noodles,cup noodles
flour|A|240|all purpose flour,bread flour,self rising flour
sugar|A|730|brown sugar,powdered sugar,granulated sugar
oats|A|365|oatmeal,rolled oats,quick oats,old fashioned oats
cereal|A|180|corn flakes,cheerios,granola
pancake mix|A|270|baking mix,bisquick
baking soda|A|540|baking powder
peanut butter|A|180|
jelly|O|180|jam,grape jelly,strawberry jam,preserves
honey|A|730|
syrup|O|365|maple syrup,pancake syrup
olive oil|A|540|extra virgin olive oil
vegetable oil|A|365|canola oil,cooking oil,oil,cooking spray
vinegar|O|730|apple cider vinegar
bread crumbs|A|180|breadcrumbs,panko
dried beans|A|365|lentils,dry beans
coffee|R|180|ground coffee,coffee beans,k cups,kcups
tea|R|540|tea bags
canned beans|C|540|black beans,pinto beans,kidney beans,chickpeas,garbanzo beans,refried beans,baked beans,beans
canned tomatoes|C|540|diced tomatoes,crushed tomatoes,tomato paste,tomato sauce,whole tomatoes
canned corn|C|540|whole kernel corn,cream corn
canned vegetables|C|540|green beans canned,peas canned,mixed vegetables canned
soup|C|540|chicken noodle soup,tomato soup,condensed soup,cream of mushroom,broth,chicken broth,beef broth,stock
canned tuna|C|540|tuna,chunk light tuna,albacore
canned fruit|C|540|peaches canned,fruit cocktail,mandarin oranges
pasta sauce|O|365|marinara,spaghetti sauce,alfredo sauce
salsa|O|180|
ketchup|O|180|
mustard|O|365|yellow mustard,dijon
mayonnaise|O|60|mayo
salad dressing|O|60|ranch,italian dressing,dressing
soy sauce|O|730|
hot sauce|O|730|sriracha
bbq sauce|O|180|barbecue sauce
pickles|O|90|dill pickles,relish
salt|S|1825|sea salt,kosher salt
pepper|S|730|black pepper,ground pepper
spices|S|730|seasoning,cinnamon,cumin,chili powder,paprika,garlic powder,onion powder,oregano,italian seasoning,taco seasoning
chips|N|60|potato chips,tortilla chips,doritos,pringles,cheetos
crackers|N|120|saltines,goldfish,ritz
cookies|N|60|oreos,cookie
pretzels|N|120|
popcorn|N|180|microwave popcorn
granola bars|N|180|protein bars,cereal bars,bars
nuts|N|180|almonds,cashews,peanuts,pistachios,walnuts,pecans,trail mix,mixed nuts
candy|N|180|chocolate,gummies,candy bar
fruit snacks|N|180|
water|R|730|bottled water,spring water,sparkling water,seltzer
soda|R|270|cola,coke,pepsi,sprite,dr pepper,soft drink
juice|R|10|orange juice,apple juice,lemonade,juice box
sports drink|R|270|gatorade,powerade
beer|R|180|
wine|R|365|
frozen vegetables|F|240|frozen peas,frozen broccoli,frozen corn,frozen mixed vegetables,frozen green beans,steamfresh
frozen fruit|F|240|frozen berries,frozen strawberries
frozen pizza|F|180|pizza
ice cream|F|90|frozen yogurt,popsicles,ice pops
frozen meals|F|120|frozen dinner,lean cuisine,burritos,frozen burritos,pot pie
frozen chicken|F|180|chicken nuggets,chicken patties,frozen chicken breast
frozen fries|F|240|french fries,tater tots,hash browns
frozen waffles|F|90|waffles,eggo
frozen fish|F|180|fish sticks,frozen shrimp
paper towels|X|0|paper towel
toilet paper|X|0|bath tissue
trash bags|X|0|garbage bags
dish soap|X|0|detergent,laundry detergent,dishwasher pods
`;

export const GROCERIES: Grocery[] = TABLE.trim().split('\n').map(l => {
  const [name, c, d, aka] = l.split('|');
  return { name, cat: CAT[c] || 'Other', days: Number(d), aka: aka ? aka.split(',').map(s => s.trim()).filter(Boolean) : [] };
});

/** Every word the grocery table knows; used to judge whether a cleaned receipt name is readable. */
export const VOCAB = new Set<string>();
for (const g of GROCERIES) for (const n of [g.name, ...g.aka]) for (const w of n.toLowerCase().split(/[^a-z0-9%]+/)) if (w) { VOCAB.add(w); VOCAB.add(singular(w)); }

// ---------- fuzzy matching ----------
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
/** How well one receipt word matches one grocery word: 1 exact, <1 for typos / truncations, 0 none. */
export function wordSim(w: string, g: string): number {
  if (w === g) return 1;
  if (w.length >= 3 && g.startsWith(w)) return 0.6 + 0.35 * (w.length / g.length); // receipts truncate: STRAWB -> strawberries
  if (w.length >= 5 && g.length >= 5) {
    const d = editDistance(w, g, 2);
    if (d === 1) return 0.85;
    if (d === 2 && Math.min(w.length, g.length) >= 7) return 0.7;
  }
  return 0;
}
export type GroceryMatch = { g: Grocery; score: number; via: string };
/** Best grocery-list match for a (cleaned) name. score ~1 = every word of the grocery name was found. */
export function matchGrocery(name: string): GroceryMatch | null {
  const words = gwords(name);
  if (!words.length) return null;
  let best: GroceryMatch | null = null;
  for (const g of GROCERIES) for (const cand of [g.name, ...g.aka]) {
    const cw = gwords(cand); if (!cw.length) continue;
    let sum = 0;
    for (const c of cw) { let m = 0; for (const w of words) m = Math.max(m, wordSim(w, c)); sum += m; }
    let score = sum / cw.length;                     // coverage of the grocery name
    if (score <= 0) continue;
    const extra = words.filter(w => !cw.some(c => wordSim(w, c) > 0)).length;
    score -= Math.min(0.25, extra * 0.04);           // small penalty for unexplained words
    // prefer the more specific grocery when two cover the same words (chicken breast over chicken)
    score += Math.min(0.06, cw.length * 0.02);
    // a match that only hits a generic last word ("cheese" in "cream cheese") is handled by word counts above
    if (!best || score > best.score + 1e-9) best = { g, score, via: cand };
  }
  return best && best.score >= 0.55 ? best : null;
}

// ---------- shelf life ----------
export type ExpiryGuess = { days: number; basis: string };
export function shelfLifeFor(name: string, category: string): ExpiryGuess | null {
  const n = ' ' + gwords(name).join(' ') + ' ';
  if (/ (frozen|frz|ice cream) /.test(n) || category === 'Frozen') {
    const m = matchGrocery(name);
    if (m && m.g.cat === 'Frozen') return { days: m.g.days, basis: m.g.name };
    return { days: CATEGORY_DAYS.Frozen!, basis: 'frozen food' };
  }
  if (/ (canned|can) /.test(n) && category !== 'Drinks') return { days: CATEGORY_DAYS.Canned!, basis: 'canned food' };
  const m = matchGrocery(name);
  if (m && m.g.days > 0 && (m.g.cat === category || !CATEGORY_DAYS[category] || category === 'Other')) return { days: m.g.days, basis: m.g.name };
  if (m && m.g.days > 0 && m.score >= 0.9) return { days: m.g.days, basis: m.g.name };
  const d = CATEGORY_DAYS[category];
  return d ? { days: d, basis: category.toLowerCase() } : null;
}
export const describeDays = (d: number) => d >= 365 ? `${Math.round(d / 365 * 10) / 10} yr`.replace('.0 ', ' ') : d >= 60 ? `${Math.round(d / 30)} months` : d >= 14 && d % 7 === 0 ? `${d / 7} weeks` : `${d} day${d === 1 ? '' : 's'}`;

/** Estimated expiration for an item with no date: purchase date (or today) + typical shelf life. */
export function estimateExpiry(name: string, category: string, from: string): { date: string; days: number; basis: string } | null {
  const g = shelfLifeFor(name, category);
  if (!g || !(g.days > 0)) return null;
  return { date: addDays(from, g.days), days: g.days, basis: g.basis };
}

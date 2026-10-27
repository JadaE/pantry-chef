// Grocery receipt -> pantry items, with plain rules (no AI, no network).
// Input is OCR text (rows rebuilt from ML Kit line boxes) or pasted text. Steps per row:
//   skip totals/tax/payment/coupons/store header/addresses/dates -> pull qty/weight lines onto the item above ->
//   strip prices, UPC/item numbers, tax flags, sizes -> drop store-brand prefixes -> expand abbreviations ->
//   fuzzy-match the built-in grocery list for a clean name + category.
import type { ISODate } from './types';
import { GROCERIES, VOCAB, matchGrocery, gwords } from './groceries';
import { toISO } from './logic';

// ---------- dictionaries ----------
/** store-brand / private-label prefixes that say nothing about the food */
export const BRANDS = new Set(('GV GREAT VALUE HEB H-E-B HCF HILL COUNTRY FARE CENTRAL MARKET KS KIRKLAND KIRK SIG SIGNATURE GG GOOD&GATHER GOOD GATHER ' +
  'MP MKT PNTRY MARKET PANTRY UP&UP MM MEMBERS MARK MBR KRO KROGER SMPL SIMPLE TRUTH 365 WFM TJ TJS PC PRIVATE SELECTION PS FRESHNESS GUARANTEED FG ' +
  'MARKETSIDE MKTSD SAMS CHOICE SC EQ EQUATE PRAIRIE FARMS BORDEN LUCERNE OPEN NATURE ON SIGNATURE SELECT FOOD CLUB FC ESSENTIAL EVERYDAY EE ' +
  'BOWL & BASKET B&B WEGMANS PUBLIX MEIJER ALDI ORIGINAL ORIG').split(/\s+/));
// multi-word brands removed only as a whole phrase
const BRAND_PHRASES = ['GREAT VALUE', 'HILL COUNTRY FARE', 'CENTRAL MARKET', 'GOOD & GATHER', 'GOOD GATHER', 'MARKET PANTRY', 'MKT PNTRY', 'MEMBERS MARK', "MEMBER'S MARK", 'SIMPLE TRUTH', 'PRIVATE SELECTION', 'FRESHNESS GUARANTEED', 'SAMS CHOICE', 'KIRKLAND SIGNATURE', 'KIRK SIG', 'OPEN NATURE', 'FOOD CLUB', 'BOWL & BASKET', 'PRAIRIE FARMS'];
// brands safe to drop anywhere in the line (never food words)
const BRAND_ANYWHERE = new Set(['GV', 'HEB', 'H-E-B', 'HCF', 'KS', 'KIRKLAND', 'GG', 'MM', 'KRO', 'MKTSD', 'MARKETSIDE', 'EQ', 'EQUATE', 'UP&UP', 'WFM', 'TJS', 'SMPL']);

/** multi-word receipt abbreviations (checked first) */
const PHRASES: [string, string][] = [
  ['BNLS SKNLS', 'boneless skinless'], ['B/S', 'boneless skinless'], ['BS CHKN', 'boneless skinless chicken'], ['SR CRM', 'sour cream'], ['SOUR CRM', 'sour cream'],
  ['CRM CHS', 'cream cheese'], ['CRM CHEESE', 'cream cheese'], ['PNT BTR', 'peanut butter'], ['PNUT BTR', 'peanut butter'], ['PB', 'peanut butter'], ['OJ', 'orange juice'],
  ['HLF GAL', ''], ['HALF GAL', ''], ['1/2 GAL', ''], ['HG', ''], ['HVY WHP', 'heavy whipping'], ['HVY CRM', 'heavy cream'], ['H&H', 'half and half'], ['HALF & HALF', 'half and half'],
  ['GRD BF', 'ground beef'], ['GRND BF', 'ground beef'], ['GR BEEF', 'ground beef'], ['GRD TKY', 'ground turkey'], ['GRND TRKY', 'ground turkey'], ['GRD TURKEY', 'ground turkey'],
  ['TOM SCE', 'tomato sauce'], ['TOM PASTE', 'tomato paste'], ['DCD TOM', 'diced tomatoes'], ['GRN ONION', 'green onions'], ['GRN ONIONS', 'green onions'], ['GRN BNS', 'green beans'], ['GRN BEANS', 'green beans'],
  ['BLK BNS', 'black beans'], ['BLK BEANS', 'black beans'], ['PNTO BNS', 'pinto beans'], ['RFRD BNS', 'refried beans'], ['CHKN BRTH', 'chicken broth'], ['CHK BROTH', 'chicken broth'],
  ['WHL WHT', 'whole wheat'], ['WW', 'whole wheat'], ['WHT BRD', 'white bread'], ['EVOO', 'extra virgin olive oil'], ['XVOO', 'extra virgin olive oil'], ['OLV OIL', 'olive oil'], ['VEG OIL', 'vegetable oil'],
  ['ICE CRM', 'ice cream'], ['ICE CR', 'ice cream'], ['FF', 'fat free'], ['RF', 'reduced fat'], ['LF', 'low fat'], ['NF', ''], ['2 %', '2%'], ['ENG MUFF', 'english muffins'], ['ENGL MUFFIN', 'english muffins'],
  ['RSST POT', 'russet potatoes'], ['RUSSET POT', 'russet potatoes'], ['SWT POT', 'sweet potatoes'], ['SWT POTATO', 'sweet potatoes'], ['YEL ONION', 'yellow onion'], ['RED ONION', 'red onion'],
  ['ROM HEARTS', 'romaine hearts'], ['BBY SPINACH', 'baby spinach'], ['BABY SPIN', 'baby spinach'], ['BBY CRT', 'baby carrots'], ['BABY CARR', 'baby carrots'], ['BELL PEP', 'bell pepper'],
  ['CHDR CHS', 'cheddar cheese'], ['SHRD CHED', 'shredded cheddar'], ['SHRD MOZZ', 'shredded mozzarella'], ['STR CHS', 'string cheese'], ['AMER CHS', 'american cheese'],
  ['FRZ PIZZA', 'frozen pizza'], ['FZ PIZZA', 'frozen pizza'], ['TP', 'toilet paper'], ['BATH TISS', 'bath tissue'], ['PPR TWL', 'paper towels'], ['PAPER TWL', 'paper towels'],
  ['DZ', ''], ['DOZ', ''], ['LG', 'large'], ['XL', 'extra large'], ['AA', ''], ['GR A', ''], ['GRADE A', ''],
];
/** single-token abbreviations; '' means drop the token */
const WORDS: Record<string, string> = Object.fromEntries(`
WHL=whole WHOLE=whole MLK=milk MLIK=milk MILK=milk SKM=skim BNLS=boneless SKNLS=skinless SKLS=skinless CHKN=chicken CHK=chicken CKN=chicken CHIC=chicken CHICK=chicken
BRST=breast BRS=breast BRST.=breast BREAST=breast THGH=thighs THG=thighs THI=thighs WNG=wings WNGS=wings DRMSTK=drumsticks DRUMST=drumsticks TNDR=tenders TNDRS=tenders
ORG=organic ORGN=organic ORGNC=organic GRD=ground GRND=ground BF=beef BEEF=beef TKY=turkey TRKY=turkey TURK=turkey PRK=pork CHP=chops CHPS=chops CHOP=chops LN=loin TNDRLN=tenderloin
BCN=bacon SAUS=sausage SSG=sausage SAUSG=sausage STK=steak SIRL=sirloin SRLN=sirloin RIBEYE=ribeye ROAST=roast FRANKS=franks
SLMN=salmon SALM=salmon SHRMP=shrimp SHRIMP=shrimp TILAP=tilapia TIL=tilapia
CHS=cheese CHSE=cheese CHEESE=cheese SHRD=shredded SHRED=shredded SHR=shredded MOZZ=mozzarella MOZZARELLA=mozzarella MOZ=mozzarella CHED=cheddar CHEDR=cheddar CHDR=cheddar SHRP=sharp
PARM=parmesan PRMSN=parmesan SWS=swiss PROV=provolone AMER=american MNTRY=monterey COLBY=colby
YGRT=yogurt YOG=yogurt YGT=yogurt YOGRT=yogurt YOGURT=yogurt GRK=greek GREEK=greek BTR=butter BUTTR=butter BTTR=butter UNSLT=unsalted UNSLTD=unsalted SLTD=salted
CRM=cream CRMR=creamer CREAMR=creamer EGG=eggs EGGS=eggs EGS=eggs LRG=large LGE=large BRN=brown WHT=white
BRD=bread BRED=bread BGL=bagels BAGL=bagels BAGELS=bagels TORT=tortillas TORTS=tortillas TRTLA=tortillas TORTLA=tortillas FLR=flour CRN=corn MFFN=muffins MUFF=muffins CROISS=croissants
BNNA=bananas BAN=bananas BANAN=bananas BANANA=bananas BANANAS=bananas APPL=apples APL=apples APLS=apples HNYCRSP=honeycrisp GRANNY=granny STRAWB=strawberries STRWB=strawberries STRAWBRY=strawberries STRWBRY=strawberries
BLUEB=blueberries BLBRY=blueberries BLUEBRY=blueberries BLUBRY=blueberries RASPB=raspberries RSPBRY=raspberries BLKBRY=blackberries GRP=grapes GRPS=grapes AVO=avocados AVOC=avocados AVOCADO=avocados HASS=hass
LMN=lemons LMNS=lemons LIM=limes LIMES=limes ORNG=oranges ORNGS=oranges NAVEL=navel CLEM=clementines CLEMENT=clementines MANDRN=mandarins PNAPL=pineapple PINEAPL=pineapple WTRMLN=watermelon CNTLP=cantaloupe
TOM=tomatoes TOMS=tomatoes TOMATO=tomatoes TOMATOES=tomatoes ROMA=roma CHRY=cherry GRPE=grape POT=potatoes POTS=potatoes POTATO=potatoes RSST=russet RUSS=russet YUK=yukon
ONI=onions ONIO=onions ONION=onions ONIONS=onions YEL=yellow YLW=yellow GRN=green GRLC=garlic GARL=garlic CRT=carrots CRTS=carrots CARR=carrots CARROT=carrots CLRY=celery CELRY=celery
LTC=lettuce LETT=lettuce LETTUCE=lettuce ROM=romaine ROMN=romaine ICEBRG=iceberg SPNCH=spinach SPIN=spinach SPINCH=spinach BRCL=broccoli BROC=broccoli BROCC=broccoli CAULI=cauliflower CAULIF=cauliflower
CUC=cucumbers CUKE=cucumbers CUKES=cucumbers CUCUMBER=cucumbers PEP=peppers PEPP=peppers PEPR=peppers JALAP=jalapenos ZUCC=zucchini ZUCH=zucchini SQSH=squash MUSH=mushrooms MSHRM=mushrooms MSHRMS=mushrooms
CILANT=cilantro CLNTRO=cilantro PRSLY=parsley GINGR=ginger ASPRG=asparagus ASPAR=asparagus CABB=cabbage CBG=cabbage SLAW=coleslaw
JCE=juice JC=juice JUC=juice LMNADE=lemonade WTR=water SPRK=sparkling SPKLG=sparkling SDA=soda COF=coffee COFF=coffee GRND=ground KCUP=k cups KCUPS=k cups
CRL=cereal CER=cereal CEREAL=cereal OATML=oatmeal OATMEAL=oatmeal GRAN=granola GRNLA=granola PNT=peanut PNUT=peanut PNUTS=peanuts ALMND=almonds ALMNDS=almonds CSHW=cashews
SPAG=spaghetti SPGH=spaghetti SPAGH=spaghetti PST=pasta PSTA=pasta MAC=macaroni NOODL=noodles RCE=rice RICE=rice JASM=jasmine BASM=basmati BNS=beans BEAN=beans BLK=black PNTO=pinto KDNY=kidney GARBZ=garbanzo
SCE=sauce SAU=sauce SAUCE=sauce MARIN=marinara SALSA=salsa KETCH=ketchup KTCHP=ketchup MSTRD=mustard MAYO=mayonnaise RNCH=ranch DRSG=dressing DRSNG=dressing SOYSCE=soy sauce
SUG=sugar SGR=sugar SUGR=sugar BRWN=brown PWDR=powdered HNY=honey SYRP=syrup VAN=vanilla CHOC=chocolate CHOCO=chocolate
CKY=cookies CKIE=cookies COOKIE=cookies CRKR=crackers CRCKR=crackers CRKRS=crackers CHIP=chips TORTCHP=tortilla chips PRTZL=pretzels POPCRN=popcorn
FRZ=frozen FRZN=frozen FZN=frozen FZ=frozen VEG=vegetables VEGS=vegetables VEGG=vegetables MXD=mixed MIX=mix BROTH=broth BRTH=broth STCK=stock SOUP=soup
TWL=towels TWLS=towels TISS=tissue DET=detergent DTRGNT=detergent
CRMY=creamy CRUNCHY=crunchy CRNCHY=crunchy SLCD=sliced SLC=sliced SLI=sliced CHUNK=chunk CHNK=chunk DCD=diced CRSHD=crushed WHL=whole BNLESS=boneless SKLESS=skinless FRSH=fresh FRESH=fresh NAT=natural NATRL=natural
ORIG=original REG=regular RDCD=reduced LITE=light LT=light VAN=vanilla STRWBRY=strawberry PLN=plain PLAIN=plain UNSWT=unsweetened UNSW=unsweetened SWT=sweet SWEET=sweet
GAL= QT= PT= OZ= FZ= LB= LBS= CT= PK= PACK= EA= BG= BAG= BTL= CN= CAN= JR= BX= BOX= VALUE= FAMILY= FAM= PK.= SZ= SIZE= MULTI= MULTIPACK= PACK= PKG=
`.trim().split(/\s+/).map(p => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; }));
// NB: in the table above "x=" means the token is dropped (sizes / packaging words).

// ---------- line classification ----------
const PRICE = String.raw`-?\$?\s?\d{1,4}[.,]\s?\d{2}`;
const PRICE_TAIL = new RegExp(String.raw`\s+(${PRICE})\s*(-)?\s*(?:[A-Z]{1,2}|\*|[A-Z]\s?[A-Z])?\s*$`);
const NEG_PRICE = new RegExp(String.raw`(-\s?\$?\d{1,4}[.,]\d{2}|\d[.,]\d{2}\s?-(\s|$)|\(\$?\d+[.,]\d{2}\))`);
const HARD_SKIP = new RegExp('\\b(' + [
  'SUB ?TOTAL', 'TOTAL', 'TAX', 'TAXABLE', 'BALANCE', 'BAL DUE', 'AMOUNT DUE', 'CHANGE', 'CHANGE DUE', 'CASH', 'VISA', 'MASTER ?CARD', 'MC', 'AMEX', 'AMERICAN EXPRESS', 'DISCOVER', 'DEBIT', 'CREDIT',
  'EBT', 'SNAP', 'TEND', 'TENDER', 'TENDERED', 'PAYMENT', 'PAID', 'APPROVED', 'APPROVAL', 'APPR', 'AUTH', 'AUTH CODE', 'REF', 'REFERENCE', 'TRANS', 'TRANSACTION', 'TERMINAL', 'TERM', 'ACCOUNT', 'ACCT',
  'CARD', 'CHIP READ', 'PIN', 'AID', 'TC', 'ST#', 'OP#', 'TE#', 'TR#', 'CASHIER', 'OPERATOR', 'ITEMS? SOLD', 'ITEM COUNT', 'NUMBER OF ITEMS', 'TOTAL ITEMS', 'SAVINGS', 'YOU SAVED', 'SAVED', 'SAVE',
  'COUPON', 'CPN', 'DISCOUNT', 'DISC', 'INSTANT SAVINGS', 'INST SV', 'MEMBER', 'MEMBERSHIP', 'MBR#', 'REWARDS', 'POINTS', 'THANK', 'THANKS', 'WELCOME', 'RECEIPT', 'SURVEY', 'FEEDBACK', 'RETURN', 'RETURNS',
  'REFUND', 'POLICY', 'MANAGER', 'MGR', 'SUPERCENTER', 'LOW PRICES', 'LIVE BETTER', 'REGULAR PRICE', 'REG PRICE', 'ORIGINAL PRICE', 'BOTTLE DEPOSIT', 'DEPOSIT', 'CRV', 'BAG FEE', 'BAG CHARGE',
  'CIRCLE', 'REDCARD', 'PRICE MATCH', 'VOID', 'VOIDED', 'CUSTOMER COPY', 'MERCHANT COPY', 'SIGNATURE REQUIRED', 'WWW', 'HTTP', 'COM', 'SCAN', 'SCANNED', 'STORE', 'STORE#', 'INVOICE', 'ORDER',
  'SELF CHECKOUT', 'SELF CHECK', 'LANE', 'REGISTER', 'REG#', 'TRN', 'SEQ', 'MID', 'TID', 'NET', 'EXPIRES', 'EXP', 'BARCODE', 'PHONE', 'TEL', 'FAX', 'OPEN', 'HOURS', 'DAILY', 'EST', 'USD', 'AMOUNT', 'PLEASE', 'AGAIN', 'COME AGAIN', 'VISIT', 'APP#', 'RESP',
].join('|') + ')\\b');
const STORE_NAMES: [RegExp, string][] = [[/WAL-?\s?MART|WALMART/, 'Walmart'], [/\bH-?E-?B\b|H E B/, 'H-E-B'], [/COSTCO/, 'Costco'], [/TARGET/, 'Target'], [/KROGER/, 'Kroger'], [/ALDI/, 'Aldi'], [/PUBLIX/, 'Publix'], [/SAFEWAY/, 'Safeway'], [/WHOLE FOODS/, 'Whole Foods'], [/TRADER JOE/, "Trader Joe's"], [/SAM'?S CLUB/, "Sam's Club"], [/MEIJER/, 'Meijer'], [/WEGMANS/, 'Wegmans']];
const HEADERS = new Set(['GROCERY', 'GROCERIES', 'PRODUCE', 'DAIRY', 'MEAT', 'MEATS', 'DELI', 'BAKERY', 'FROZEN', 'FROZEN FOOD', 'FROZEN FOODS', 'HOME', 'HEALTH', 'BEAUTY', 'HEALTH AND BEAUTY', 'HEALTH & BEAUTY',
  'ELECTRONICS', 'PHARMACY', 'APPAREL', 'HOUSEHOLD', 'BEVERAGES', 'BEVERAGE', 'SNACKS', 'SEAFOOD', 'GENERAL MERCHANDISE', 'GM', 'MARKET', 'FOOD', 'NONFOOD', 'NON FOOD', 'PET', 'BABY', 'KITCHEN', 'TOYS', 'CLOTHING', 'MISC']);

export type ReceiptItem = {
  raw: string;           // original row
  name: string;          // suggested clean name
  expanded: string;      // abbreviations expanded (before choosing the canonical name)
  match: string | null;  // grocery-list entry used
  category: string;
  qty: number;
  unit: string;
  price: number | null;
  confidence: 'high' | 'medium' | 'low';
  food: boolean;         // false for paper towels, detergent... (unchecked by default in review)
};
export type ReceiptParse = { store: string | null; date: ISODate | null; items: ReceiptItem[]; skipped: string[] };

const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;
const num = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.').replace('$', ''));

/** Rebuild visual rows from OCR line boxes: lines whose vertical centres overlap belong to one row, left to right. */
export function rowsFromOcr(lines: { text: string; left: number; top: number; right: number; bottom: number }[]): string[] {
  const ls = lines.filter(l => l.text.trim()).map(l => ({ ...l, cy: (l.top + l.bottom) / 2, h: Math.max(1, l.bottom - l.top) })).sort((a, b) => a.cy - b.cy);
  const rows: { cy: number; h: number; parts: typeof ls }[] = [];
  for (const l of ls) {
    const r = rows.find(r => Math.abs(r.cy - l.cy) < Math.min(r.h, l.h) * 0.55);
    if (r) { r.parts.push(l); r.cy = (r.cy * (r.parts.length - 1) + l.cy) / r.parts.length; } else rows.push({ cy: l.cy, h: l.h, parts: [l] });
  }
  return rows.sort((a, b) => a.cy - b.cy).map(r => r.parts.sort((a, b) => a.left - b.left).map(p => p.text.trim()).join('  '));
}

function findDate(t: string, now: Date): ISODate | null {
  const m = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})\b/);
  if (!m) return null;
  let y = Number(m[3]); if (y < 100) y += 2000;
  const mo = Number(m[1]), d = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getTime() > now.getTime() + 2 * 86400000 || now.getTime() - dt.getTime() > 400 * 86400000) return null; // implausible
  return toISO(dt);
}

type QtyInfo = { qty: number; unit: string };
/** "2 @ 1.98", "2 AT 1 FOR 0.98", "3 X 1.25", "1.23 lb @ 0.48 /lb", "QTY 2" */
export function qtyLine(t: string): QtyInfo | null {
  let m = t.match(/^(\d+(?:[.,]\d+)?)\s*(LB|LBS|KG|OZ)\s*@/) || t.match(/^(?:WT\.?|NET WT)?\s*(\d+[.,]\d+)\s*(LB|LBS|KG)\b/);
  if (m) return { qty: Math.round(num(m[1]) * 100) / 100, unit: m[2].startsWith('LB') ? 'lb' : m[2] === 'KG' ? 'kg' : 'oz' };
  m = t.match(/^(\d{1,2})\s*(?:@|AT|X)\s*(?:\d+\s*FOR\s*)?\$?\s?\d/) || t.match(/^QTY\.?\s*(\d{1,2})\b/);
  if (m && !/[A-Z]{3,}/.test(t.replace(/\b(AT|FOR|QTY|EA|EACH|LB|LBS|KG|OZ)\b/g, ''))) return { qty: Number(m[1]), unit: 'pcs' };
  return null;
}

function stripBrands(tokens: string[]): string[] {
  let t = tokens.slice();
  let s = ' ' + t.join(' ') + ' ';
  for (const p of BRAND_PHRASES) s = s.replace(' ' + p + ' ', ' ');
  t = s.trim().split(/\s+/).filter(Boolean);
  while (t.length > 1 && BRANDS.has(t[0])) t.shift();
  return t.filter(w => !BRAND_ANYWHERE.has(w));
}

/** expand receipt abbreviations: phrases first, then single tokens */
export function expandAbbrev(tokens: string[]): string[] {
  let s = ' ' + tokens.join(' ') + ' ';
  for (const [k, v] of PHRASES) s = s.split(' ' + k + ' ').join(' ' + v.toUpperCase() + (v ? ' ' : ''));
  const out: string[] = [];
  for (const w of s.trim().split(/\s+/).filter(Boolean)) {
    if (w in WORDS) { if (WORDS[w]) out.push(...WORDS[w].split(' ')); continue; }
    out.push(w.toLowerCase());
  }
  return out;
}

/** clean one item row (price/flags already removed). Returns null when nothing food-like is left. */
export function cleanItemName(text: string): { expanded: string; size: QtyInfo | null } | null {
  let t = text.toUpperCase().replace(/[|_~^`"]/g, ' ').replace(/\s+/g, ' ').trim();
  let size: QtyInfo | null = null;
  // pack size: 24CT / 18 CT / 12PK -> count; 2LB bag -> weight; 1GAL etc. dropped
  const ct = t.match(/\b(\d{1,3})\s*-?\s*(CT|PK|PACK|COUNT|EA)\b/); if (ct) { size = { qty: Number(ct[1]), unit: 'pcs' }; }
  const lb = t.match(/\b(\d+(?:\.\d+)?)\s*(LB|LBS)\b/); if (!size && lb) size = { qty: num(lb[1]), unit: 'lb' };
  if (!size && /\b(DOZ|DZ)\b/.test(t)) size = { qty: 12, unit: 'pcs' };
  t = t.replace(/\b\d+(?:\.\d+)?\s*-?\s*(FL ?OZ|OZ|FZ|Z|LB|LBS|CT|PK|PACK|COUNT|GAL|QT|PT|ML|L|LTR|G|GR|KG|DZ|DOZ|EA|IN|RL|ROLL|ROLLS|SHT|SHEETS)\b/g, ' ');
  t = t.replace(/\b\d{4,}[A-Z]{0,3}\b/g, ' ');           // UPC / PLU / item numbers (4011KF, 007874235186)
  t = t.split(' ').filter(w => !(w.length >= 6 && (w.match(/[0-9]/g) || []).length >= w.length * 0.6)).join(' '); // OCR-damaged codes (0O7874235186)
  t = t.replace(/^(E|A|N|F|T|X|\*)\s+(?=\S)/, '');       // Costco "E" etc. leading flags
  t = t.replace(/[^A-Z0-9&%\/' -]/g, ' ').replace(/\s+/g, ' ').trim();
  let tokens = t.split(' ').filter(w => w && !/^\d+$/.test(w) && !/^[\/'-]+$/.test(w));
  tokens = stripBrands(tokens);
  let words = expandAbbrev(tokens).map(w => w.replace(/^'|'$/g, '')).filter(Boolean);
  while (words.length > 1 && words[words.length - 1].length === 1) words.pop();   // trailing tax flags
  words = words.filter((w, i) => !(w.length === 1 && w !== '&' && i > 0));
  words = words.filter((w, i) => w !== words[i - 1]);                               // "milk milk"
  const expanded = words.join(' ').replace(/\s+/g, ' ').trim();
  if (!/[a-z]{3,}/.test(expanded)) return null;
  return { expanded, size };
}

function readableShare(expanded: string): number {
  const ws = expanded.split(' ').filter(w => /[a-z]/.test(w));
  if (!ws.length) return 0;
  const known = ws.filter(w => VOCAB.has(w) || VOCAB.has(w.replace(/s$/, '')) || KNOWN_EXTRA.has(w) || Object.values(WORDS).some(v => v.split(' ').includes(w)));
  return known.length / ws.length;
}
const KNOWN_EXTRA = new Set(['organic', 'whole', 'large', 'fresh', 'boneless', 'skinless', 'sliced', 'shredded', 'sharp', 'mild', 'original', 'plain', 'vanilla', 'unsweetened', 'reduced', 'fat', 'free', 'low', 'light', 'extra', 'virgin', 'natural', 'sweet', 'mixed', 'red', 'green', 'yellow', 'white', 'brown', 'baby', 'family', 'value', 'size', 'classic', 'creamy', 'crunchy', 'honey', 'roasted', 'salted', 'unsalted', 'smoked', 'thin', 'thick', 'cut', 'mini', 'jumbo', 'grade', '2%', '1%']);

export function parseReceipt(text: string, now = new Date()): ReceiptParse {
  const rows = text.split(/\r?\n/).map(r => r.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out: (ReceiptItem & { qtyFromLine?: boolean })[] = []; const skipped: string[] = [];
  let store: string | null = null, date: ISODate | null = null;
  let lastWasItem = false; let pending: QtyInfo | null = null;
  rows.forEach((row, idx) => {
    const t = row.toUpperCase();
    const tStore = t.replace(/[*.]/g, '');
    if (!store && idx < 12) for (const [re, nm] of STORE_NAMES) if (re.test(tStore)) { store = nm; break; }
    const d = findDate(t, now); if (d && !date) date = d;
    const skip = (why: string) => { skipped.push(`${why}: ${row}`); lastWasItem = false; };
    const q = qtyLine(t);
    if (q) {
      const prev = out[out.length - 1];
      if (lastWasItem && prev && !prev.qtyFromLine) { prev.qty = q.qty; prev.unit = q.unit; prev.qtyFromLine = true; }
      else pending = q;
      lastWasItem = false; return;
    }
    if (d || /\b\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?\b/.test(t)) return skip('date/time');
    if (NEG_PRICE.test(t)) return skip('coupon/discount');
    if (HARD_SKIP.test(t)) return skip('total/payment/info');
    if (/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(t)) return skip('phone');
    if (/^\d{1,6}\s+[A-Z0-9 .]+\b(ST|STREET|AVE|AVENUE|RD|ROAD|BLVD|DR|DRIVE|HWY|PKWY|LN|LANE|WAY|PLZ|PLAZA|CT|CIR|FWY|LOOP|TRL|PIKE)\b\.?/.test(t)) return skip('address');
    if (/\b[A-Z]{2}\s+\d{5}(-\d{4})?\b/.test(t) || /,\s*[A-Z]{2}\b/.test(t)) return skip('address');
    const bare = t.replace(PRICE_TAIL, '').trim();
    if (HEADERS.has(bare.replace(/[^A-Z& ]/g, '').trim()) || STORE_NAMES.some(([re]) => re.test(bare) && bare.replace(re, '').replace(/[^A-Z]/g, '').length < 4)) return skip('header');
    // price at end (possibly two: unit price + extended)
    let body = t, price: number | null = null;
    for (let i = 0; i < 2; i++) { const m = body.match(PRICE_TAIL); if (!m) break; if (price == null) price = num(m[1]); body = body.slice(0, m.index).trim(); }
    if (/^[\d\s.,$*#:\/-]+$/.test(body)) return skip('numbers only');
    const cleaned = cleanItemName(body);
    if (!cleaned) return skip('no name');
    // without a price, only keep rows that clearly look like groceries (OCR sometimes loses the price column)
    const m = matchGrocery(cleaned.expanded);
    if (price == null && (!m || m.score < 0.95)) return skip('no price, not a known grocery');
    const readable = readableShare(cleaned.expanded);
    let name: string;
    if (m && (readable < 0.6 || m.score >= 0.95 && cleaned.expanded.split(' ').length > 5)) name = cap(m.g.name);
    else name = cap(cleaned.expanded);
    const confidence: ReceiptItem['confidence'] = m && m.score >= 0.85 && readable >= 0.6 ? 'high' : m ? 'medium' : 'low';
    const item: ReceiptItem & { qtyFromLine?: boolean } = {
      raw: row, name, expanded: cleaned.expanded, match: m ? m.g.name : null, category: m ? m.g.cat : 'Other',
      qty: cleaned.size?.qty ?? 1, unit: cleaned.size?.unit ?? 'pcs', price, confidence, food: !m || m.g.cat !== 'Other',
    };
    // leading "2 X" / "2 @" style quantities on the item row itself
    const lead = body.match(/^(\d{1,2})\s*(?:X|@)\s+/); if (lead) { item.qty = Number(lead[1]); }
    if (pending) { item.qty = pending.qty; item.unit = pending.unit; pending = null; item.qtyFromLine = true; }
    out.push(item); lastWasItem = true;
  });
  // merge identical names (receipts repeat a line per unit)
  const merged: ReceiptItem[] = [];
  for (const it of out) {
    const same = merged.find(x => x.name.toLowerCase() === it.name.toLowerCase() && x.unit === it.unit);
    if (same && it.unit === 'pcs') { same.qty += it.qty; same.price = same.price != null && it.price != null ? Math.round((same.price + it.price) * 100) / 100 : same.price; }
    else if (same && it.unit !== 'pcs') { same.qty = Math.round((same.qty + it.qty) * 100) / 100; }
    else merged.push(it);
  }
  merged.forEach(m => delete (m as any).qtyFromLine);
  return { store, date, items: merged, skipped };
}
// re-exported for the review screen
export { GROCERIES, gwords };

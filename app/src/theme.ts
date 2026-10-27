export const C = {
  bg: '#F7F4EE', card: '#FFFFFF', ink: '#1F2A24', sub: '#66706A', faint: '#9AA39D', line: '#E6E1D8',
  primary: '#2F7D57', primarySoft: '#E3F1E9', accent: '#E07A3F', accentSoft: '#FCEBDF',
  red: '#C8402F', redSoft: '#FBE3DF', orange: '#D9822B', orangeSoft: '#FCEFD9', yellow: '#B58A00', yellowSoft: '#FBF3CF',
  green: '#2F7D57', greenSoft: '#E3F1E9', gray: '#7A817C', graySoft: '#EEEDEA',
};
import type { ExpiryStatus } from './logic';
export const statusColors: Record<ExpiryStatus, { fg: string; bg: string; label: string }> = {
  expired: { fg: C.red, bg: C.redSoft, label: 'Expired' },
  today: { fg: C.red, bg: C.redSoft, label: 'Today' },
  soon: { fg: C.orange, bg: C.orangeSoft, label: 'Soon' },
  week: { fg: C.yellow, bg: C.yellowSoft, label: 'This week' },
  ok: { fg: C.green, bg: C.greenSoft, label: 'Fresh' },
  none: { fg: C.gray, bg: C.graySoft, label: 'No date' },
};
export const CAT_EMOJI: Record<string, string> = {
  Produce: '🥕', 'Meat & Fish': '🍗', 'Dairy & Eggs': '🥚', Bakery: '🍞', Pantry: '🥫', Canned: '🥫', Frozen: '🧊', Spices: '🧂', Snacks: '🍪', Drinks: '🧃', Condiments: '🫙', Other: '🛒',
  Beef: '🥩', Breakfast: '🍳', Chicken: '🍗', Dessert: '🍰', Goat: '🐐', Lamb: '🍖', Miscellaneous: '🍲', Pasta: '🍝', Pork: '🥓', Seafood: '🐟', Side: '🥗', Starter: '🥟', Vegan: '🌱', Vegetarian: '🥦',
};

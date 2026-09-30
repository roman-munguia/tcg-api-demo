// The demo data for Glyphwild, an original, made-up trading card game.
//
// On the Shattered Isles, duelists called Scribes ink living glyphs onto cards and summon them to battle.
// Every glyph belongs to one or two elements (Ember, Tide, Gale, Stone, Lumen, Umbra) and is a
// Creature, Spell, Relic or Terrain. dropRate is the chance of pulling the card from a booster pack.
//
// Ids and timestamps are FIXED so that docs, exercises and tests can rely on them after every reset.

export const cardId = (n) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const deckId = (n) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A well-formed card id that never exists: use it to practise 404. */
export const MISSING_CARD_ID = cardId(999);
/** A well-formed deck id that never exists. */
export const MISSING_DECK_ID = deckId(999);

const minute = (n) => String(n).padStart(2, '0');
const slug = (name) => name.toLowerCase().replace(/&/g, 'and').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// [name, attributes, dropRate, description]
const CARDS = [
  ['Cinderwing Drake', { type: 'Creature', element: 'Ember', cost: 4, points: 5, rarity: 'Rare', keywords: ['Flying'] }, 0.06,
    'Flying. When it enters, deal 1 damage to each Gale creature.'],
  ['Ash & Ember Phoenix', { type: 'Creature', element: 'Ember', cost: 6, points: 7, rarity: 'Mythic', keywords: ['Flying', 'Rebirth'], legendary: true }, 0.015,
    'Flying. Rebirth: when this card is destroyed, return it to your hand at the start of your next turn.'],
  ['Cinder Imp', { type: 'Creature', element: 'Ember', cost: 1, points: 1, rarity: 'Common', keywords: ['Swift'] }, 0.42,
    'Swift: it can attack the turn it is summoned.'],
  ['Flare Volley', { type: 'Spell', element: 'Ember', cost: 2, rarity: 'Common', keywords: ['Instant'] }, 0.38,
    'Instant. Deal 2 damage split as you choose between up to two targets.'],
  ['Emberforge Anvil', { type: 'Relic', element: 'Ember', cost: 3, rarity: 'Uncommon' }, 0.16,
    'Your Ember creatures get +1 points while you control this relic.'],
  ['Tidecaller Nerissa', { type: 'Creature', element: 'Tide', cost: 5, points: 4, rarity: 'Rare', keywords: ['Summon'], legendary: true }, 0.05,
    'Summon: when it enters, put a Tide creature with cost 2 or less from your deck into play.'],
  ['Riptide Lancer', { type: 'Creature', element: 'Tide', cost: 3, points: 3, rarity: 'Common' }, 0.35,
    'A reliable front-line fighter of the reef guard.'],
  ['Sea-Glass Serpent', { type: 'Creature', element: ['Tide', 'Lumen'], cost: 4, points: 4, rarity: 'Uncommon', keywords: ['Ward'] }, 0.14,
    'Ward: the first spell that targets this card each turn has no effect. Counts as Tide and Lumen.'],
  ['Undercurrent Snare', { type: 'Spell', element: 'Tide', cost: 2, rarity: 'Common', keywords: ['Instant'] }, 0.4,
    'Instant. Return an attacking creature to its owner\'s hand.'],
  ['Tidal Archive', { type: 'Terrain', element: 'Tide', cost: 0, rarity: 'Uncommon' }, 0.18,
    'At the start of your turn, look at the top card of your deck.'],
  ['Galewing Roc', { type: 'Creature', element: 'Gale', cost: 5, points: 5, rarity: 'Uncommon', keywords: ['Flying'] }, 0.13,
    'Flying. It can only be blocked by creatures with Flying.'],
  ['Zéphyr Kite', { type: 'Creature', element: 'Gale', cost: 1, points: 1, rarity: 'Common', keywords: ['Flying', 'Swift'] }, 0.44,
    'Flying, Swift. Light as a breeze and just as hard to catch.'],
  ['Skyward Spire', { type: 'Terrain', element: 'Gale', cost: 0, rarity: 'Rare' }, 0.07,
    'Creatures with Flying cost 1 less to summon.'],
  ['Stoneheart Golem', { type: 'Creature', element: 'Stone', cost: 6, points: 8, rarity: 'Rare', keywords: ['Guard'] }, 0.06,
    'Guard: enemies must attack this creature first.'],
  ['Quarry Troll', { type: 'Creature', element: 'Stone', cost: 3, points: 4, rarity: 'Common', keywords: ['Guard'] }, 0.36,
    'Guard. It loses 1 points at the end of every turn in which it was not attacked.'],
  ['Rootbound Titan', { type: 'Creature', element: 'Stone', cost: 8, points: 9, rarity: 'Mythic', keywords: ['Guard', 'Trample'], legendary: true }, 0.01,
    'Guard, Trample. The oldest glyph on the Isles; it has never been moved.'],
  ['Warden\'s Oath', { type: 'Spell', element: 'Stone', cost: 1, rarity: 'Uncommon', keywords: ['Instant'] }, 0.17,
    'Instant. A creature you control gains Guard and +2 points until end of turn.'],
  ['Dawnbreaker Seraph', { type: 'Creature', element: 'Lumen', cost: 5, points: 5, rarity: 'Rare', keywords: ['Flying', 'Ward'] }, 0.05,
    'Flying, Ward. When it enters, restore 3 health to your Scribe.'],
  ['Lumen Wisp', { type: 'Creature', element: 'Lumen', cost: 1, points: 1, rarity: 'Common' }, 0.41,
    'When it is destroyed, draw a card.'],
  ['Bram\'s Lantern', { type: 'Relic', element: 'Lumen', cost: 2, rarity: 'Uncommon' }, 0.15,
    'Stealth creatures your opponent controls lose Stealth.'],
  ['Umbral Stalker', { type: 'Creature', element: 'Umbra', cost: 3, points: 3, rarity: 'Uncommon', keywords: ['Stealth'] }, 0.16,
    'Stealth: it cannot be targeted until it attacks.'],
  ['Nightveil Moth', { type: 'Creature', element: 'Umbra', cost: 2, points: 2, rarity: 'Common', keywords: ['Flying', 'Stealth'] }, 0.39,
    'Flying, Stealth. Drawn to lanterns, feared by Scribes.'],
  ['Eclipse Rite', { type: 'Spell', element: ['Lumen', 'Umbra'], cost: 4, rarity: 'Rare' }, 0.06,
    'Destroy a creature with 4 or more points. Its owner draws a card.'],
  ['Mirror & Mist', { type: 'Spell', element: ['Tide', 'Umbra'], cost: 3, rarity: 'Uncommon', keywords: ['Instant'] }, 0.12,
    'Instant. Copy target spell. You may choose new targets for the copy.'],
  ['Wandering Glyph', { type: 'Creature', cost: 2, points: 2, rarity: 'Common' }, 0.3,
    'A glyph that has not chosen an element yet. It fits in any deck.'],
];

export const SEED_CARDS = CARDS.map(([name, attributes, dropRate, description], i) => {
  const at = `2026-01-01T00:${minute(i + 1)}:00.000Z`;
  return {
    id: cardId(i + 1),
    name,
    description,
    imageUrl: `https://images.glyphwild.example/cards/${slug(name)}.png`,
    attributes,
    dropRate,
    createdAt: at,
    updatedAt: at,
  };
});

// [name, theme, difficulty, description, [[card number, quantity], ...]]
const DECKS = [
  ['Ashes & Embers', 'Aggressive Ember burn', 'beginner',
    'Cheap Ember creatures and burn spells that try to win before turn six. A forgiving first deck.',
    [[3, 3], [4, 3], [1, 2], [5, 1], [2, 1]]],
  ['Tidebound Control', 'Tide control and card draw', 'advanced',
    'Bounce attackers, draw cards and win late with Tidecaller Nerissa. Rewards patience and planning.',
    [[7, 3], [9, 3], [8, 2], [10, 2], [24, 2], [6, 1]]],
  ['Gale Force Rush', 'Fast Gale fliers', 'intermediate',
    'Fliers that attack over the top. You must judge when to race and when to hold back.',
    [[12, 3], [11, 2], [13, 1], [1, 1]]],
  ['Stonewall Fortress', 'Stone defence', 'beginner',
    'Big Guard creatures that make attacking you painful. Hard to misplay.',
    [[15, 3], [17, 3], [14, 2], [16, 1]]],
  ['Twilight Paradox', 'Lumen and Umbra combo', 'expert',
    'Light and shadow cards that only work well together. Many decisions every turn.',
    [[19, 3], [22, 3], [18, 2], [21, 2], [23, 2], [20, 1], [8, 1]]],
  ['Blank Grimoire', 'Empty starter to fill in', 'beginner',
    'An empty deck for practising PUT: add cards and watch totalCards change.',
    []],
];

export const SEED_DECKS = DECKS.map(([name, theme, difficulty, description, cards], i) => {
  const at = `2026-01-02T00:${minute(i + 1)}:00.000Z`;
  return {
    id: deckId(i + 1),
    name,
    theme,
    description,
    difficulty,
    cards: cards.map(([n, quantity]) => ({ cardId: cardId(n), quantity })),
    createdAt: at,
    updatedAt: at,
  };
});

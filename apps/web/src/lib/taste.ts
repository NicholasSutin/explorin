/**
 * The taste vocabulary shared by onboarding, the planner and settings: broad interests (step 1), who the person
 * plans for, and the tier-list catalog (step 2) with its S+…NO grades. Audience ("for teens", "for families"…)
 * is asked once as a multi-select instead of graded, since "For older adults: NO" reads badly as a grade.
 */

export const INTERESTS = [
	'Nature',
	'Art & culture',
	'Food & drink',
	'Coffee & sweets',
	'History',
	'Architecture',
	'Nightlife',
	'Shopping',
	'Hidden gems',
	'Slow moments',
	'Something active',
	'Photography'
] as const;
export type Interest = (typeof INTERESTS)[number];

export const AUDIENCES = [
	'Teens',
	'Families with kids',
	'Young adults',
	'35–60s',
	'Older adults'
] as const;
export type Audience = (typeof AUDIENCES)[number];

export const GRADES = ['S+', 'A+', 'A', 'B', 'C', 'NO'] as const;
export type Grade = (typeof GRADES)[number];
/** How strongly a grade pulls a plan toward (or away from) a category. */
export const GRADE_WEIGHT: Record<Grade, number> = { 'S+': 5, 'A+': 4, A: 3, B: 2, C: 1, NO: -3 };

export type Cluster = 'food' | 'outdoors' | 'culture' | 'shopping' | 'vibe' | 'company';

export interface Category {
	id: string;
	name: string;
	cluster: Cluster;
	/** Interests that make this card worth asking about. */
	boostedBy: Interest[];
}

export const CATEGORIES: Category[] = [
	{
		id: 'urban-parks',
		name: 'Urban parks',
		cluster: 'outdoors',
		boostedBy: ['Nature', 'Slow moments']
	},
	{
		id: 'nature-hikes',
		name: 'Nature & hikes',
		cluster: 'outdoors',
		boostedBy: ['Nature', 'Something active']
	},
	{
		id: 'city-walks',
		name: 'City walks',
		cluster: 'outdoors',
		boostedBy: ['Architecture', 'History', 'Something active', 'Photography']
	},
	{
		id: 'high-up',
		name: 'High up & skyscrapers',
		cluster: 'outdoors',
		boostedBy: ['Architecture', 'Photography']
	},
	{ id: 'restaurants', name: 'Restaurants', cluster: 'food', boostedBy: ['Food & drink'] },
	{ id: 'small-bites', name: 'Small bites', cluster: 'food', boostedBy: ['Food & drink'] },
	{ id: 'pastries', name: 'Pastries', cluster: 'food', boostedBy: ['Coffee & sweets'] },
	{
		id: 'coffee-shops',
		name: 'Coffee shops',
		cluster: 'food',
		boostedBy: ['Coffee & sweets', 'Slow moments']
	},
	{ id: 'fast-food', name: 'Fast food', cluster: 'food', boostedBy: ['Food & drink'] },
	{ id: 'museums', name: 'Museums', cluster: 'culture', boostedBy: ['Art & culture', 'History'] },
	{
		id: 'famous-attractions',
		name: 'Famous attractions',
		cluster: 'culture',
		boostedBy: ['History', 'Architecture']
	},
	{
		id: 'street-performers',
		name: 'Street performers',
		cluster: 'culture',
		boostedBy: ['Art & culture', 'Nightlife']
	},
	{
		id: 'hosted-tours',
		name: 'Hosted tours',
		cluster: 'culture',
		boostedBy: ['History', 'Art & culture']
	},
	{ id: 'shopping', name: 'Shopping', cluster: 'shopping', boostedBy: ['Shopping'] },
	{
		id: 'clothes-shopping',
		name: 'Clothes shopping',
		cluster: 'shopping',
		boostedBy: ['Shopping']
	},
	{ id: 'gift-shopping', name: 'Gift shopping', cluster: 'shopping', boostedBy: ['Shopping'] },
	{
		id: 'cheap',
		name: 'Cheap experiences',
		cluster: 'vibe',
		boostedBy: ['Food & drink', 'Hidden gems']
	},
	{
		id: 'upscale',
		name: 'Upscale experiences',
		cluster: 'vibe',
		boostedBy: ['Food & drink', 'Nightlife']
	},
	{
		id: 'fast-paced',
		name: 'Fast-paced days',
		cluster: 'vibe',
		boostedBy: ['Something active', 'Nightlife']
	},
	{
		id: 'slow-relaxing',
		name: 'Slow & relaxing',
		cluster: 'vibe',
		boostedBy: ['Slow moments', 'Nature', 'Coffee & sweets']
	},
	{
		id: 'quiet-areas',
		name: 'Quiet areas',
		cluster: 'vibe',
		boostedBy: ['Slow moments', 'Nature', 'Hidden gems']
	},
	{
		id: 'lively-areas',
		name: 'Always something going on',
		cluster: 'vibe',
		boostedBy: ['Nightlife', 'Something active']
	},
	{
		id: 'niche',
		name: 'Niche experiences',
		cluster: 'vibe',
		boostedBy: ['Hidden gems', 'Art & culture']
	},
	{ id: 'hidden-gems', name: 'Hidden gems', cluster: 'vibe', boostedBy: ['Hidden gems'] },
	{ id: 'underrated', name: 'Underrated spots', cluster: 'vibe', boostedBy: ['Hidden gems'] },
	{
		id: 'world-famous',
		name: 'World-famous',
		cluster: 'vibe',
		boostedBy: ['Architecture', 'Photography', 'History']
	},
	{
		id: 'social-media-worthy',
		name: 'Social-media worthy',
		cluster: 'vibe',
		boostedBy: ['Photography']
	},
	{
		id: 'group-activities',
		name: 'Group activities',
		cluster: 'company',
		boostedBy: ['Nightlife', 'Something active']
	},
	{ id: 'couples-activities', name: 'Couples activities', cluster: 'company', boostedBy: [] },
	{
		id: 'solo-dates',
		name: 'Solo dates',
		cluster: 'company',
		boostedBy: ['Slow moments', 'Coffee & sweets']
	},
	{ id: 'solo-activities', name: 'Solo activities', cluster: 'company', boostedBy: [] }
];

export const CATEGORY = new Map(CATEGORIES.map((c) => [c.id, c]));
export const isCategory = (id: string) => CATEGORY.has(id);

/** Card image, sourced under the Unsplash/Pexels licenses; credits in taste-credits.json. */
export const categoryImage = (id: string) => `/taste/${id}.webp`;

/**
 * Opposite ends of the same axis. Asking one side is enough to learn the axis, so narrowing never spends two
 * cards on a pair, and each pair gets asked at least once unless the batch is tiny.
 */
const AXES: [string, string][] = [
	['cheap', 'upscale'],
	['fast-paced', 'slow-relaxing'],
	['quiet-areas', 'lively-areas'],
	['hidden-gems', 'world-famous']
];

/** How many cards the first round shows: enough signal for the planner, short enough to finish in a minute. */
export const FIRST_ROUND = 10;

/**
 * Deterministic narrowing, used directly when AI is unavailable and as the ranking the AI pick is checked
 * against. Scores each card by the interests that boost it, keeps clusters balanced (at least one food,
 * outdoors and culture card, at most four from any cluster), and asks each vibe axis once.
 */
export function rankCategories(interests: string[], exclude: string[] = []): string[] {
	const skip = new Set(exclude);
	const score = (c: Category) => c.boostedBy.filter((i) => interests.includes(i)).length;
	const pool = CATEGORIES.filter((c) => !skip.has(c.id))
		.map((c, i) => ({ c, s: score(c), i }))
		.sort((a, b) => b.s - a.s || a.i - b.i)
		.map((x) => x.c);
	const out: Category[] = [];
	const perCluster = new Map<Cluster, number>();
	const axisAsked = new Set<number>();
	const take = (c: Category) => {
		if (out.includes(c)) return;
		const axis = AXES.findIndex((pair) => pair.includes(c.id));
		if (axis >= 0 && axisAsked.has(axis)) return;
		if ((perCluster.get(c.cluster) ?? 0) >= 4) return;
		out.push(c);
		perCluster.set(c.cluster, (perCluster.get(c.cluster) ?? 0) + 1);
		if (axis >= 0) axisAsked.add(axis);
	};
	for (const cluster of ['food', 'outdoors', 'culture'] as Cluster[]) {
		const first = pool.find((c) => c.cluster === cluster);
		if (first) take(first);
	}
	for (const c of pool) take(c);
	// Anything skipped for balance comes last, so "grade more" can still reach every card.
	for (const c of pool) if (!out.includes(c)) out.push(c);
	return out.map((c) => c.id);
}

export type Grades = Partial<Record<string, Grade>>;

/** Short phrases kept from trip notes ("likes long walks between stops"): caps per trip, overall and per phrase. */
export const LEARNED_PER_TRIP = 2;
export const LEARNED_MAX = 8;
export const LEARNED_CHARS = 60;

export interface TasteInput {
	name?: string | null;
	blurb: string;
	interests: string[];
	audience: string[];
	grades: Grades;
	learned?: string[];
}

/**
 * Plain-language digest of a taste profile: what the planner prompt reads, and what gets embedded for
 * "people like you". Deterministic so the same answers always embed the same way.
 */
export function tasteSummary(t: TasteInput): string {
	const by = (want: Grade[]) =>
		Object.entries(t.grades)
			.filter(([, g]) => g && want.includes(g))
			.map(([id, g]) => `${CATEGORY.get(id)?.name ?? id} (${g})`);
	const parts = [
		t.blurb.trim() && `In their words: "${t.blurb.trim()}".`,
		t.interests.length && `Interests: ${t.interests.join(', ')}.`,
		t.audience.length && `Usually plans for: ${t.audience.join(', ')}.`,
		by(['S+', 'A+']).length && `Loves: ${by(['S+', 'A+']).join(', ')}.`,
		by(['A', 'B']).length && `Likes: ${by(['A', 'B']).join(', ')}.`,
		by(['C']).length && `Lukewarm on: ${by(['C']).join(', ')}.`,
		by(['NO']).length && `Avoid: ${by(['NO']).join(', ')}.`,
		t.learned?.length && `Learned from their trips: ${t.learned.join('; ')}.`
	];
	return parts.filter(Boolean).join(' ');
}

/** One-tap plan prompts keyed by category, so the home screen's starters follow the person's top grades. */
const STARTERS: Record<string, string> = {
	'coffee-shops': 'A slow coffee crawl with long walks in between',
	pastries: 'A pastry hunt, then somewhere green to eat them',
	museums: 'One great museum and a quiet lunch nearby',
	'high-up': 'Skyline views, then somewhere cozy to sit',
	'hidden-gems': 'Hidden gems only, nothing from a postcard',
	underrated: 'Underrated spots locals actually go to',
	'urban-parks': 'A lazy park afternoon with good snacks',
	'city-walks': 'A long walk through a neighborhood I don’t know',
	'small-bites': 'A small-bites crawl, nothing over $15',
	'street-performers': 'Somewhere lively with music on the street',
	shopping: 'Browse independent shops and find something good',
	'clothes-shopping': 'Vintage and indie clothing shops, then coffee',
	'gift-shopping': 'Find a great gift, then treat myself',
	'nature-hikes': 'Get out of the concrete: a real trail',
	restaurants: 'A great sit-down meal and a stroll after',
	'lively-areas': 'Somewhere with energy tonight',
	'quiet-areas': 'Somewhere quiet to read and wander',
	cheap: 'A whole day out for under $30',
	upscale: 'A little luxury: a beautiful spot and a fancy drink',
	niche: 'The weirdest little places in the city',
	'famous-attractions': 'The classics, but timed to skip the crowds',
	'world-famous': 'The famous stuff, done right',
	'social-media-worthy': 'The most photogenic spots, golden hour',
	'slow-relaxing': 'A slow, easy day with lots of sitting',
	'fast-paced': 'Pack it in: as much as I can see today',
	'solo-dates': 'A solo date: a gallery, a book, a good drink',
	'couples-activities': 'A date day that isn’t dinner and a movie',
	'group-activities': 'Something fun for a group of friends',
	'solo-activities': 'A solo adventure with a few surprises',
	'hosted-tours': 'Learn something: a guided walk or tour',
	'fast-food': 'Classic cheap eats and a walk to burn them off'
};

/** Three starters: the person's highest grades first, then gentle defaults. */
export function startersFor(grades: Grades): string[] {
	const ranked = Object.entries(grades)
		.filter(([, g]) => g && GRADE_WEIGHT[g] >= 3)
		.sort(([, a], [, b]) => GRADE_WEIGHT[b!] - GRADE_WEIGHT[a!])
		.map(([id]) => STARTERS[id])
		.filter(Boolean);
	const defaults = [
		'Surprise me with a really good afternoon',
		'A rainy-day plan that still feels like an adventure'
	];
	return [...new Set([...ranked, ...defaults])].slice(0, 3);
}

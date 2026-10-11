export interface Experience {
	id: string;
	title: string;
	location: string;
	description: string;
	url: string;
	category: string;
	reason: string;
}
export interface Adventure {
	id: string;
	experience: Experience;
	startedAt: string;
	finishedAt: string;
	reflections: string[];
	photos: string[];
	title: string;
	summary: string;
	shareInsights: boolean;
	aiGenerated: boolean;
}
export const HISTORY_KEY = 'explorin.history.v1';
export const demoExperiences: Experience[] = [
	{
		id: 'high-line',
		title: 'A little above the everyday',
		location: 'The High Line · New York City',
		description:
			'Follow an elevated garden through the city. Pause for public art, unexpected views, and a moment to yourself.',
		url: 'https://www.thehighline.org/',
		category: 'Nature & art',
		reason: 'An easygoing mix of green space, creativity, and wandering.'
	},
	{
		id: 'brooklyn',
		title: 'Chase the waterfront light',
		location: 'Brooklyn Bridge Park · New York City',
		description:
			'Wander the waterfront paths and find a skyline spot for a slow afternoon. Bring a camera and leave room for a detour.',
		url: 'https://www.brooklynbridgepark.org/',
		category: 'Outdoors',
		reason: 'Open skies and a fresh perspective, without leaving the city.'
	},
	{
		id: 'museum',
		title: 'Get wonderfully lost in art',
		location: 'The Metropolitan Museum of Art · New York City',
		description:
			'Pick one gallery that catches your eye and let curiosity lead. Check the official site for admission and opening hours.',
		url: 'https://www.metmuseum.org/',
		category: 'Culture',
		reason: 'A thoughtful escape for a curious, creative afternoon.'
	}
];

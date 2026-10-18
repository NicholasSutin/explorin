/** Database-facing shapes shared by the server and the trip screens. */

export type Source = 'user' | 'public_review' | 'tripadvisor_review' | 'yelp_review' | 'seed';

export interface Place {
	id: string;
	google_place_id: string | null;
	name: string;
	kind: string | null;
	lat: number | null;
	lng: number | null;
	tags: string[];
	notes: string | null;
	maps_url: string | null;
}

export function sourceLabel(s: Source): string {
	switch (s) {
		case 'user':
			return 'From someone like you';
		case 'tripadvisor_review':
			return 'From Tripadvisor reviews';
		case 'yelp_review':
			return 'From Yelp reviews';
		case 'public_review':
			return 'From public reviews';
		case 'seed':
			return 'From seed notes';
	}
}

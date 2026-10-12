import { APP_URL } from '$app/env/private';

/**
 * The URL "Open the app" should point at, or undefined when there is nowhere to send people yet.
 * Undefined when APP_URL is unset, malformed, or points back at this site: explorin.app serves the
 * landing page, so a link there would just reload the page.
 */
export function publicAppUrl(site: URL): string | undefined {
	if (!APP_URL) return undefined;
	try {
		const target = new URL(APP_URL);
		const host = (u: URL) => u.hostname.replace(/^www\./, '');
		if (host(target) === host(site)) {
			console.warn(`[config] APP_URL (${APP_URL}) is this site; "Open the app" hidden`);
			return undefined;
		}
		return target.href;
	} catch {
		return undefined;
	}
}

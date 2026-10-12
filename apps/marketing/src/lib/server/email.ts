/**
 * Welcome email through Resend's HTTP API. Optional: without RESEND_API_KEY nothing is sent and
 * joining still succeeds. A delivery failure is logged, never shown to the visitor.
 */
import { RESEND_API_KEY, WAITLIST_FROM_EMAIL, APP_URL } from '$app/env/private';

export const emailConfigured = () => Boolean(RESEND_API_KEY);

export async function sendWelcome(to: string): Promise<boolean> {
	if (!RESEND_API_KEY) return false;
	const text = [
		'You are on the Explorin waitlist.',
		'',
		'Explorin is opening city by city, New York first. We will send one email when your city opens, and nothing else.',
		'',
		`In the meantime, the NYC demo is open: ${APP_URL}`,
		'',
		'go somewhere. feel something.',
		'Explorin'
	].join('\n');
	try {
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				from: WAITLIST_FROM_EMAIL,
				to: [to],
				subject: 'You are on the Explorin waitlist',
				text,
				html: text
					.split('\n\n')
					.map(
						(p) =>
							`<p>${p.replace(/\n/g, '<br>').replace(APP_URL, `<a href="${APP_URL}">${APP_URL}</a>`)}</p>`
					)
					.join('')
			}),
			signal: AbortSignal.timeout(8000)
		});
		if (!res.ok)
			console.warn('[email] resend responded', res.status, (await res.text()).slice(0, 200));
		return res.ok;
	} catch (e) {
		console.warn('[email] resend unreachable', (e as Error).message);
		return false;
	}
}

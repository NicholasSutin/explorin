/**
 * Account emails through Resend's HTTP API (no SDK). Verification and password-reset links come from
 * better-auth; this module only formats and sends them. Without RESEND_API_KEY the link is logged in
 * dev so sign-up can still be completed locally, and the send is reported as failed in production.
 */
import { dev } from '$app/env';
import { AUTH_FROM_EMAIL, RESEND_API_KEY } from '$app/env/private';

export const emailConfigured = () => Boolean(RESEND_API_KEY);

const escape = (s: string) =>
	s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Plain paragraphs to a minimal HTML body; the one URL becomes a link. */
function toHtml(paragraphs: string[], url: string) {
	return paragraphs
		.map((p) => {
			const safe = escape(p);
			const link = `<a href="${escape(url)}">${escape(url)}</a>`;
			return `<p style="font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1b1b1b;margin:0 0 16px">${safe.replace(escape(url), link)}</p>`;
		})
		.join('');
}

async function send(to: string, subject: string, paragraphs: string[], url: string) {
	const text = paragraphs.join('\n\n');
	if (!RESEND_API_KEY) {
		if (dev) console.info(`[email] (not sent, RESEND_API_KEY unset) to ${to}: ${subject}\n${url}`);
		else console.error('[email] RESEND_API_KEY unset; could not send', subject);
		return dev;
	}
	try {
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				from: AUTH_FROM_EMAIL,
				to: [to],
				subject,
				text,
				html: toHtml(paragraphs, url)
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

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there';

export const sendVerificationEmail = (to: string, name: string, url: string) =>
	send(
		to,
		'Confirm your email for Explorin',
		[
			`Hi ${firstName(name)},`,
			`One tap and your Explorin account is ready: ${url}`,
			'The link works for one hour. If you did not create an account, you can ignore this email.',
			'go somewhere. feel something.\nExplorin'
		],
		url
	);

export const sendPasswordResetEmail = (to: string, name: string, url: string) =>
	send(
		to,
		'Reset your Explorin password',
		[
			`Hi ${firstName(name)},`,
			`Choose a new password here: ${url}`,
			'The link works for one hour. If you did not ask for this, your password is unchanged and you can ignore this email.',
			'Explorin'
		],
		url
	);

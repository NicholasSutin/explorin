<script lang="ts">
	/**
	 * Cloudflare Turnstile widget, rendered explicitly so the page controls its lifecycle.
	 * Place it inside a <form>: Turnstile adds a hidden `cf-turnstile-response` input next to it.
	 * Tokens are single-use, so the parent calls `reset()` after any submission that did not
	 * navigate away. `onToken` fires with the token (or '' when it expires or errors).
	 * https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
	 */
	import { onMount } from 'svelte';
	import { TURNSTILE_SITE_KEY } from '$app/env/public';

	let {
		action,
		onToken = () => {},
		reset = $bindable<() => void>(() => {})
	}: { action: string; onToken?: (token: string) => void; reset?: () => void } = $props();

	type Turnstile = {
		render: (el: HTMLElement, opts: Record<string, unknown>) => string;
		reset: (id: string) => void;
		remove: (id: string) => void;
	};
	const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
	let container: HTMLDivElement;
	let widgetId: string | undefined;
	let failed = $state(false);

	const api = () => (window as unknown as { turnstile?: Turnstile }).turnstile;

	function loadScript(): Promise<void> {
		if (api()) return Promise.resolve();
		return new Promise((resolve, reject) => {
			let script = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
			if (!script) {
				script = document.createElement('script');
				script.src = SRC;
				script.async = true;
				document.head.appendChild(script);
			}
			script.addEventListener('load', () => resolve(), { once: true });
			script.addEventListener('error', () => reject(new Error('Turnstile blocked')), {
				once: true
			});
			// Catch up if the load event fired before this listener attached.
			const poll = setInterval(() => {
				if (api()) {
					clearInterval(poll);
					resolve();
				}
			}, 100);
			setTimeout(() => {
				clearInterval(poll);
				reject(new Error('Turnstile timed out'));
			}, 30_000);
		});
	}

	onMount(() => {
		if (!TURNSTILE_SITE_KEY) {
			failed = true;
			return;
		}
		let gone = false;
		loadScript()
			.then(() => {
				if (gone) return;
				widgetId = api()!.render(container, {
					sitekey: TURNSTILE_SITE_KEY,
					action,
					size: 'flexible',
					theme: 'light',
					callback: (token: string) => onToken(token),
					'expired-callback': () => onToken(''),
					'timeout-callback': () => onToken(''),
					'error-callback': () => {
						onToken('');
						failed = true;
					}
				});
			})
			.catch(() => (failed = true));
		reset = () => {
			onToken('');
			if (widgetId) api()?.reset(widgetId);
		};
		return () => {
			gone = true;
			if (widgetId) api()?.remove(widgetId);
			widgetId = undefined; // a reset after unmount (form replaced by the thank-you) is a no-op
		};
	});
</script>

<div class="turnstile" bind:this={container}></div>
{#if failed}
	<p class="turnstile-help" role="alert">
		The security check could not load. Disable content blockers for this page and try again.
	</p>
{/if}

<style>
	.turnstile {
		min-height: 65px;
		width: 100%;
	}
	.turnstile-help {
		font-size: 13px;
		color: #a33d1c;
		margin: 8px 0 0;
	}
</style>

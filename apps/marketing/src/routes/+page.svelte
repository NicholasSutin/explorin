<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let submitting = $state(false);
	const done = $derived(form?.status === 'added' || form?.status === 'already');
</script>

<svelte:head>
	<title>Explorin · Find your next little adventure</title>
	<meta
		name="description"
		content="Tell Explorin what kind of day you're craving. It finds real places, verified on the map, shows how people like you felt there, and helps you keep the memory."
	/>
	<meta property="og:title" content="Explorin · Find your next little adventure" />
	<meta
		property="og:description"
		content="Less scrolling, more stories. Real places picked for you, and a scrapbook to keep them."
	/>
	<meta property="og:image" content="/brand/og-card-green-1200.png" />
</svelte:head>

<div class="wrap">
	<header>
		<a href="#top" aria-label="Explorin home"
			><img src="/brand/lockup-horizontal-ink.svg" alt="explorin." width="180" height="28" /></a
		>
		<a class="button ghost" href={data.appUrl}>Open the app</a>
	</header>

	<section class="hero" id="top">
		<p class="eyebrow">Less scrolling. More stories.</p>
		<h1>Your next adventure<br />is closer than <em>you think.</em></h1>
		<p class="lede">
			A quiet corner. A new favorite. A day that feels like you. Tell us what you're craving, and
			let curiosity do the rest.
		</p>
		<div class="actions">
			<a class="button" href="#waitlist">Join the waitlist &#8600;</a>
			<a class="button ghost" href="#how">How it works</a>
		</div>
	</section>

	<section class="postcards" aria-label="Postcards">
		<figure class="postcard" style="--tilt: -2deg">
			<img src="/images/brooklyn-bridge.webp" alt="" width="800" height="600" loading="lazy" />
			<figcaption>dumbo, golden hour</figcaption>
		</figure>
		<figure class="postcard" style="--tilt: 1.5deg">
			<img src="/images/the-met-inside.webp" alt="" width="800" height="600" loading="lazy" />
			<figcaption>the met, a quiet wing</figcaption>
		</figure>
		<figure class="postcard" style="--tilt: -1deg">
			<img src="/images/people-running.webp" alt="" width="800" height="600" loading="lazy" />
			<figcaption>williamsburg bridge, 7am</figcaption>
		</figure>
	</section>
</div>

<section class="steps" id="how">
	<div class="wrap">
		<p class="eyebrow">How it works</p>
		<h2>Three steps. One good day.</h2>
		<ol>
			<li>
				<h3>Say what you're craving</h3>
				<p>
					"A rainy afternoon with art and really good coffee." Explorin searches the web, picks
					real, named places, checks each one on the map, and shows how people like you felt
					there.
				</p>
			</li>
			<li>
				<h3>Live your story</h3>
				<p>Start the adventure. Jot a thought or say it out loud. Add a few photos along the way.</p>
			</li>
			<li>
				<h3>Keep the feeling</h3>
				<p>
					Your notes and photos become a scrapbook you can download or share. Photos stay on your
					device.
				</p>
			</li>
		</ol>
	</div>
</section>

<div class="wrap">
	<section class="waitlist" id="waitlist">
		<img src="/brand/mark-orange.svg" alt="" width="56" height="56" />
		<h2>go somewhere. feel something.</h2>
		<p class="lede center">
			Explorin is opening city by city, New York first. Leave your email and we'll tell you when
			it's your turn.
		</p>
		{#if done}
			<p class="confirm" role="status">
				{form?.status === 'already'
					? 'You were already on the list. We have not forgotten you.'
					: 'You are on the list. See you out there.'}
			</p>
		{:else}
			<form
				method="POST"
				action="?/join"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<label class="sr-only" for="email">Email address</label>
				<input
					id="email"
					name="email"
					type="email"
					autocomplete="email"
					inputmode="email"
					required
					maxlength="254"
					placeholder="you@example.com"
					aria-describedby={form?.error ? 'waitlist-error' : undefined}
				/>
				<input type="hidden" name="source" value="landing" />
				<!-- Honeypot: hidden from people, filled by bots. -->
				<div class="hp" aria-hidden="true">
					<label for="website">Website</label>
					<input id="website" name="website" type="text" tabindex="-1" autocomplete="off" />
				</div>
				<button class="button" type="submit" disabled={submitting}>
					{submitting ? 'Adding you…' : 'Join the waitlist ↗'}
				</button>
			</form>
			{#if form?.error}<p class="error" id="waitlist-error" role="alert">{form.error}</p>{/if}
			<p class="fine">No spam, no sharing. One email when your city opens.</p>
		{/if}
	</section>

	<footer>
		<span>Built in New York at the AI Engineer NYC Hackathon, October 2026.</span>
		<span>No account. No tracking. Your memories stay with you.</span>
	</footer>
</div>

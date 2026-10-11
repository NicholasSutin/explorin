<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { toBlob } from 'html-to-image';
	import { HISTORY_KEY, type Experience, type Adventure } from '#lib/adventure';
	import { decodePhoto, isAcceptedPhoto, PHOTO_ACCEPT } from '#lib/heic';
	import './explorin.css';
	type Recognition = {
		lang: string;
		continuous: boolean;
		interimResults: boolean;
		onresult: ((e: { results: { transcript: string }[][] }) => void) | null;
		onerror: (() => void) | null;
		onend: (() => void) | null;
		start(): void;
		stop(): void;
	};
	let mounted = $state(false);
	let view = $state<'discover' | 'active' | 'finish' | 'scrapbook' | 'history'>('discover');
	let prompt = $state('');
	let location = $state('New York City');
	let interests = $state<string[]>(['Nature']);
	let experiences = $state<Experience[]>([]);
	let notice = $state('');
	let error = $state('');
	let busy = $state(false);
	let status = $state('');
	let selected = $state<Experience | null>(null);
	let startedAt = $state('');
	let reflections = $state<string[]>([]);
	let reflection = $state('');
	let photos = $state<string[]>([]);
	let history = $state<Adventure[]>([]);
	let scrapbook = $state<Adventure | null>(null);
	let shareInsights = $state(false);
	let useInsights = $state(false);
	let saved = $state(false);
	let scrapbookElement = $state<HTMLElement>();
	let recognition: Recognition | undefined;
	let speechSupported = $state(false);
	let listening = $state(false);
	const topics = [
		'Nature',
		'Art & culture',
		'Food',
		'Hidden gems',
		'Slow moments',
		'Something active'
	];
	onMount(() => {
		mounted = true;
		try {
			const stored: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
			if (Array.isArray(stored))
				history = stored
					.filter(
						(a) =>
							a &&
							typeof a.id === 'string' &&
							typeof a.title === 'string' &&
							a.experience &&
							Array.isArray(a.photos) &&
							a.photos.every(
								(p: unknown) =>
									typeof p === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(p)
							) &&
							Array.isArray(a.reflections)
					)
					.slice(0, 12);
		} catch {
			error = 'Your saved history could not be read. You can still create a new adventure.';
		}
		const ctor =
			(
				window as unknown as {
					SpeechRecognition?: new () => Recognition;
					webkitSpeechRecognition?: new () => Recognition;
				}
			).SpeechRecognition ||
			(window as unknown as { webkitSpeechRecognition?: new () => Recognition })
				.webkitSpeechRecognition;
		speechSupported = Boolean(ctor);
		if (ctor) {
			recognition = new ctor();
			recognition.lang = 'en-US';
			recognition.continuous = false;
			recognition.interimResults = false;
			recognition.onresult = (e) => {
				reflection = `${reflection} ${e.results[0][0].transcript}`.trim().slice(0, 2000);
			};
			recognition.onerror = () => {
				listening = false;
				error =
					'Voice input could not start. Allow microphone access or type your reflection below.';
			};
			recognition.onend = () => {
				listening = false;
			};
		}
		return () => recognition?.stop();
	});
	async function api<T>(path: string, body: unknown): Promise<T> {
		const res = await fetch(path, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(45000)
		});
		const data = (await res.json()) as { error?: string };
		if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
		return data as T;
	}
	async function discover(demo = false) {
		busy = true;
		error = '';
		notice = '';
		experiences = [];
		try {
			const data = await api<{ experiences: Experience[]; notice: string }>('/api/discover', {
				prompt: demo ? 'A curious afternoon' : prompt,
				location,
				interests,
				demo,
				insights: useInsights
					? history
							.filter((a) => a.shareInsights)
							.slice(0, 5)
							.map((a) => a.summary.slice(0, 500))
					: []
			});
			experiences = data.experiences;
			notice = data.notice;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Discovery failed. Please try again.';
		} finally {
			busy = false;
		}
	}
	function start(experience: Experience) {
		selected = experience;
		startedAt = new Date().toISOString();
		reflections = [];
		reflection = '';
		photos = [];
		shareInsights = false;
		saved = false;
		error = '';
		status = '';
		view = 'active';
		window.scrollTo(0, 0);
	}
	function addReflection() {
		if (reflection.trim() && reflections.length < 30) {
			reflections = [...reflections, reflection.trim()];
			reflection = '';
		}
	}
	function finish() {
		recognition?.stop();
		addReflection();
		view = 'finish';
		error = '';
		window.scrollTo(0, 0);
	}
	async function photoData(file: File): Promise<string> {
		if (!isAcceptedPhoto(file)) throw new Error('Choose JPG, PNG, WebP, or HEIC photos.');
		if (file.size > 15 * 1024 * 1024) throw new Error('Each photo must be smaller than 15 MB.');
		// Decodes HEIC in a worker when the browser cannot read it natively.
		const bitmap = await decodePhoto(file);
		const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		const context = canvas.getContext('2d');
		if (!context) {
			bitmap.close();
			throw new Error('Your browser could not process this photo.');
		}
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close();
		return canvas.toDataURL('image/jpeg', 0.72);
	}
	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files || []);
		error = '';
		if (files.length + photos.length > 4) {
			error = 'Choose up to four photos in total.';
			input.value = '';
			return;
		}
		busy = true;
		try {
			const converted = await Promise.all(files.map(photoData));
			photos = [...photos, ...converted];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not process the photos.';
		} finally {
			busy = false;
			input.value = '';
		}
	}
	function saveAdventure(adventure: Adventure) {
		const next = [adventure, ...history.filter((a) => a.id !== adventure.id)].slice(0, 12);
		try {
			localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
			history = next;
			saved = true;
			status = 'Saved to your history on this device.';
		} catch {
			saved = false;
			error =
				'Device storage is full or unavailable. Download your scrapbook now, or remove an older adventure and retry saving.';
		}
	}
	async function generate() {
		if (!selected || !photos.length) return;
		busy = true;
		error = '';
		status = '';
		try {
			const data = await api<{ title: string; summary: string; aiGenerated: boolean }>(
				'/api/scrapbook',
				{ title: selected.title, location: selected.location, reflections }
			);
			scrapbook = {
				id: crypto.randomUUID(),
				experience: selected,
				startedAt,
				finishedAt: new Date().toISOString(),
				reflections: [...reflections],
				photos: [...photos],
				title: data.title,
				summary: data.summary,
				aiGenerated: data.aiGenerated,
				shareInsights
			};
			view = 'scrapbook';
			saveAdventure(scrapbook);
			window.scrollTo(0, 0);
		} catch (e) {
			error =
				e instanceof Error
					? e.message
					: 'Could not create your scrapbook. Your photos and reflections are still here; please retry.';
		} finally {
			busy = false;
		}
	}
	async function exportScrapbook(share = false) {
		if (!scrapbook) return;
		busy = true;
		error = '';
		status = '';
		try {
			await tick();
			const blob = await toBlob(scrapbookElement!, {
				pixelRatio: 2,
				backgroundColor: '#fffaf0',
				cacheBust: false
			});
			if (!blob) throw new Error('Could not render the scrapbook.');
			const file = new File([blob], 'explorin-scrapbook.png', { type: 'image/png' });
			if (share && navigator.canShare?.({ files: [file] })) {
				await navigator.share({ files: [file], title: scrapbook.title });
				status = 'Scrapbook shared.';
			} else {
				const url = URL.createObjectURL(blob);
				const link = document.createElement('a');
				link.href = url;
				link.download = file.name;
				link.click();
				setTimeout(() => URL.revokeObjectURL(url), 1000);
				status = share
					? 'File sharing is unavailable in this browser. Your PNG was downloaded instead.'
					: 'Your scrapbook PNG is ready.';
			}
		} catch (e) {
			if (!(e instanceof DOMException && e.name === 'AbortError'))
				error = 'Could not export the scrapbook. Please try again.';
		} finally {
			busy = false;
		}
	}
	function removeAdventure(id: string) {
		const next = history.filter((a) => a.id !== id);
		try {
			localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
			history = next;
		} catch {
			error = 'Could not update device history.';
		}
	}
	function navigate(next: 'discover' | 'history') {
		recognition?.stop();
		view = next;
		error = '';
		status = '';
	}
</script>

<svelte:head
	><title>Explorin · Find your next little adventure</title><meta
		name="description"
		content="Discover experiences that feel like you. Capture the moments, and turn them into a personal adventure scrapbook."
	/></svelte:head
>
<div class="explorin">
	<header class="exp-header">
		<a class="brand" href="/" aria-label="Explorin home"
			><span class="brand-icon">&#10035;</span> explorin<span class="brand-dot">.</span></a
		>
		<nav aria-label="Main navigation">
			<button
				disabled={!mounted}
				class:current={view !== 'history'}
				onclick={() => navigate('discover')}>Explore</button
			><button
				disabled={!mounted}
				class:current={view === 'history'}
				onclick={() => navigate('history')}>My memories <span>{history.length}</span></button
			>
		</nav>
	</header>
	<div class="exp-content">
		{#if error}<div class="message error" role="alert">{error}</div>{/if}
		{#if status}<div class="message success" role="status">{status}</div>{/if}
		{#if view === 'discover'}
			<section class="hero">
				<div class="eyebrow">LESS SCROLLING. MORE STORIES.</div>
				<h1>Your next adventure<br />is closer than <em>you think.</em></h1>
				<p>
					A quiet corner. A new favorite. A day that feels like you.<br class="desktop-break" /> Tell
					us what you're craving, and let curiosity do the rest.
				</p>
				<div class="hero-art" aria-hidden="true">
					<div class="sun"></div>
					<div class="orbit"></div>
					<span class="art-star">&#10023;</span>
					<div class="hill hill-back"></div>
					<div class="hill hill-front"></div>
					<span class="art-caption">take the scenic route &#10035;</span>
				</div>
			</section>
			<section class="discovery-panel">
				<div class="panel-heading">
					<span class="step-badge">01</span>
					<h2>What would make today a good day?</h2>
				</div>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						discover();
					}}
				>
					<label for="prompt" class="sr-only">Describe your ideal experience</label><textarea
						id="prompt"
						bind:value={prompt}
						required
						minlength="3"
						maxlength="800"
						placeholder="I want a peaceful afternoon with a little art, a scenic walk, and somewhere to clear my head…"
					></textarea>
					<div class="location-row">
						<label for="city">&#8599; Exploring in</label><input
							id="city"
							bind:value={location}
							required
							minlength="2"
							maxlength="120"
							autocomplete="address-level2"
						/>
					</div>
					<p class="field-label">A few things you love <span>optional</span></p>
					<div class="chips">
						{#each topics as topic}<button
								type="button"
								class:chosen={interests.includes(topic)}
								aria-pressed={interests.includes(topic)}
								onclick={() =>
									(interests = interests.includes(topic)
										? interests.filter((i) => i !== topic)
										: [...interests, topic])}>{topic}</button
							>{/each}
					</div>
					{#if history.some((a) => a.shareInsights)}<label class="checkbox"
							><input type="checkbox" bind:checked={useInsights} /> Personalize with insights I chose
							to share from past adventures</label
						>{/if}
					<div class="discover-actions">
						<button class="primary" disabled={busy}
							>{busy ? 'Finding your kind of adventure…' : 'Find my adventure \u2197'}</button
						><button
							type="button"
							class="text-button"
							disabled={busy || !mounted}
							onclick={() => discover(true)}>Try the NYC demo</button
						>
					</div>
				</form>
			</section>
			{#if busy}<div class="loading" role="status">
					<span class="spinner"></span>Following your curiosity. This may take a few moments.
				</div>{/if}
			{#if experiences.length}<section class="results">
					<div class="section-heading">
						<div>
							<p class="eyebrow">A LITTLE INSPIRATION</p>
							<h2>Your next chapter starts here.</h2>
						</div>
						<span class="result-count">{experiences.length} ideas</span>
					</div>
					<p class="source-notice">{notice}</p>
					<div class="experience-grid">
						{#each experiences as experience, i}<article class="experience-card">
								<div class="card-art art-{i % 3}">
									<span>{['\u2197', '\u2600', '\u2733'][i % 3]}</span><small
										>{experience.category}</small
									>
								</div>
								<div class="card-body">
									<p class="place">{experience.location}</p>
									<h3>{experience.title}</h3>
									<p>{experience.description}</p>
									<div class="fit"><span>&#8599;</span> {experience.reason}</div>
									<a href={experience.url} target="_blank" rel="noopener noreferrer"
										>Check the source &#8599;</a
									><button class="primary" onclick={() => start(experience)}
										>Start Adventure &#8594;</button
									>
								</div>
							</article>{/each}
					</div>
				</section>{:else if !busy}<div class="how-it-works">
					<div>
						<span>01 / DISCOVER</span>
						<p>Find a little possibility.</p>
					</div>
					<div>
						<span>02 / EXPERIENCE</span>
						<p>Be there. Take it all in.</p>
					</div>
					<div>
						<span>03 / REMEMBER</span>
						<p>Keep more than a photo.</p>
					</div>
				</div>{/if}
		{:else if view === 'active' && selected}
			<section class="journey narrow">
				<p class="eyebrow">02 / LIVE YOUR STORY</p>
				<h1>You're on an adventure.</h1>
				<p class="subtitle">No perfect itinerary. Just a little curiosity.</p>
				<div class="selected-place">
					<span>&#8599;</span>
					<div>
						<h2>{selected.title}</h2>
						<p>{selected.location}</p>
						<a href={selected.url} target="_blank" rel="noopener noreferrer"
							>Experience details & directions &#8599;</a
						>
					</div>
				</div>
				<h2>How does this moment feel?</h2>
				<p>Capture a thought, a surprise, or something you want to remember.</p>
				<label for="reflection" class="sr-only">Your reflection</label><textarea
					id="reflection"
					bind:value={reflection}
					maxlength="2000"
					placeholder="The light was beautiful, and for the first time today I felt…"></textarea>
				<div class="reflection-actions">
					{#if speechSupported}<button
							class="secondary"
							aria-pressed={listening}
							onclick={() => {
								error = '';
								if (listening) recognition?.stop();
								else {
									try {
										recognition?.start();
										listening = true;
									} catch {
										error = 'Voice input is unavailable. Type your reflection instead.';
									}
								}
							}}>{listening ? 'Stop listening' : 'Speak a thought'}</button
						>{:else}<small>Voice input isn't supported here. Type your thoughts above.</small
						>{/if}<button
						class="secondary"
						disabled={!reflection.trim() || reflections.length >= 30}
						onclick={addReflection}>Save reflection +</button
					>
				</div>
				{#if listening}<p role="status">Listening… your words will appear above.</p>{/if}
				<div class="reflection-list">
					{#each reflections as text, i}<div>
							<span>Moment {String(i + 1).padStart(2, '0')}</span>
							<p>{text}</p>
							<button
								class="text-button"
								aria-label={`Remove reflection ${i + 1}`}
								onclick={() => (reflections = reflections.filter((_, n) => n !== i))}>Remove</button
							>
						</div>{/each}
				</div>
				<button class="primary wide" onclick={finish}>Finish Adventure &#8594;</button>
				<p class="footnote">
					Reflections stay in this session until you create your scrapbook. Voice uses your
					browser's speech service.
				</p>
			</section>
		{:else if view === 'finish' && selected}
			<section class="journey narrow">
				<p class="eyebrow">03 / KEEP THE FEELING</p>
				<h1>Every story deserves<br /><em>a few keepsakes.</em></h1>
				<p>Add 1–4 favorite photos. We'll bring your moments together.</p>
				<label class="upload-zone" for="photos"
					><span>+</span><strong
						>{busy ? 'Preparing your photos…' : 'Add your adventure photos'}</strong
					><small>JPG, PNG, WebP, HEIC · up to 15 MB each</small></label
				><input
					class="sr-only"
					id="photos"
					type="file"
					accept={PHOTO_ACCEPT}
					multiple
					onchange={upload}
					disabled={busy || photos.length >= 4}
				/>
				<div class="photo-previews">
					{#each photos as photo, i}<div>
							<img src={photo} alt={`Adventure photo ${i + 1}`} /><button
								aria-label={`Remove photo ${i + 1}`}
								onclick={() => (photos = photos.filter((_, n) => n !== i))}>×</button
							>
						</div>{/each}
				</div>
				<label class="checkbox consent"
					><input type="checkbox" bind:checked={shareInsights} /><span
						><strong>Let this story inspire future adventures</strong><small
							>Opt in to using the written summary for future recommendations when you choose.
							Stored on this device; photos aren't sent to AI or shared publicly.</small
						></span
					></label
				>
				<p class="footnote">
					Your written reflections are sent to AI to create the scrapbook. Photos are resized and
					kept on this device.
				</p>
				<button class="primary wide" disabled={busy || photos.length < 1} onclick={generate}
					>{busy ? 'Putting your story together…' : 'Create my scrapbook \u2197'}</button
				><button class="text-button" disabled={busy} onclick={() => (view = 'active')}
					>&#8592; Back to reflections</button
				>
			</section>
		{:else if view === 'scrapbook' && scrapbook}
			<section class="scrapbook-view narrow">
				<div class="section-heading">
					<div>
						<p class="eyebrow">A MOMENT, MADE YOURS</p>
						<h1>Your little keepsake.</h1>
					</div>
					<span class="sparkle">&#10023;</span>
				</div>
				<article class="scrapbook" bind:this={scrapbookElement}>
					<div class="scrapbook-top">
						<span>EXPLORIN / FIELD NOTES</span><span
							>{new Date(scrapbook.finishedAt).toLocaleDateString('en-US', {
								month: 'short',
								day: 'numeric',
								year: 'numeric'
							})}</span
						>
					</div>
					<h2>{scrapbook.title}</h2>
					<p class="scrapbook-location">&#8599; {scrapbook.experience.location}</p>
					<div class="scrapbook-photos" class:single={scrapbook.photos.length === 1}>
						{#each scrapbook.photos as photo, i}<figure>
								<img src={photo} alt={`A moment from your adventure, photo ${i + 1}`} />
								<figcaption>little moment / {String(i + 1).padStart(2, '0')}</figcaption>
							</figure>{/each}
					</div>
					<div class="scrapbook-story">
						<span class="quote-mark">“</span>
						<p>{scrapbook.summary}</p>
					</div>
					<div class="scrapbook-bottom">
						<span>{scrapbook.experience.title}</span><strong
							>go somewhere. feel something. &#10035;</strong
						>
					</div>
				</article>
				<p class="footnote">
					{scrapbook.aiGenerated
						? 'Written with AI from your reflections.'
						: 'AI unavailable — this keepsake uses your own words and adventure details.'}
					{saved ? 'Saved on this device.' : ''}
				</p>
				<div class="export-actions">
					<button class="primary" disabled={busy} onclick={() => exportScrapbook()}
						>Download PNG &#8595;</button
					><button class="secondary" disabled={busy} onclick={() => exportScrapbook(true)}
						>Share &#8599;</button
					>
				</div>
				{#if !saved}<button
						class="secondary wide"
						onclick={() => scrapbook && saveAdventure(scrapbook)}>Retry saving to history</button
					>{/if}<button class="text-button" onclick={() => navigate('discover')}
					>Find another adventure &#8599;</button
				>
			</section>
		{:else if view === 'history'}
			<section class="history-view">
				<p class="eyebrow">YOUR PERSONAL COLLECTION</p>
				<h1>Good days.<br /><em>Kept close.</em></h1>
				<p>Stories saved on this browser, ready to revisit. Up to 12 recent adventures.</p>
				{#if history.length}<div class="history-grid">
						{#each history as adventure}<article class="history-card">
								<button
									class="history-open"
									onclick={() => {
										scrapbook = adventure;
										saved = true;
										view = 'scrapbook';
									}}
									><img src={adventure.photos[0]} alt={adventure.title} />
									<div>
										<p class="place">{new Date(adventure.finishedAt).toLocaleDateString()}</p>
										<h2>{adventure.title}</h2>
										<p>{adventure.experience.location}</p>
										<span>Open scrapbook &#10035;</span>
									</div></button
								><button class="text-button" onclick={() => removeAdventure(adventure.id)}
									>Delete from this device</button
								>
							</article>{/each}
					</div>{:else}<div class="empty-state">
						<span>&#8599;</span>
						<h2>Your stories start with a first step.</h2>
						<p>Finish an adventure to add your first scrapbook here.</p>
						<button class="primary" onclick={() => navigate('discover')}
							>Find my first adventure &#8599;</button
						>
					</div>{/if}
			</section>
		{/if}
	</div>
	<footer class="exp-footer">
		<span>explorin. <span class="muted">a little more out there.</span></span><span
			>Made for curious people &#10035;</span
		>
	</footer>
</div>

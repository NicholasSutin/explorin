<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { toBlob } from 'html-to-image';
	import {
		directionsUrl,
		HISTORY_KEY,
		type Experience,
		type Adventure,
		type DiscoveryStep
	} from '#lib/adventure';
	import { api, errorMessage, photoDataUrl } from '#lib/client';
	import { sourceLabel } from '#lib/types';
	import { isAcceptedPhoto, PHOTO_ACCEPT } from '#lib/heic';
	import PlaceMap from '#lib/components/PlaceMap.svelte';
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
	/** The open scrapbook is in device history. */
	const saved = $derived(!!scrapbook && history.some((a) => a.id === scrapbook!.id));
	let shareInsights = $state(false);
	let useInsights = $state(false);
	let scrapbookElement = $state<HTMLElement>();
	let recognition: Recognition | undefined;
	let speechSupported = $state(false);
	let listening = $state(false);
	let now = $state(Date.now());
	/** Pipeline stages streamed from /api/discover, newest state per stage. */
	let steps = $state<DiscoveryStep[]>([]);
	let pipelineMs = $state(0);
	let pipelineElement = $state<HTMLElement>();
	/** How the scrapbook story was written: model and wall time, from /api/scrapbook. */
	let storyMeta = $state<{ model?: string; ms: number } | null>(null);
	let writing = $state(0);
	/** Free-text context about the person, persisted locally so personalization survives a reload. */
	const ABOUT_KEY = 'explorin.about.v1';
	let about = $state('');
	let aboutOpen = $state(false);
	let aboutFiles = $state<{ name: string; text: string }[]>([]);
	let aboutError = $state('');
	/** One-tap personas that show personalization without typing. */
	const aboutExamples = [
		'Solo, introvert, loves architecture',
		'Parent with a 6-year-old, needs stroller-friendly',
		'Runner, early riser, coffee snob'
	];
	/** Textarea plus any attached notes, trimmed to what the API accepts. */
	const aboutContext = $derived(
		[about.trim(), ...aboutFiles.map((f) => `${f.name}:\n${f.text.trim()}`)]
			.filter(Boolean)
			.join('\n\n')
			.slice(0, 2000)
	);
	function saveAbout(text: string) {
		about = text;
		aboutOpen = true;
		try {
			localStorage.setItem(ABOUT_KEY, text);
		} catch {
			/* storage unavailable: still works for this session */
		}
	}
	async function addAboutFiles(list: FileList | null) {
		aboutError = '';
		if (!list) return;
		const next = [...aboutFiles];
		for (const file of Array.from(list)) {
			if (next.length >= 3) {
				aboutError = 'Up to three notes at a time.';
				break;
			}
			if (!/\.(txt|md|json)$/i.test(file.name)) {
				aboutError = `${file.name}: only .txt, .md or .json notes.`;
				continue;
			}
			if (file.size > 200 * 1024) {
				aboutError = `${file.name} is over 200 KB.`;
				continue;
			}
			if (next.some((f) => f.name === file.name)) continue;
			const text = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(String(reader.result ?? ''));
				reader.onerror = () => reject(reader.error);
				reader.readAsText(file);
			}).catch(() => '');
			if (text.trim()) next.push({ name: file.name, text: text.slice(0, 2000) });
		}
		aboutFiles = next;
	}
	/** One-tap prompts for the live pipeline. Each one is phrased the way a person would actually ask. */
	const starters = [
		'A rainy afternoon with art and really good coffee',
		'Sunrise run with a skyline view, then breakfast',
		'A slow Sunday in Brooklyn, hidden gems only'
	];
	/** One-tap reflections, so the story step can be shown without typing. */
	const quickNotes = [
		'The light was doing something unreal.',
		'Got a little lost and didn\u2019t mind at all.',
		'Quieter than I expected. I needed that.',
		'Found a bench and just watched people for a while.'
	];
	/** Three marketing photos that stand in for a camera roll during a demo. */
	const samplePhotos = [
		'/marketing/high-line-fall.webp',
		'/marketing/nyc-highline-ugc.webp',
		'/marketing/run-selfie.webp'
	];
	/** Marketing photos with the film filter each one wears. Alt text is decorative-free on purpose. */
	const postcards = [
		{
			src: '/marketing/high-line-fall.webp',
			film: 'film-warm',
			note: 'the high line, late october'
		},
		{ src: '/marketing/brooklyn-bridge.webp', film: 'film-moss', note: 'dumbo, golden hour' },
		{ src: '/marketing/the-met-inside.webp', film: 'film-fade', note: 'the met, a quiet wing' },
		{ src: '/marketing/people-running.webp', film: 'film-sun', note: 'williamsburg bridge, 7am' },
		{ src: '/marketing/friends-night.webp', film: 'film-mono', note: 'flatbush, after the run' },
		{ src: '/marketing/hiker.webp', film: 'film-warm', note: 'a trail, any trail' },
		{ src: '/marketing/met-outside.webp', film: 'film-fade', note: 'museum steps' },
		{ src: '/marketing/hudson-yards-nyc.webp', film: 'film-moss', note: 'hudson yards' },
		{ src: '/marketing/nyc-highline-ugc.webp', film: 'film-sun', note: 'someone\u2019s high line' },
		{ src: '/marketing/run-selfie.webp', film: 'film-mono', note: 'proof we went' }
	];
	const directions = (e: Experience) =>
		e.coords ? directionsUrl(e.coords, e.photo?.placeId) : e.mapsUrl || e.url;
	/** Update `set` with the time since now every 100 ms; returns the stop function. */
	function elapsedTicker(set: (ms: number) => void) {
		const started = Date.now();
		const id = setInterval(() => set(Date.now() - started), 100);
		return () => {
			clearInterval(id);
			set(Date.now() - started);
		};
	}
	const elapsed = (from: string) => {
		const m = Math.max(0, Math.round((now - new Date(from).getTime()) / 60000));
		return m < 1
			? 'just started'
			: m < 60
				? `${m} min in`
				: `${Math.floor(m / 60)} h ${m % 60} min in`;
	};
	const pinned = $derived(history.filter((a) => a.experience.coords).slice(0, 9));
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
			const storedAbout = localStorage.getItem(ABOUT_KEY);
			if (storedAbout) {
				about = storedAbout.slice(0, 1200);
				aboutOpen = true;
			}
		} catch {
			/* storage unavailable */
		}
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
		const w = window as unknown as {
			SpeechRecognition?: new () => Recognition;
			webkitSpeechRecognition?: new () => Recognition;
		};
		const ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
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
		const tick = setInterval(() => (now = Date.now()), 30000);
		return () => {
			recognition?.stop();
			clearInterval(tick);
		};
	});
	/** POST and read newline-delimited JSON events as they arrive. */
	async function streamApi(
		path: string,
		body: unknown,
		onEvent: (event: Record<string, unknown>) => void
	): Promise<void> {
		const res = await fetch(path, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(60000)
		});
		if (!res.ok || !res.body) throw new Error(await errorMessage(res));
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let i: number;
			while ((i = buffer.indexOf('\n')) >= 0) {
				const line = buffer.slice(0, i).trim();
				buffer = buffer.slice(i + 1);
				if (line) onEvent(JSON.parse(line));
			}
		}
		if (buffer.trim()) onEvent(JSON.parse(buffer));
	}
	async function discover(demo = false) {
		busy = true;
		error = '';
		notice = '';
		experiences = [];
		steps = [];
		pipelineMs = 0;
		const stopTicker = elapsedTicker((ms) => (pipelineMs = ms));
		await tick();
		pipelineElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		try {
			await streamApi(
				'/api/discover',
				{
					prompt: demo ? 'A curious afternoon' : prompt,
					location,
					interests,
					about: aboutContext,
					demo,
					insights: useInsights
						? history
								.filter((a) => a.shareInsights)
								.slice(0, 5)
								.map((a) => a.summary.slice(0, 500))
						: []
				},
				(event) => {
					if (event.type === 'step') {
						const step = event.step as DiscoveryStep;
						steps = steps.some((s) => s.id === step.id)
							? steps.map((s) => (s.id === step.id ? step : s))
							: [...steps, step];
					} else if (event.type === 'result') {
						const result = event.result as { experiences: Experience[]; notice: string };
						experiences = result.experiences;
						notice = result.notice;
					} else if (event.type === 'error') throw new Error(String(event.error));
				}
			);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Discovery failed. Please try again.';
		} finally {
			stopTicker();
			busy = false;
		}
	}
	function tryStarter(text: string) {
		prompt = text;
		discover();
	}
	function quickNote(text: string) {
		if (reflections.length < 30 && !reflections.includes(text))
			reflections = [...reflections, text];
	}
	/** Re-encode and append photos; `load` produces the files (picker or sample fetch). */
	async function addPhotos(load: () => Promise<File[]>, failure: string) {
		busy = true;
		error = '';
		try {
			const files = await load();
			photos = [...photos, ...(await Promise.all(files.map(photoData)))];
		} catch (e) {
			error = e instanceof Error ? e.message : failure;
		} finally {
			busy = false;
		}
	}
	const useSamplePhotos = () =>
		addPhotos(
			() =>
				Promise.all(
					samplePhotos.slice(0, 4 - photos.length).map(async (src) => {
						const res = await fetch(src);
						if (!res.ok) throw new Error('Sample photos are unavailable right now.');
						return new File([await res.blob()], src.split('/').pop() || 'sample.webp', {
							type: 'image/webp'
						});
					})
				),
			'Could not load the sample photos.'
		);
	function start(experience: Experience) {
		selected = experience;
		startedAt = new Date().toISOString();
		reflections = [];
		reflection = '';
		photos = [];
		shareInsights = false;
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
	function photoData(file: File): Promise<string> {
		if (!isAcceptedPhoto(file)) throw new Error('Choose JPG, PNG, WebP, or HEIC photos.');
		if (file.size > 15 * 1024 * 1024) throw new Error('Each photo must be smaller than 15 MB.');
		// Decodes HEIC in a worker when the browser cannot read it natively; strips EXIF on the way.
		return photoDataUrl(file);
	}
	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files || []);
		input.value = '';
		if (files.length + photos.length > 4) {
			error = 'Choose up to four photos in total.';
			return;
		}
		await addPhotos(async () => files, 'Could not process the photos.');
	}
	function saveAdventure(adventure: Adventure) {
		const next = [adventure, ...history.filter((a) => a.id !== adventure.id)].slice(0, 12);
		try {
			localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
			history = next;
			status = 'Saved to your history on this device.';
		} catch {
			error =
				'Device storage is full or unavailable. Download your scrapbook now, or remove an older adventure and retry saving.';
		}
	}
	async function generate() {
		if (!selected || !photos.length) return;
		busy = true;
		error = '';
		status = '';
		storyMeta = null;
		const stopTicker = elapsedTicker((ms) => (writing = ms));
		try {
			const data = await api<{
				title: string;
				summary: string;
				aiGenerated: boolean;
				model?: string;
				ms: number;
			}>('/api/scrapbook', {
				method: 'POST',
				json: { title: selected.title, location: selected.location, reflections },
				timeoutMs: 45000
			});
			storyMeta = { model: data.model, ms: data.ms };
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
			stopTicker();
			writing = 0;
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
	/><meta property="og:title" content="Explorin · Find your next little adventure" /><meta
		property="og:image"
		content="/brand/og-card-green-1200.png"
	/></svelte:head
>
<div class="explorin">
	<header class="exp-header">
		<a class="brand" href="/" aria-label="Explorin home"
			><img class="brand-lockup" src="/brand/lockup-horizontal-ink.svg" alt="explorin." /></a
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
			><a href="/onboarding/photos">People like you</a>{#if page.data.user}<form
					method="POST"
					action="/signout"
				>
					<button type="submit" title={page.data.user.email}>Sign out</button>
				</form>{:else}<a href="/login" class="signin">Sign in</a>{/if}
		</nav>
	</header>
	<div class="exp-content">
		{#if error}<div class="message error" role="alert">{error}</div>{/if}
		{#if status}<div class="message success" role="status">{status}</div>{/if}
		{#if view === 'discover'}
			<section class="hero">
				<div class="hero-copy">
					<div class="eyebrow">LESS SCROLLING. MORE STORIES.</div>
					<h1>Your next adventure<br />is closer than <em>you think.</em></h1>
					<p>
						A quiet corner. A new favorite. A day that feels like you.<br class="desktop-break" /> Tell
						us what you're craving, and let curiosity do the rest.
					</p>
					<div class="hero-ctas">
						<a class="primary" href="#prompt">Tell us your kind of day &#8600;</a><button
							type="button"
							class="text-button"
							disabled={busy || !mounted}
							onclick={() => discover(true)}>Curated NYC picks</button
						>
					</div>
					<div class="starters" aria-label="Try one of these">
						<span>or try one, live:</span>
						{#each starters as text}<button
								type="button"
								disabled={busy || !mounted}
								onclick={() => tryStarter(text)}>{text} &#8599;</button
							>{/each}
					</div>
				</div>
				<div class="hero-stack" aria-hidden="true">
					{#each postcards.slice(0, 3) as card, i}<figure class="polaroid p{i + 1}">
							<div class="film {card.film}"><img src={card.src} alt="" loading="eager" /></div>
							<figcaption>{card.note}</figcaption>
						</figure>{/each}
					<img class="hero-mark" src="/brand/mark-orange.svg" alt="" />
					<span class="hero-caption">take the scenic route &#10035;</span>
				</div>
			</section>
			<div class="filmstrip" aria-hidden="true">
				<div class="filmstrip-track">
					{#each [...postcards, ...postcards] as card}<figure class="frame">
							<div class="film {card.film}"><img src={card.src} alt="" loading="lazy" /></div>
							<figcaption>{card.note}</figcaption>
						</figure>{/each}
				</div>
			</div>
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
					<details class="about" bind:open={aboutOpen}>
						<summary>
							<span class="field-label">About you <span>optional, makes it personal</span></span>
							<span class="about-state">{aboutContext ? 'Added \u2713' : 'Add context \u002b'}</span
							>
						</summary>
						<label for="about" class="sr-only">Tell us about yourself</label><textarea
							id="about"
							class="about-text"
							maxlength="1200"
							value={about}
							oninput={(e) => saveAbout(e.currentTarget.value)}
							placeholder="I\u2019m visiting with my partner, we love quiet mornings, old bookstores, and we walk everywhere\u2026"
						></textarea>
						<div class="chips about-chips">
							{#each aboutExamples as example}<button
									type="button"
									class:chosen={about === example}
									onclick={() => saveAbout(example)}>{example}</button
								>{/each}
						</div>
						<div class="about-files">
							<label class="file-button"
								><input
									type="file"
									accept=".txt,.md,.json,text/plain,text/markdown,application/json"
									multiple
									onchange={(e) => {
										addAboutFiles(e.currentTarget.files);
										e.currentTarget.value = '';
									}}
								/>Attach notes <span>.txt .md .json</span></label
							>
							{#each aboutFiles as file (file.name)}<span class="file-chip"
									>{file.name}<button
										type="button"
										aria-label={`Remove ${file.name}`}
										onclick={() => (aboutFiles = aboutFiles.filter((f) => f.name !== file.name))}
										>&times;</button
									></span
								>{/each}
						</div>
						{#if aboutError}<p class="about-error" role="alert">{aboutError}</p>{/if}
					</details>
					{#if history.some((a) => a.shareInsights)}<label class="checkbox"
							><input type="checkbox" bind:checked={useInsights} /> Personalize with insights I chose
							to share from past adventures</label
						>{/if}
					<div class="discover-actions">
						<button class="primary" disabled={busy}
							>{busy ? 'Finding your kind of adventure…' : 'Find my adventure \u2197'}</button
						><span class="hint">live search, about ten seconds</span>
					</div>
				</form>
			</section>
			{#if steps.length || busy}<aside
					class="pipeline"
					class:live={busy}
					bind:this={pipelineElement}
					role="status"
					aria-live="polite"
				>
					<div class="pipeline-head">
						<span class="eyebrow">UNDER THE HOOD</span>
						<span class="pipeline-clock"
							>{#if busy}<span class="spinner"></span>{/if}{(pipelineMs / 1000).toFixed(1)} s</span
						>
					</div>
					<ol>
						{#each steps as step (step.id)}<li class="step {step.state}">
								<span class="step-dot"></span>
								<div class="step-body">
									<strong>{step.label}</strong>
									{#if step.detail}<p>{step.detail}</p>{/if}
									{#if step.items?.length}<ul>
											{#each step.items as item}<li>{item}</li>{/each}
										</ul>{/if}
								</div>
								<span class="step-ms"
									>{step.state === 'running'
										? 'working'
										: step.ms != null && step.ms > 0
											? `${(step.ms / 1000).toFixed(1)} s`
											: ''}</span
								>
							</li>{/each}
						{#if busy && !steps.length}<li class="step running">
								<span class="step-dot"></span>
								<div class="step-body"><strong>Connecting</strong></div>
							</li>{/if}
					</ol>
				</aside>{/if}
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
								<div class="card-art art-{i % 3}" class:has-photo={experience.photo}>
									{#if experience.photo}<img
											class="card-photo"
											src="/api/photo?name={encodeURIComponent(experience.photo.name)}"
											alt={experience.location}
											loading="lazy"
											onerror={(ev) => (ev.currentTarget as HTMLImageElement).remove()}
										/><em class="photo-credit"
											>Photo: {#if experience.photo.attributionUrl}<a
													href={experience.photo.attributionUrl}
													target="_blank"
													rel="noopener noreferrer">{experience.photo.attribution}</a
												>{:else}{experience.photo.attribution}{/if}</em
										>{:else}<span>{['\u2197', '\u2600', '\u2733'][i % 3]}</span>{/if}<small
										>{experience.category}</small
									>{#if experience.coords}<a
											class="map-inset"
											href={directions(experience)}
											target="_blank"
											rel="noopener noreferrer"
											aria-label={`Directions to ${experience.location}`}
											><PlaceMap coords={experience.coords} zoom={15} w={180} h={130} alt="" /></a
										>{/if}
								</div>
								<div class="card-body">
									<p class="place">{experience.location}</p>
									<h3>{experience.title}</h3>
									<p>{experience.description}</p>
									{#if experience.rating || experience.reviews?.length}<div class="reviews">
											{#if experience.rating}<span class="rating"
													>&#9733; {experience.rating.toFixed(1)}{#if experience.reviewCount}
														&middot; {experience.reviewCount.toLocaleString()} reviews{/if}</span
												>{/if}
											{#if experience.reviews?.[0]}<blockquote>
													&ldquo;{experience.reviews[0].text.length > 160
														? experience.reviews[0].text.slice(0, 157).trimEnd() + '\u2026'
														: experience.reviews[0].text}&rdquo;
													<cite
														>{experience.reviews[0].author ??
															'Visitor'}{#if experience.reviews[0].when}
															&middot; {experience.reviews[0].when}{/if}
														&middot; Google</cite
													>
												</blockquote>{/if}
										</div>{/if}
									{#if experience.voices?.length}<div class="voices">
											<p class="voices-label">How it felt for people like you</p>
											{#each experience.voices as v (v.id)}<blockquote>
													&ldquo;{v.quote}&rdquo;
													<cite
														>{v.who} &middot; {sourceLabel(
															v.source
														)}{#each v.emotions.slice(0, 2) as e}
															&middot; #{e}{/each}</cite
													>
												</blockquote>{/each}
										</div>{/if}
									<div class="fit">
										<span>&#8599;</span>
										{experience.reason}{#if experience.personalized}<em class="personalized"
												>Personalized for you</em
											>{/if}
									</div>
									<div class="card-links">
										<a href={experience.url} target="_blank" rel="noopener noreferrer"
											>Check the source &#8599;</a
										>{#if experience.coords || experience.mapsUrl}<a
												href={directions(experience)}
												target="_blank"
												rel="noopener noreferrer">Directions &#8599;</a
											>{/if}
									</div>
									<button class="primary" onclick={() => start(experience)}
										>Start Adventure &#8594;</button
									>
								</div>
							</article>{/each}
					</div>
				</section>{:else if !busy}<div class="how-it-works">
					{#each [{ n: '01 / DISCOVER', t: 'Find a little possibility.', c: postcards[0] }, { n: '02 / EXPERIENCE', t: 'Be there. Take it all in.', c: postcards[3] }, { n: '03 / REMEMBER', t: 'Keep more than a photo.', c: postcards[2] }] as step}<div
							class="step-tile"
						>
							<div class="film {step.c.film}"><img src={step.c.src} alt="" loading="lazy" /></div>
							<span>{step.n}</span>
							<p>{step.t}</p>
						</div>{/each}
				</div>{/if}
		{:else if view === 'active' && selected}
			<section class="journey narrow">
				<p class="eyebrow">02 / LIVE YOUR STORY</p>
				<h1>You're on an adventure.</h1>
				<p class="subtitle">No perfect itinerary. Just a little curiosity.</p>
				<div class="selected-place" class:has-map={selected.coords}>
					{#if selected.coords}<div class="place-banner">
							<PlaceMap coords={selected.coords} zoom={15} w={640} h={300} style="ink" alt="" />
							<span class="here-chip"><i></i> You're here &middot; {elapsed(startedAt)}</span>
						</div>{:else}<span class="place-glyph">&#8599;</span>{/if}
					<div class="place-meta">
						<h2>{selected.title}</h2>
						<p>{selected.location}</p>
						<div class="card-links">
							<a href={selected.url} target="_blank" rel="noopener noreferrer"
								>Experience details &#8599;</a
							>{#if selected.coords || selected.mapsUrl}<a
									class="secondary small"
									href={directions(selected)}
									target="_blank"
									rel="noopener noreferrer">Directions &#8599;</a
								>{/if}
						</div>
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
				<div class="quick-notes">
					<span>or tap a quick note</span>
					{#each quickNotes as text}<button
							type="button"
							disabled={reflections.includes(text) || reflections.length >= 30}
							onclick={() => quickNote(text)}>+ {text}</button
						>{/each}
				</div>
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
				{#if photos.length < 4}<button
						type="button"
						class="secondary wide sample-photos"
						disabled={busy}
						onclick={useSamplePhotos}>Use sample photos instead</button
					>{/if}
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
					>{writing
						? `Gemini is writing your story\u2026 ${(writing / 1000).toFixed(1)} s`
						: busy
							? 'Preparing\u2026'
							: 'Create my scrapbook \u2197'}</button
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
					<div class="scrapbook-place">
						<p class="scrapbook-location">&#8599; {scrapbook.experience.location}</p>
						{#if scrapbook.experience.coords}<div class="map-stamp">
								<PlaceMap coords={scrapbook.experience.coords} zoom={14} w={160} h={160} alt="" />
							</div>{/if}
					</div>
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
				<p class="footnote story-meta">
					{#if scrapbook.aiGenerated}<span class="step-dot done"></span><span
							>Written by {storyMeta?.model ?? 'Gemini'} from {scrapbook.reflections.length}
							{scrapbook.reflections.length === 1 ? 'note' : 'notes'}{storyMeta
								? ` in ${(storyMeta.ms / 1000).toFixed(1)} s`
								: ''}. Photos stayed on this device.</span
						>{:else}<span
							>AI unavailable — this keepsake uses your own words and adventure details.</span
						>{/if}
					{#if saved}<span>Saved on this device.</span>{/if}
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
				{#if pinned.length}<div class="history-map">
						<PlaceMap
							pins={pinned.map((a) => a.experience.coords!)}
							numbered
							trail={pinned.length > 1}
							w={640}
							h={320}
							alt="Map of your saved adventures"
						/>
						<ol>
							{#each pinned as a, i}<li><b>{i + 1}</b> {a.experience.location}</li>{/each}
						</ol>
					</div>{/if}
				{#if history.length}<div class="history-grid">
						{#each history as adventure}<article class="history-card">
								<button
									class="history-open"
									onclick={() => {
										scrapbook = adventure;
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
		<span
			><img class="footer-mark" src="/brand/mark-ink.svg" alt="" /> explorin.
			<span class="muted">a little more out there.</span></span
		><span>Made for curious people &#10035;</span>
	</footer>
</div>

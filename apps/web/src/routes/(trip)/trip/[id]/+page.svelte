<script lang="ts">
	/**
	 * The day, on a living map. Pick a stop, hand it to Apple or Google Maps, check in when you get there (the app
	 * notices when you're close), tap Google's landmarks to add them, peek at happenings nearby, then finish the
	 * day into the scrapbook. Location is only followed while this page is open.
	 */
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Layers from '@lucide/svelte/icons/layers';
	import LocateFixed from '@lucide/svelte/icons/locate-fixed';
	import Locate from '@lucide/svelte/icons/locate';
	import X from '@lucide/svelte/icons/x';
	import Check from '@lucide/svelte/icons/check';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Star from '@lucide/svelte/icons/star';
	import Plus from '@lucide/svelte/icons/plus';
	import Flag from '@lucide/svelte/icons/flag';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Landmark from '@lucide/svelte/icons/landmark';
	import type { ExperiencePhoto, Stop } from '#lib/adventure';
	import { formatLatLng } from '#lib/adventure';
	import { api, watchLocation, type Fix } from '#lib/client';
	import { distanceM, formatDistance } from '#lib/geo';
	import { sourceLabel, voiceName } from '#lib/types';
	import { happeningTime, leg, type Selection } from '#lib/trip-ui';
	import TripMap from '#lib/components/trip/TripMap.svelte';
	import Sheet from '#lib/components/trip/Sheet.svelte';
	import Directions from '#lib/components/trip/Directions.svelte';
	import PlacePhoto from '#lib/components/trip/PlacePhoto.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const trip = $derived(data.trip);
	// svelte-ignore state_referenced_locally
	let stops = $state<Stop[]>(data.trip.stops);
	let selected = $state<Selection | null>(null);
	let open = $state(false);
	let fix = $state<Fix | null>(null);
	let follow = $state(false);
	let locating = $state<'off' | 'on' | 'error'>('off');
	let locError = $state('');
	let showHappenings = $state(true);
	let showLandmarks = $state(true);
	let layersOpen = $state(false);
	let inset = $state({ bottom: 0, left: 0 });
	let mapError = $state('');
	let toast = $state('');
	let target = $state<string | null>(null);
	let dismissed = $state<string[]>([]);
	let landmark = $state<
		| { state: 'loading'; placeId: string }
		| {
				state: 'ready';
				placeId: string;
				name: string;
				kind?: string;
				address?: string;
				photo?: ExperiencePhoto;
				coords?: { lat: number; lng: number };
		  }
		| { state: 'error'; placeId: string }
		| null
	>(null);
	let reviews = $state<
		Record<
			string,
			| {
					rating?: number;
					reviewCount?: number;
					reviews: { text: string; author?: string; when?: string; rating: number | null }[];
			  }
			| 'loading'
			| 'error'
		>
	>({});
	let stopWatch: (() => void) | undefined;

	const inPlan = $derived(stops.filter((s) => s.inPlan));
	const next = $derived(inPlan.find((s) => !s.visitedAt) ?? null);
	const visited = $derived(inPlan.filter((s) => s.visitedAt).length);
	const selStop = $derived.by(() => {
		const sel = selected;
		return sel?.kind === 'stop' ? (stops.find((s) => s.id === sel.id) ?? null) : null;
	});
	const selHappening = $derived.by(() => {
		const sel = selected;
		return sel?.kind === 'happening'
			? (trip.happenings.find((h) => h.id === sel.id) ?? null)
			: null;
	});
	/** The planned stop you're standing at (within 70 m), unless you said "not yet". */
	const arrived = $derived(
		fix
			? (inPlan.find(
					(s) =>
						!s.visitedAt && s.coords && distanceM(fix!, s.coords) < 70 && !dismissed.includes(s.id)
				) ?? null)
			: null
	);
	const number = (s: Stop) => inPlan.indexOf(s) + 1;
	/** Leg to a stop: from you when you're out, otherwise from the stop before it. */
	const legTo = (s: Stop) => {
		const i = inPlan.indexOf(s);
		const from = fix && s === next ? fix : i > 0 ? inPlan[i - 1].coords : (fix ?? undefined);
		return leg(from, s.coords);
	};
	/** The list's "↓ 6 min" between two stops: always stop to stop, wherever you are. */
	const legBetween = (s: Stop) => {
		const i = inPlan.indexOf(s);
		return i > 0 ? leg(inPlan[i - 1].coords, s.coords) : null;
	};

	const TARGET_KEY = $derived(`explorin.target.${trip.id}`);
	function setTarget(id: string | null) {
		target = id;
		try {
			if (id) sessionStorage.setItem(TARGET_KEY, id);
			else sessionStorage.removeItem(TARGET_KEY);
		} catch {
			/* private mode */
		}
		if (id && locating === 'off') startLocation();
	}

	function startLocation() {
		stopWatch?.();
		locError = '';
		stopWatch = watchLocation(
			(f) => {
				fix = f;
				locating = 'on';
			},
			(msg) => {
				locError = msg;
				locating = 'error';
			}
		);
	}
	function locate() {
		if (locating !== 'on') {
			startLocation();
			follow = true;
		} else follow = !follow;
	}

	onMount(() => {
		try {
			target = sessionStorage.getItem(TARGET_KEY);
		} catch {
			/* ignore */
		}
		// Follow along without asking again when permission was already given.
		navigator.permissions
			?.query({ name: 'geolocation' as PermissionName })
			.then((p) => p.state === 'granted' && startLocation())
			.catch(() => {});
		return () => stopWatch?.();
	});

	function flash(message: string) {
		toast = message;
		setTimeout(() => toast === message && (toast = ''), 3200);
	}

	async function patchStop(s: Stop, body: Record<string, unknown>, optimistic: Partial<Stop>) {
		const before = stops;
		stops = stops.map((x) => (x.id === s.id ? { ...x, ...optimistic } : x));
		try {
			await api(`/api/trip/${trip.id}/stops/${s.id}`, { method: 'PATCH', json: body });
		} catch (e) {
			stops = before;
			flash(e instanceof Error ? e.message : 'Could not save that.');
		}
	}

	async function checkIn(s: Stop) {
		const at =
			fix && s.coords && distanceM(fix, s.coords) < 400 ? { lat: fix.lat, lng: fix.lng } : null;
		await patchStop(
			s,
			{ visited: true, at },
			{ visitedAt: new Date().toISOString(), inPlan: true, visitedFrom: at }
		);
		if (target === s.id) setTarget(null);
		const after = stops.filter((x) => x.inPlan).find((x) => !x.visitedAt);
		flash(
			after
				? `Checked in. Next up: ${after.place}`
				: 'That’s every stop. Finish the day when you’re ready.'
		);
		selected = after ? { kind: 'stop', id: after.id } : null;
	}
	const undo = (s: Stop) =>
		patchStop(s, { visited: false }, { visitedAt: null, visitedFrom: null });
	const togglePlan = (s: Stop) => patchStop(s, { inPlan: !s.inPlan }, { inPlan: !s.inPlan });

	async function select(sel: Selection | null) {
		selected = sel;
		layersOpen = false;
		if (sel?.kind !== 'landmark') {
			landmark = null;
			return;
		}
		const existing = stops.find((s) => s.placeId === sel.placeId);
		if (existing) {
			selected = { kind: 'stop', id: existing.id };
			return;
		}
		landmark = { state: 'loading', placeId: sel.placeId };
		try {
			const card = await api<{
				name: string;
				kind?: string;
				address?: string;
				photo?: ExperiencePhoto;
				coords?: { lat: number; lng: number };
			}>(`/api/place/${encodeURIComponent(sel.placeId)}`);
			if (landmark?.placeId === sel.placeId)
				landmark = { state: 'ready', placeId: sel.placeId, ...card };
		} catch {
			if (landmark?.placeId === sel.placeId) landmark = { state: 'error', placeId: sel.placeId };
		}
	}

	async function addLandmark(placeId: string) {
		try {
			const { stop } = await api<{ stop: Stop }>(`/api/trip/${trip.id}/stops`, {
				method: 'POST',
				json: { placeId }
			});
			stops = [...stops.filter((s) => s.id !== stop.id), stop];
			landmark = null;
			selected = { kind: 'stop', id: stop.id };
			flash(`${stop.place} is on your day.`);
		} catch (e) {
			flash(e instanceof Error ? e.message : 'Could not add that place.');
		}
	}

	async function loadReviews(s: Stop) {
		if (!s.placeId || reviews[s.placeId]) return;
		reviews = { ...reviews, [s.placeId]: 'loading' };
		try {
			const r = await api<{
				rating?: number;
				reviewCount?: number;
				reviews: { text: string; author?: string; when?: string; rating: number | null }[];
			}>(`/api/place/${encodeURIComponent(s.placeId)}/reviews`);
			reviews = { ...reviews, [s.placeId]: r };
		} catch {
			reviews = { ...reviews, [s.placeId]: 'error' };
		}
	}

	const staticMap = $derived(
		(() => {
			const pins = inPlan.filter((s) => s.coords).slice(0, 12);
			return pins.length
				? `/api/map?pins=${pins.map((s) => formatLatLng(s.coords!)).join(';')}&numbered=1&trail=1&w=640&h=640`
				: '';
		})()
	);
</script>

<svelte:head><title>Explorin · {trip.title ?? 'Your day'}</title></svelte:head>

<div class="fixed inset-0 bg-[#f3f0e3]">
	<div class="absolute inset-0 md:left-[420px]">
		{#if data.mapsKey && !mapError}
			<TripMap
				apiKey={data.mapsKey}
				{stops}
				happenings={trip.happenings}
				{fix}
				{selected}
				{showHappenings}
				{showLandmarks}
				{follow}
				inset={{ bottom: inset.bottom, left: 0 }}
				onselect={select}
				onfollowchange={(on) => (follow = on)}
				onerror={(m) => (mapError = m)}
			/>
		{:else}
			{#if staticMap}<img
					src={staticMap}
					alt="Map of your stops"
					class="h-full w-full object-cover opacity-90"
				/>{/if}
			<p
				class="absolute inset-x-4 top-20 rounded-xl bg-paper/95 p-3 text-center text-sm text-ink/70 shadow"
			>
				{mapError ||
					'The interactive map needs a Maps browser key; here’s a snapshot of your stops.'}
			</p>
		{/if}
	</div>

	<!-- Top bar over the map -->
	<div
		class="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3 md:left-[420px]"
		style="padding-top: max(0.75rem, env(safe-area-inset-top))"
	>
		<a
			href="/"
			aria-label="Back to plans"
			class="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-paper/95 text-ink shadow-md md:hidden"
			><ArrowLeft size={20} aria-hidden="true" /></a
		>
		<div class="pointer-events-auto ml-auto flex flex-col items-end gap-2">
			<div class="flex gap-2">
				<button
					type="button"
					onclick={() => (layersOpen = !layersOpen)}
					aria-expanded={layersOpen}
					aria-label="Map layers"
					class="flex h-11 w-11 items-center justify-center rounded-full bg-paper/95 text-ink shadow-md"
					><Layers size={19} aria-hidden="true" /></button
				>
				<button
					type="button"
					onclick={locate}
					aria-pressed={follow}
					aria-label={locating === 'on'
						? follow
							? 'Stop following me'
							: 'Follow me'
						: 'Show my location'}
					class="flex h-11 w-11 items-center justify-center rounded-full shadow-md {follow
						? 'bg-[#3b82f6] text-white'
						: 'bg-paper/95 text-ink'}"
					>{#if locating === 'on'}<LocateFixed size={19} aria-hidden="true" />{:else}<Locate
							size={19}
							aria-hidden="true"
						/>{/if}</button
				>
			</div>
			{#if layersOpen}
				<div
					class="w-56 rounded-2xl bg-paper p-3 text-sm shadow-lg"
					in:fly={{ y: -6, duration: 150 }}
				>
					<label class="flex items-center justify-between py-1.5"
						><span class="flex items-center gap-2"
							><CalendarDays size={16} class="text-orange" aria-hidden="true" />Happenings</span
						><input
							type="checkbox"
							bind:checked={showHappenings}
							class="h-4 w-4 accent-[#d96738]"
						/></label
					>
					<label class="flex items-center justify-between py-1.5"
						><span class="flex items-center gap-2"
							><Landmark size={16} class="text-green" aria-hidden="true" />Landmarks</span
						><input
							type="checkbox"
							bind:checked={showLandmarks}
							class="h-4 w-4 accent-[#285c47]"
						/></label
					>
					<p class="mt-1 text-xs text-ink/50">Tap any landmark on the map to add it to your day.</p>
				</div>
			{/if}
			{#if locError}<p class="max-w-56 rounded-xl bg-paper/95 p-2 text-xs text-ink/70 shadow">
					{locError}
				</p>{/if}
		</div>
	</div>

	{#if arrived && !open}
		<div
			class="absolute inset-x-3 top-16 z-20 mx-auto max-w-md rounded-2xl bg-green p-3 text-cream shadow-lg md:left-[440px]"
			role="status"
			in:fly={{ y: -10 }}
		>
			<p class="text-sm">You’re at <strong>{arrived.place}</strong>.</p>
			<div class="mt-2 flex gap-2">
				<button
					type="button"
					onclick={() => checkIn(arrived!)}
					class="h-10 flex-1 rounded-full bg-cream font-semibold text-ink">Check in</button
				>
				<button
					type="button"
					onclick={() => (dismissed = [...dismissed, arrived!.id])}
					class="h-10 rounded-full px-4 text-sm ring-1 ring-cream/40">Not yet</button
				>
			</div>
		</div>
	{/if}

	{#if toast}
		<!-- Below the map buttons, and never in the way of a tap. -->
		<p
			class="pointer-events-none fixed inset-x-4 z-40 mx-auto max-w-sm rounded-full bg-ink px-4 py-2.5 text-center text-sm text-cream shadow-lg md:left-[440px]"
			style="top: calc(max(0.75rem, env(safe-area-inset-top)) + 3.5rem)"
			role="status"
			transition:fly={{ y: -8 }}
		>
			{toast}
		</p>
	{/if}

	<Sheet bind:open oncover={(i) => (inset = i)}>
		{#snippet head()}
			{#if selStop}
				<div class="flex items-start gap-3">
					<span
						class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold {selStop.visitedAt
							? 'bg-green text-cream'
							: selStop.inPlan
								? 'bg-orange text-white'
								: 'bg-moss text-ink'}"
						>{#if selStop.visitedAt}<Check
								size={16}
								aria-hidden="true"
							/>{:else if selStop.inPlan}{number(selStop)}{:else}<Plus
								size={16}
								aria-hidden="true"
							/>{/if}</span
					>
					<div class="min-w-0 flex-1">
						<p class="text-xs text-ink/55">
							{selStop.category}{legTo(selStop) ? ` · ${legTo(selStop)!.label}` : ''}
						</p>
						<h2 class="truncate font-serif text-xl font-semibold">{selStop.place}</h2>
					</div>
					<button
						type="button"
						aria-label="Close"
						onclick={() => select(null)}
						class="flex h-9 w-9 items-center justify-center rounded-full bg-moss"
						><X size={16} aria-hidden="true" /></button
					>
				</div>
				{#if selStop.coords && !open}
					<div class="mt-3 md:hidden">
						<Directions
							compact
							to={selStop.coords}
							name={selStop.place}
							placeId={selStop.placeId}
							transit={legTo(selStop)?.transit}
							onopen={() => setTarget(selStop!.id)}
						/>
					</div>
				{/if}
			{:else if selHappening}
				<div class="flex items-start gap-3">
					<span
						class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange/15 text-orange"
						><CalendarDays size={17} aria-hidden="true" /></span
					>
					<div class="min-w-0 flex-1">
						<p class="text-xs text-ink/55">{selHappening.kind} · {happeningTime(selHappening)}</p>
						<h2 class="font-serif text-xl leading-snug font-semibold">{selHappening.name}</h2>
					</div>
					<button
						type="button"
						aria-label="Close"
						onclick={() => select(null)}
						class="flex h-9 w-9 items-center justify-center rounded-full bg-moss"
						><X size={16} aria-hidden="true" /></button
					>
				</div>
			{:else if landmark}
				<div class="flex items-start gap-3">
					<span
						class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-moss text-green"
						><Landmark size={17} aria-hidden="true" /></span
					>
					<div class="min-w-0 flex-1">
						{#if landmark.state === 'ready'}
							<p class="text-xs text-ink/55">{landmark.kind ?? 'Landmark'}</p>
							<h2 class="font-serif text-xl font-semibold">{landmark.name}</h2>
						{:else if landmark.state === 'loading'}
							<p class="py-2 text-sm text-ink/60">Looking it up…</p>
						{:else}
							<p class="py-2 text-sm text-ink/60">Couldn’t load that place.</p>
						{/if}
					</div>
					<button
						type="button"
						aria-label="Close"
						onclick={() => select(null)}
						class="flex h-9 w-9 items-center justify-center rounded-full bg-moss"
						><X size={16} aria-hidden="true" /></button
					>
				</div>
				{#if landmark.state === 'ready'}
					<button
						type="button"
						onclick={() => addLandmark(landmark!.placeId)}
						class="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-orange font-semibold text-white"
						><Plus size={17} aria-hidden="true" />Add to my day</button
					>
				{/if}
			{:else}
				<div class="flex items-center justify-between gap-3">
					<div class="min-w-0">
						<p class="text-xs tracking-wide text-ink/55 uppercase">
							{trip.city} · {visited} of {inPlan.length} stops
						</p>
						<h1 class="line-clamp-2 font-serif text-xl leading-snug font-semibold">
							{trip.title ?? 'Your day'}
						</h1>
					</div>
					<a
						href="/"
						class="hidden shrink-0 rounded-full px-3 py-1.5 text-sm text-ink/60 ring-1 ring-ink/15 md:block"
						>All plans</a
					>
				</div>
				<div class="mt-2 flex gap-1" aria-hidden="true">
					{#each inPlan as s (s.id)}<span
							class="h-1.5 flex-1 rounded-full {s.visitedAt
								? 'bg-green'
								: s === next
									? 'bg-orange'
									: 'bg-ink/15'}"
						></span>{/each}
				</div>
				{#if trip.status === 'finished'}
					<a
						href="/scrapbook/{trip.id}"
						class="mt-3 flex h-11 items-center justify-center rounded-full bg-ink font-semibold text-cream"
						>See it in your scrapbook</a
					>
				{:else if next}
					<button
						type="button"
						onclick={() => select({ kind: 'stop', id: next!.id })}
						class="mt-3 flex w-full items-center gap-3 rounded-2xl bg-white p-2.5 text-left ring-1 ring-ink/10"
					>
						<span
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange text-sm font-bold text-white"
							>{number(next)}</span
						>
						<span class="min-w-0 flex-1">
							<span class="block text-xs text-ink/55"
								>Next{target === next.id ? ', you’re heading here' : ''}{legTo(next)
									? ` · ${legTo(next)!.label}`
									: ''}</span
							>
							<span class="block truncate font-medium">{next.place}</span>
						</span>
						<MapPin size={18} class="text-ink/40" aria-hidden="true" />
					</button>
				{:else}
					<a
						href="/trip/{trip.id}/done"
						class="mt-3 flex h-12 items-center justify-center gap-2 rounded-full bg-orange font-semibold text-white"
						><Flag size={17} aria-hidden="true" />Finish the day</a
					>
				{/if}
			{/if}
		{/snippet}

		{#if selStop}
			<PlacePhoto
				photo={selStop.photo}
				alt={selStop.place}
				eager
				class="mb-4 aspect-[16/10] rounded-2xl"
			/>
			<h3 class="font-serif text-2xl leading-tight font-semibold">{selStop.title}</h3>
			<p class="mt-1 text-ink/75">{selStop.description}</p>
			{#if selStop.tags.length}
				<div class="mt-3 flex flex-wrap gap-1.5">
					{#each selStop.tags as t (t)}<span
							class="rounded-full bg-moss px-2.5 py-1 text-xs text-ink/80">#{t}</span
						>{/each}
				</div>
			{/if}
			<p class="mt-4 rounded-2xl bg-orange/10 p-3 text-sm text-ink/85">
				<strong class="text-orange">Why you:</strong>
				{selStop.reason}
			</p>
			{#if selStop.voices?.length}
				<div class="mt-4 space-y-2">
					<p class="text-xs font-semibold tracking-wide text-ink/55 uppercase">
						How it felt for people like you
					</p>
					{#each selStop.voices as v (v.id)}
						<blockquote class="rounded-2xl bg-white p-3 text-sm ring-1 ring-ink/10">
							“{v.quote}”<cite class="mt-1 block text-xs text-ink/55 not-italic"
								>{voiceName(v.who, v.source)} · {sourceLabel(v.source)}</cite
							>
						</blockquote>
					{/each}
				</div>
			{/if}
			<div class="mt-5 space-y-2">
				{#if selStop.coords}<Directions
						to={selStop.coords}
						name={selStop.place}
						placeId={selStop.placeId}
						transit={legTo(selStop)?.transit}
						onopen={() => setTarget(selStop!.id)}
					/>{/if}
				{#if selStop.visitedAt}
					<button
						type="button"
						onclick={() => undo(selStop!)}
						class="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-green/10 font-medium text-green"
						><Check size={17} aria-hidden="true" />Checked in · undo</button
					>
				{:else}
					<button
						type="button"
						onclick={() => checkIn(selStop!)}
						class="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-green font-semibold text-cream"
						><Check size={17} aria-hidden="true" />I’m here</button
					>
				{/if}
				<button
					type="button"
					onclick={() => togglePlan(selStop!)}
					class="h-10 w-full rounded-full text-sm text-ink/65 ring-1 ring-ink/15"
				>
					{selStop.inPlan ? 'Remove from my day' : 'Add back to my day'}
				</button>
			</div>
			{#if selStop.placeId}
				<div class="mt-5">
					{#if !reviews[selStop.placeId]}
						<button
							type="button"
							onclick={() => loadReviews(selStop!)}
							class="flex items-center gap-1.5 text-sm font-medium text-green"
							><Star size={15} aria-hidden="true" />Google reviews</button
						>
					{:else if reviews[selStop.placeId] === 'loading'}
						<p class="text-sm text-ink/55">Loading reviews…</p>
					{:else if reviews[selStop.placeId] === 'error'}
						<p class="text-sm text-ink/55">Reviews aren’t available right now.</p>
					{:else}
						{@const r = reviews[selStop.placeId] as Exclude<
							(typeof reviews)[string],
							'loading' | 'error'
						>}
						{#if r.rating}<p class="flex items-center gap-1 text-sm font-medium">
								<Star
									size={15}
									class="fill-orange text-orange"
									aria-hidden="true"
								/>{r.rating.toFixed(1)}<span class="font-normal text-ink/55">
									· {r.reviewCount?.toLocaleString()} Google reviews</span
								>
							</p>{/if}
						<div class="mt-2 space-y-2">
							{#each r.reviews.slice(0, 3) as rev, i (i)}
								<blockquote class="rounded-xl bg-white p-3 text-sm text-ink/80 ring-1 ring-ink/10">
									“{rev.text.length > 220 ? rev.text.slice(0, 217).trimEnd() + '…' : rev.text}”
									<cite class="mt-1 block text-xs text-ink/50 not-italic"
										>{rev.author ?? 'Visitor'}{rev.when ? ` · ${rev.when}` : ''} · Google</cite
									>
								</blockquote>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
			{#if selStop.url}<a
					href={selStop.url}
					target="_blank"
					rel="noopener noreferrer"
					class="mt-4 inline-block text-sm text-ink/55 underline">Where we read about it ↗</a
				>{/if}
		{:else if selHappening}
			<p class="text-ink/80">{selHappening.where}</p>
			{#if selHappening.nearStop !== undefined && inPlan[selHappening.nearStop]}
				<p class="mt-2 text-sm text-ink/60">
					{formatDistance(selHappening.distanceM ?? 0)} from {inPlan[selHappening.nearStop]
						?.place ?? 'one of your stops'}
				</p>
			{/if}
			<div class="mt-4">
				<Directions
					to={{ lat: selHappening.lat, lng: selHappening.lng }}
					name={selHappening.name}
				/>
			</div>
			<a
				href="https://www.google.com/search?q={encodeURIComponent(
					`${selHappening.name} ${trip.city}`
				)}"
				target="_blank"
				rel="noopener noreferrer"
				class="mt-4 inline-block text-sm text-ink/55 underline">Look it up ↗</a
			>
			<p class="mt-4 text-xs text-ink/45">
				From NYC’s permitted events (NYC Open Data). Times can change; check before you go.
			</p>
		{:else if landmark?.state === 'ready'}
			<PlacePhoto
				photo={landmark.photo}
				alt={landmark.name}
				eager
				class="mb-4 aspect-[16/10] rounded-2xl"
			/>
			{#if landmark.address}<p class="text-ink/75">{landmark.address}</p>{/if}
			{#if landmark.coords}<div class="mt-4">
					<Directions to={landmark.coords} name={landmark.name} placeId={landmark.placeId} />
				</div>{/if}
		{:else}
			<ol class="space-y-2">
				{#each stops as s (s.id)}
					{@const l = s.inPlan ? legBetween(s) : null}
					<li>
						{#if l && s.inPlan && number(s) > 1}<p class="py-1 pl-12 text-xs text-ink/45">
								↓ {l.label}
							</p>{/if}
						<button
							type="button"
							onclick={() => select({ kind: 'stop', id: s.id })}
							class="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-moss/50 {s.inPlan
								? ''
								: 'opacity-55'}"
						>
							<span
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold {s.visitedAt
									? 'bg-green text-cream'
									: s.inPlan
										? 'bg-ink text-cream'
										: 'bg-moss text-ink'}"
								>{#if s.visitedAt}<Check size={16} aria-hidden="true" />{:else if s.inPlan}{number(
										s
									)}{:else}+{/if}</span
							>
							<PlacePhoto photo={s.photo} credit={false} class="h-12 w-12 shrink-0 rounded-xl" />
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium">{s.place}</span>
								<span class="block truncate text-xs text-ink/55"
									>{s.inPlan ? s.title : 'Not on today’s plan'}</span
								>
							</span>
						</button>
					</li>
				{/each}
			</ol>
			{#if trip.happenings.length}
				<h3
					class="mt-6 mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink/55 uppercase"
				>
					<CalendarDays size={14} class="text-orange" aria-hidden="true" />Happening nearby
				</h3>
				<ul class="space-y-1">
					{#each trip.happenings as h (h.id)}
						<li>
							<button
								type="button"
								onclick={() => select({ kind: 'happening', id: h.id })}
								class="w-full rounded-xl p-2 text-left hover:bg-moss/50"
							>
								<span class="block truncate text-sm font-medium">{h.name}</span>
								<span class="block truncate text-xs text-ink/55">{h.kind} · {happeningTime(h)}</span
								>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			{#if trip.status !== 'finished'}
				<a
					href="/trip/{trip.id}/done"
					class="mt-6 flex h-12 items-center justify-center gap-2 rounded-full {next
						? 'ring-1 ring-ink/20'
						: 'bg-orange font-semibold text-white'}"
					><Flag size={17} aria-hidden="true" />Finish the day</a
				>
			{/if}
			<p class="mt-4 text-center text-xs text-ink/45">“{trip.prompt}”</p>
		{/if}
	</Sheet>
</div>

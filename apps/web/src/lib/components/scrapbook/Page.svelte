<script lang="ts">
	/**
	 * One scrapbook page as SVG: grain-textured paper with a dot grid, taped polaroids, a postmarked map stamp, the
	 * stops, a hand-written note on ruled lines, "best for" stickers and a footer. Rendered whole on screen;
	 * export.ts renders `base` (paper and frames) and `overlay` (everything drawn on top) separately and paints the
	 * photos and map between them, because an SVG drawn as an image cannot load images of its own.
	 */
	import type { Trip } from '#lib/adventure';
	import { layoutPage, type Format } from '#lib/scrapbook/layout';
	let {
		trip,
		format = 'page',
		part = 'all',
		pageNumber,
		class: className = ''
	}: {
		trip: Trip;
		format?: Format;
		part?: 'all' | 'base' | 'overlay';
		pageNumber?: number;
		class?: string;
	} = $props();

	const SERIF = "'Iowan Old Style','Palatino Linotype',Georgia,serif";
	const SANS = "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
	const HAND = "Caveat,'Bradley Hand','Segoe Print',cursive";
	const PEN = '#26385a';

	const m = $derived(layoutPage(trip, format, pageNumber));
	const id = `p${Math.random().toString(36).slice(2, 8)}`;
	const map = $derived(m.slots.find((s) => s.kind === 'map'));
	/** The postmark text repeated to go round the ring once, then stretched to fit it exactly (textLength). */
	const ring = $derived.by(() => {
		if (!m.stamp) return { text: '', length: 0 };
		const length = 2 * Math.PI * (m.stamp.r + 14) - m.header.size;
		const per = m.header.size * 0.95 * 0.68; // average bold capital width, roughly
		const times = Math.max(1, Math.floor(length / (m.stamp.ring.length * per)));
		return { text: m.stamp.ring.repeat(times), length };
	});
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 {m.w} {m.h}"
	width={m.w}
	height={m.h}
	class={className}
	data-part={part}
	role="img"
	aria-label="Scrapbook page: {m.title.lines.join(' ')}"
>
	<defs>
		<filter id="{id}-grain" x="0" y="0" width="100%" height="100%">
			<feTurbulence
				type="fractalNoise"
				baseFrequency="0.85"
				numOctaves="2"
				seed={m.seed % 997}
				stitchTiles="stitch"
			/>
			<feColorMatrix type="matrix" values="0 0 0 0 0.13  0 0 0 0 0.2  0 0 0 0 0.16  0 0 0 0.09 0" />
		</filter>
		<filter id="{id}-rough" x="-10%" y="-30%" width="120%" height="160%">
			<feTurbulence
				type="fractalNoise"
				baseFrequency="0.06"
				numOctaves="3"
				seed={(m.seed % 991) + 3}
			/>
			<feDisplacementMap in="SourceGraphic" scale={m.w / 160} />
		</filter>
		<filter id="{id}-shadow" x="-20%" y="-20%" width="140%" height="150%">
			<feDropShadow
				dx="0"
				dy={m.w / 120}
				stdDeviation={m.w / 110}
				flood-color="#203d32"
				flood-opacity="0.28"
			/>
		</filter>
		<radialGradient id="{id}-vignette" cx="50%" cy="45%" r="75%">
			<stop offset="60%" stop-color="#fbf8ef" stop-opacity="0" />
			<stop offset="100%" stop-color="#d9cfb3" stop-opacity="0.55" />
		</radialGradient>
		<pattern id="{id}-dots" width={m.w / 30} height={m.w / 30} patternUnits="userSpaceOnUse">
			<circle cx={m.w / 60} cy={m.w / 60} r={m.w / 600} fill="#203d32" opacity="0.13" />
		</pattern>
		{#if m.stamp}
			<clipPath id="{id}-stamp"><circle cx={m.stamp.cx} cy={m.stamp.cy} r={m.stamp.r} /></clipPath>
			<path
				id="{id}-ring"
				d="M {m.stamp.cx - m.stamp.r - 14} {m.stamp.cy} a {m.stamp.r + 14} {m.stamp.r +
					14} 0 1 1 {2 * (m.stamp.r + 14)} 0 a {m.stamp.r + 14} {m.stamp.r + 14} 0 1 1 {-2 *
					(m.stamp.r + 14)} 0"
			/>
		{/if}
	</defs>

	{#if part !== 'overlay'}
		<rect width={m.w} height={m.h} fill="#fbf8ef" />
		<rect width={m.w} height={m.h} fill="url(#{id}-dots)" />
		<rect width={m.w} height={m.h} filter="url(#{id}-grain)" />
		<rect width={m.w} height={m.h} fill="url(#{id}-vignette)" />
		<!-- binding edge -->
		<rect width={m.w * 0.018} height={m.h} fill="#203d32" opacity="0.06" />
		{#each m.frames as f, i (i)}
			<g transform="translate({f.cx} {f.cy}) rotate({f.rot})" filter="url(#{id}-shadow)">
				<rect x={-f.w / 2} y={-f.h / 2} width={f.w} height={f.h} fill="#fffdf6" />
				<rect
					x={-f.w / 2 + f.pad}
					y={-f.h / 2 + f.pad}
					width={f.w - 2 * f.pad}
					height={f.w - 2 * f.pad}
					fill="#e7e2d2"
				/>
			</g>
		{/each}
		{#if m.stamp}
			<circle
				cx={m.stamp.cx}
				cy={m.stamp.cy}
				r={m.stamp.r + 26}
				fill="#f6f0df"
				filter="url(#{id}-shadow)"
			/>
			<circle cx={m.stamp.cx} cy={m.stamp.cy} r={m.stamp.r} fill="#e9e5d3" />
		{/if}
	{/if}

	{#if part === 'all'}
		{#each m.frames as f, i (i)}
			{@const slot = m.slots.filter((s) => s.kind === 'photo')[i]}
			{#if slot}
				<g transform="translate({f.cx} {f.cy}) rotate({f.rot})">
					<image
						href={slot.href}
						x={-f.w / 2 + f.pad}
						y={-f.h / 2 + f.pad}
						width={slot.w}
						height={slot.h}
						preserveAspectRatio="xMidYMid slice"
					/>
				</g>
			{/if}
		{/each}
		{#if map && m.stamp}
			<image
				href={map.href}
				x={m.stamp.cx - m.stamp.r}
				y={m.stamp.cy - m.stamp.r}
				width={m.stamp.r * 2}
				height={m.stamp.r * 2}
				preserveAspectRatio="xMidYMid slice"
				clip-path="url(#{id}-stamp)"
			/>
		{/if}
	{/if}

	{#if part !== 'base'}
		<!-- tape and captions on the polaroids -->
		{#each m.frames as f, i (i)}
			<g transform="translate({f.cx} {f.cy}) rotate({f.rot})">
				{#each f.tapes as t, j (j)}
					<rect
						x={t.x - t.w / 2}
						y={t.y - t.w * 0.14}
						width={t.w}
						height={t.w * 0.28}
						fill="#efe1b3"
						fill-opacity="0.78"
						transform="rotate({t.rot} {t.x} {t.y})"
						filter="url(#{id}-rough)"
					/>
				{/each}
				<text
					x={-f.w / 2 + f.pad}
					y={f.h / 2 - f.bottom * 0.36}
					font-family={HAND}
					font-size={f.bottom * 0.42}
					fill={PEN}
					opacity="0.8">{f.caption}</text
				>
			</g>
		{/each}

		{#if m.stamp}
			<circle
				cx={m.stamp.cx}
				cy={m.stamp.cy}
				r={m.stamp.r + 4}
				fill="none"
				stroke="#203d32"
				stroke-width={m.w / 300}
			/>
			<circle
				cx={m.stamp.cx}
				cy={m.stamp.cy}
				r={m.stamp.r + 24}
				fill="none"
				stroke="#203d32"
				stroke-width={m.w / 500}
				stroke-dasharray="2 4"
				opacity="0.6"
			/>
			<text
				font-family={SANS}
				font-size={m.header.size * 0.95}
				font-weight="700"
				fill="#203d32"
				opacity="0.75"
			>
				<textPath href="#{id}-ring" textLength={ring.length} lengthAdjust="spacing"
					>{ring.text}</textPath
				>
			</text>
		{/if}

		<!-- header -->
		<text
			x={m.m}
			y={m.header.y}
			font-family={SANS}
			font-size={m.header.size}
			font-weight="700"
			letter-spacing={m.header.size * 0.22}
			fill="#203d32"
			opacity="0.6">{m.header.left}</text
		>
		<text
			x={m.w - m.m}
			y={m.header.y}
			text-anchor="end"
			font-family={SANS}
			font-size={m.header.size}
			font-weight="700"
			letter-spacing={m.header.size * 0.15}
			fill="#d96738">{m.header.right}</text
		>
		<line
			x1={m.m}
			x2={m.w - m.m}
			y1={m.header.y + m.header.size * 0.9}
			y2={m.header.y + m.header.size * 0.9}
			stroke="#203d32"
			stroke-opacity="0.18"
		/>

		<!-- title -->
		{#each m.title.lines as line, i (i)}
			<text
				x={m.title.x}
				y={m.title.y + i * m.title.size * 1.12}
				font-family={SERIF}
				font-size={m.title.size}
				font-weight="700"
				fill="#203d32">{line}</text
			>
		{/each}
		<text
			x={m.m}
			y={m.subtitle.y}
			font-family={SANS}
			font-size={m.subtitle.size}
			fill="#203d32"
			opacity="0.6">{m.subtitle.text}</text
		>

		<!-- stops -->
		{#each m.stops.items as s, i (i)}
			{@const y = m.stops.y + i * m.stops.lineH}
			<circle
				cx={m.stops.x + m.stops.size * 0.6}
				cy={y - m.stops.size * 0.35}
				r={m.stops.size * 0.62}
				fill={s.visited ? '#285c47' : 'none'}
				stroke="#203d32"
				stroke-opacity={s.visited ? 0 : 0.5}
			/>
			<text
				x={m.stops.x + m.stops.size * 0.6}
				y={y - m.stops.size * 0.02}
				text-anchor="middle"
				font-family={SANS}
				font-size={m.stops.size * 0.72}
				font-weight="700"
				fill={s.visited ? '#f8f6ef' : '#203d32'}>{s.visited ? '✓' : s.n}</text
			>
			<text
				x={m.stops.x + m.stops.size * 1.6}
				{y}
				font-family={SANS}
				font-size={m.stops.size}
				fill="#203d32"
				opacity="0.85">{s.name}</text
			>
			{#if s.star}<text
					x={m.stops.x - m.stops.size * 0.9}
					{y}
					font-family={SANS}
					font-size={m.stops.size}
					fill="#d96738">★</text
				>{/if}
		{/each}

		<!-- note on ruled lines -->
		{#each { length: m.note.ruled } as _, i (i)}
			<line
				x1={m.note.x}
				x2={m.note.x + m.note.w}
				y1={m.note.y + i * m.note.lineH + m.note.size * 0.28}
				y2={m.note.y + i * m.note.lineH + m.note.size * 0.28}
				stroke="#7d9bb5"
				stroke-opacity="0.35"
				stroke-width={m.w / 600}
			/>
		{/each}
		{#each m.note.lines as line, i (i)}
			<text
				x={m.note.x + m.note.size * 0.2}
				y={m.note.y + i * m.note.lineH}
				font-family={HAND}
				font-size={m.note.size}
				font-weight="500"
				fill={PEN}>{line}</text
			>
		{/each}

		<!-- best-for stickers -->
		{#each m.stickers as s, i (i)}
			<g
				transform="translate({s.x + s.w / 2} {s.y + s.h / 2}) rotate({s.rot})"
				filter="url(#{id}-shadow)"
			>
				<rect x={-s.w / 2} y={-s.h / 2} width={s.w} height={s.h} rx={s.h / 2} fill={s.fill} />
				<rect
					x={-s.w / 2 + 3}
					y={-s.h / 2 + 3}
					width={s.w - 6}
					height={s.h - 6}
					rx={(s.h - 6) / 2}
					fill="none"
					stroke={s.ink}
					stroke-opacity="0.45"
					stroke-dasharray="3 3"
				/>
				<text
					y={s.h * 0.14}
					text-anchor="middle"
					font-family={SANS}
					font-size={s.h * 0.36}
					font-weight="800"
					letter-spacing={s.h * 0.04}
					fill={s.ink}>{s.text}</text
				>
			</g>
		{/each}

		{#if m.emotions.text}
			<text
				x={m.emotions.x}
				y={m.emotions.y}
				font-family={HAND}
				font-size={m.emotions.size * 1.5}
				fill="#d96738">{m.emotions.text}</text
			>
		{/if}

		<!-- footer -->
		<text
			x={m.m}
			y={m.footer.y}
			font-family={SERIF}
			font-size={m.footer.size * 1.5}
			font-weight="800"
			fill="#203d32"
			>{m.footer.left.replace(/\.$/, '')}<tspan fill="#d96738"
				>{m.footer.left.endsWith('.') ? '.' : ''}</tspan
			></text
		>
		{#if m.footer.right}
			<text
				x={m.w - m.m}
				y={m.footer.y}
				text-anchor="end"
				font-family={SERIF}
				font-size={m.footer.size * 1.2}
				fill="#203d32"
				opacity="0.5">{m.footer.right}</text
			>
		{/if}
	{/if}
</svg>

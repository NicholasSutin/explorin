<script lang="ts">
	/** Cloth-bound notebook cover: woven texture lit from the top left, an elastic band, a paper label. */
	let { name, days, years }: { name: string; days: number; years: string } = $props();
	const id = `c${Math.random().toString(36).slice(2, 8)}`;
	const owner = $derived(name ? `${name}’s` : 'My');
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 600 800"
	class="h-full w-full"
	role="img"
	aria-label="{owner} field notes, {days} days"
>
	<defs>
		<filter id="{id}-cloth" x="0" y="0" width="100%" height="100%">
			<feTurbulence
				type="fractalNoise"
				baseFrequency="0.9 0.06"
				numOctaves="2"
				seed="7"
				result="warp"
			/>
			<feTurbulence
				type="fractalNoise"
				baseFrequency="0.06 0.9"
				numOctaves="2"
				seed="11"
				result="weft"
			/>
			<feBlend in="warp" in2="weft" mode="multiply" result="weave" />
			<feDiffuseLighting in="weave" lighting-color="#ffffff" surfaceScale="1.6" result="lit">
				<feDistantLight azimuth="225" elevation="55" />
			</feDiffuseLighting>
			<feComposite
				in="lit"
				in2="SourceGraphic"
				operator="arithmetic"
				k1="0.9"
				k2="0"
				k3="0"
				k4="0"
			/>
		</filter>
		<linearGradient id="{id}-sheen" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#ffffff" stop-opacity="0.16" />
			<stop offset="0.5" stop-color="#ffffff" stop-opacity="0" />
			<stop offset="1" stop-color="#000000" stop-opacity="0.22" />
		</linearGradient>
		<filter id="{id}-emboss">
			<feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="b" />
			<feSpecularLighting
				in="b"
				surfaceScale="3"
				specularConstant="0.6"
				specularExponent="18"
				lighting-color="#f8f6ef"
				result="s"
			>
				<feDistantLight azimuth="225" elevation="45" />
			</feSpecularLighting>
			<feComposite in="s" in2="SourceAlpha" operator="in" result="sl" />
			<feComposite
				in="SourceGraphic"
				in2="sl"
				operator="arithmetic"
				k1="0"
				k2="1"
				k3="0.8"
				k4="0"
			/>
		</filter>
		<filter id="{id}-lift" x="-10%" y="-10%" width="120%" height="130%">
			<feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#0b1a14" flood-opacity="0.45" />
		</filter>
	</defs>
	<rect width="600" height="800" rx="14" fill="#285c47" />
	<rect width="600" height="800" rx="14" fill="#285c47" filter="url(#{id}-cloth)" />
	<rect width="600" height="800" rx="14" fill="url(#{id}-sheen)" />
	<!-- spine groove -->
	<rect x="0" y="0" width="34" height="800" fill="#1d4637" opacity="0.6" />
	<line x1="34" x2="34" y1="0" y2="800" stroke="#0f2a20" stroke-opacity="0.5" />
	<!-- elastic band -->
	<rect x="508" y="0" width="26" height="800" fill="#d96738" filter="url(#{id}-lift)" />
	<rect
		x="508"
		y="0"
		width="26"
		height="800"
		fill="#d96738"
		filter="url(#{id}-cloth)"
		opacity="0.6"
	/>
	<!-- label -->
	<g filter="url(#{id}-lift)">
		<rect x="110" y="250" width="340" height="230" rx="10" fill="#f8f6ef" />
		<rect
			x="122"
			y="262"
			width="316"
			height="206"
			rx="6"
			fill="none"
			stroke="#203d32"
			stroke-opacity="0.35"
		/>
	</g>
	<text
		x="280"
		y="320"
		text-anchor="middle"
		font-family="ui-sans-serif,-apple-system,Helvetica,sans-serif"
		font-size="12"
		font-weight="700"
		letter-spacing="3"
		fill="#d96738">EXPLORIN</text
	>
	<text
		x="280"
		y="372"
		text-anchor="middle"
		font-family="'Iowan Old Style','Palatino Linotype',Georgia,serif"
		font-size="44"
		font-weight="700"
		fill="#203d32">Field notes</text
	>
	<text
		x="280"
		y="412"
		text-anchor="middle"
		font-family="Caveat,'Bradley Hand',cursive"
		font-size="30"
		fill="#26385a">{owner} good days</text
	>
	<text
		x="280"
		y="448"
		text-anchor="middle"
		font-family="ui-sans-serif,-apple-system,Helvetica,sans-serif"
		font-size="12"
		letter-spacing="2"
		fill="#203d32"
		opacity="0.6">{days} {days === 1 ? 'DAY' : 'DAYS'} OUT · {years}</text
	>
	<!-- embossed mark -->
	<g filter="url(#{id}-emboss)" opacity="0.9">
		<circle cx="280" cy="610" r="34" fill="none" stroke="#1d4637" stroke-width="7" />
		<line
			x1="304"
			y1="634"
			x2="338"
			y2="668"
			stroke="#1d4637"
			stroke-width="9"
			stroke-linecap="round"
		/>
	</g>
</svg>

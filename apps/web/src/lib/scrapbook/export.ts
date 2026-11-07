/**
 * Scrapbook page -> PNG for sharing. An SVG drawn as an image may not load anything external, so the page is
 * painted in three passes onto a canvas: the `base` SVG (paper, frames), then each photo and the map stamp with
 * their rotation and clip (same geometry as the SVG, from layout.ts), then the `overlay` SVG (tape, text,
 * stickers). The hand-writing font is embedded into the overlay as a data URL so text matches the page.
 */
import type { PageModel, Slot } from './layout';

const SVGNS = 'http://www.w3.org/2000/svg';
let fontCss: Promise<string> | null = null;

function embeddedFont(): Promise<string> {
	fontCss ??= fetch('/fonts/caveat-latin.woff2')
		.then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('font'))))
		.then((buf) => {
			let bin = '';
			const bytes = new Uint8Array(buf);
			for (let i = 0; i < bytes.length; i += 0x8000)
				bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
			return `@font-face{font-family:Caveat;src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');font-weight:500 700;}`;
		})
		.catch(() => '');
	return fontCss;
}

async function svgImage(
	svg: SVGSVGElement,
	w: number,
	h: number,
	css: string
): Promise<HTMLImageElement> {
	const clone = svg.cloneNode(true) as SVGSVGElement;
	clone.setAttribute('width', String(w));
	clone.setAttribute('height', String(h));
	clone.removeAttribute('class');
	if (css) {
		const style = document.createElementNS(SVGNS, 'style');
		style.textContent = css;
		clone.insertBefore(style, clone.firstChild);
	}
	const xml = new XMLSerializer().serializeToString(clone);
	const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
	try {
		return await image(url);
	} finally {
		setTimeout(() => URL.revokeObjectURL(url), 2000);
	}
}

function image(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Could not load ${src.slice(0, 60)}`));
		img.src = src;
	});
}

/** object-fit: cover into the slot's box, centred at the origin. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
	const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
	const sw = w / scale;
	const sh = h / scale;
	ctx.drawImage(
		img,
		(img.naturalWidth - sw) / 2,
		(img.naturalHeight - sh) / 2,
		sw,
		sh,
		-w / 2,
		-h / 2,
		w,
		h
	);
}

async function paintSlot(ctx: CanvasRenderingContext2D, slot: Slot) {
	let img: HTMLImageElement;
	try {
		img = await image(slot.href);
	} catch {
		return; // a missing photo or map leaves the frame's placeholder showing
	}
	ctx.save();
	ctx.translate(slot.cx, slot.cy);
	ctx.rotate((slot.rot * Math.PI) / 180);
	ctx.beginPath();
	if (slot.kind === 'map') ctx.arc(0, 0, slot.w / 2, 0, Math.PI * 2);
	else ctx.rect(-slot.w / 2, -slot.h / 2, slot.w, slot.h);
	ctx.clip();
	drawCover(ctx, img, slot.w, slot.h);
	ctx.restore();
}

export async function renderPng(
	base: SVGSVGElement,
	overlay: SVGSVGElement,
	model: PageModel,
	scale = model.format === 'page' ? 2 : 1
): Promise<Blob> {
	const css = await embeddedFont();
	const [under, over] = await Promise.all([
		svgImage(base, model.w, model.h, ''),
		svgImage(overlay, model.w, model.h, css)
	]);
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(model.w * scale);
	canvas.height = Math.round(model.h * scale);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('This browser cannot draw the image.');
	// Safari can paint an SVG image blank the first time it is drawn; a throwaway draw warms it up.
	const warm = document.createElement('canvas').getContext('2d');
	warm?.drawImage(under, 0, 0, 1, 1);
	warm?.drawImage(over, 0, 0, 1, 1);
	await new Promise((r) => requestAnimationFrame(() => r(null)));
	ctx.scale(scale, scale);
	ctx.drawImage(under, 0, 0, model.w, model.h);
	for (const slot of model.slots) await paintSlot(ctx, slot);
	ctx.drawImage(over, 0, 0, model.w, model.h);
	const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
	if (!blob) throw new Error('Could not create the image.');
	return blob;
}

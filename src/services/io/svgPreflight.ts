import type { ImageSize } from './imageHeader';

/** Parse as inert XML. Never attach input nodes to the application's DOM. */
export function svgViewport(source: string): { root: SVGSVGElement; size: ImageSize } | null {
  if (/<!doctype|<!entity/i.test(source)) return null;
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (
    root.localName !== 'svg' ||
    root.namespaceURI !== 'http://www.w3.org/2000/svg' ||
    doc.querySelector('parsererror') ||
    doc.getElementsByTagName('*').length > 20_000
  )
    return null;
  const length = (value: string | null): number | null => {
    // Dimensions are normalized below before rasterization.
    if (!value || !/^\s*\d+(?:\.\d+)?(?:px)?\s*$/.test(value)) return null;
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  // Resources/effects may allocate independently of the root viewport. Admit
  // static vector SVG; raster/HTML/filter/animated inputs need conversion first.
  if (doc.querySelector('image, foreignObject, filter, feImage, animate, animateTransform, set'))
    return null;
  const box = root
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    box &&
    (box.length !== 4 ||
      box.some((n) => !Number.isFinite(n) || Math.abs(n) > 1_000_000) ||
      (box[2] ?? 0) <= 0 ||
      (box[3] ?? 0) <= 0)
  )
    return null;
  const width = length(root.getAttribute('width')) ?? box?.[2];
  const height = length(root.getAttribute('height')) ?? box?.[3];
  if (!width || !height) return null;
  return {
    root: root as unknown as SVGSVGElement,
    size: { width: Math.ceil(width), height: Math.ceil(height) },
  };
}

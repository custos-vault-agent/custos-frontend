/**
 * Deterministic 5x5 identicon derived from a wallet address.
 *
 * The grid is mirrored across the vertical axis: only the left three columns
 * are generated and columns 3-4 echo columns 1-0. Symmetry is what makes a
 * random bit pattern read as a *mark* rather than as noise — and the sigil has
 * to work at 4px cells inside an activity row, where noise is unreadable.
 */

function fnv1a(input: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}

export function sigilCells(address: string): boolean[] {
	const cells = new Array<boolean>(25).fill(false);
	let state = fnv1a(address.toLowerCase()) || 0x9e3779b9;

	for (let col = 0; col < 3; col++) {
		for (let row = 0; row < 5; row++) {
			state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
			const on = ((state >>> 17) & 1) === 1;
			cells[row * 5 + col] = on;
			cells[row * 5 + (4 - col)] = on;
		}
	}

	// A blank or fully solid grid is a failed mark. Force the centre so every
	// address produces something recognisable.
	const filled = cells.filter(Boolean).length;
	if (filled === 0 || filled === 25) cells[12] = filled === 0;

	return cells;
}

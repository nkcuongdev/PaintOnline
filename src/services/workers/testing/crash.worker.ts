// Deliberate startup failure for the isolated real-worker lifecycle regression.
throw new Error('isolated worker crash');
export {};

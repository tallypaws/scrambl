export function memoize<F extends (...args: any[]) => any>(fn: F, options?: {expireAfter?: number, maxEntries?: number}): F {
    const cache = new Map<string, ReturnType<F>>();
    const expireAfter = options?.expireAfter ?? 5 * 60 * 1000;
    const maxEntries = options?.maxEntries ?? 100;

    return function(...args: Parameters<F>): ReturnType<F> {
        const key = JSON.stringify(args);
        const now = Date.now();

        if (cache.has(key)) {
            const entry = cache.get(key)!;
            if ((now - (entry as any)._timestamp) < expireAfter) {
                return entry;
            } else {
                cache.delete(key);
            }
        }

        const result = fn(...args);
        (result as any)._timestamp = now;
        cache.set(key, result);

        if (cache.size > maxEntries) {
            const oldestKey = Array.from(cache.keys())[0];
            cache.delete(oldestKey);
        }

        return result;
    } as F;

}

export function pickRandomWeighedByParam<T>(items: T[], weightParam: keyof T, scale: number = 1): T | null {
    if (items.length === 0) return null;

    const rawWeights = items.map(item => {
        const w = Number(item[weightParam]);
        return isNaN(w) ? 0 : w;
    });
    const weights = rawWeights.map(w => (w < 0 ? 0 : w));

    if (scale === 0) {
        return items[Math.floor(Math.random() * items.length)];
    }

    if (scale === Infinity) {
        const max = Math.max(...weights);
        const candidates = items.filter((_, i) => weights[i] === max);
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
    if (scale === -Infinity) {
        const min = Math.min(...weights);
        const candidates = items.filter((_, i) => weights[i] === min);
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    const transformed = weights.map(w => {
        if (w === 0 && scale < 0) return Number.POSITIVE_INFINITY;
        return Math.pow(w, scale);
    });

    if (transformed.some(v => v === Number.POSITIVE_INFINITY)) {
        const candidates = items.filter((_, i) => transformed[i] === Number.POSITIVE_INFINITY);
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    const total = transformed.reduce((sum, v) => sum + (isNaN(v) ? 0 : v), 0);
    if (total === 0) {
        return items[Math.floor(Math.random() * items.length)];
    }

    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
        const w = isNaN(transformed[i]) ? 0 : transformed[i];
        if (r < w) return items[i];
        r -= w;
    }

    return null;
}
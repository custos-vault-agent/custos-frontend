/**
 * A fixed "now" so seeded timestamps stay stable across reloads. Live entries
 * created during a session use the real clock; only the seed is frozen.
 */
export const MOCK_NOW = Date.UTC(2026, 8, 6, 14, 30);

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "custos-theme";

/**
 * Runs before hydration, inline in <head>. Without it a dark-mode user who has
 * toggled to light (or vice versa) gets a full-page flash of the wrong palette
 * on every reload, which is far more jarring here than usual because the two
 * modes invert the entire surface.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
	THEME_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;

export function readTheme(): ThemeChoice {
	if (typeof window === "undefined") return "system";
	try {
		const stored = localStorage.getItem(THEME_KEY);
		if (stored === "light" || stored === "dark") return stored;
	} catch {
		// Private mode, blocked site data — fall through to system.
	}
	return "system";
}

export function applyTheme(choice: ThemeChoice): void {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	if (choice === "system") root.removeAttribute("data-theme");
	else root.setAttribute("data-theme", choice);

	try {
		if (choice === "system") localStorage.removeItem(THEME_KEY);
		else localStorage.setItem(THEME_KEY, choice);
	} catch {
		// Storage is a convenience here; the attribute is what actually matters.
	}
}

export function nextTheme(choice: ThemeChoice): ThemeChoice {
	if (choice === "system") return "light";
	if (choice === "light") return "dark";
	return "system";
}

export function themeLabel(choice: ThemeChoice): string {
	if (choice === "light") return "LIGHT";
	if (choice === "dark") return "DARK";
	return "AUTO";
}

/** Theme preference: an explicit choice, or "system" to follow the device. */
export type ThemeChoice = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "daet-theme";
export const THEME_CHOICES: ThemeChoice[] = ["light", "dark", "system"];
export const THEME_LABELS: Record<ThemeChoice, string> = { light: "Light", dark: "Dark", system: "System" };

/** Reads a stored value; anything unknown (or nothing) means "system". */
export function parseTheme(value: string | null | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

/** The header button cycles Light → Dark → System. */
export function nextTheme(current: ThemeChoice): ThemeChoice {
  return THEME_CHOICES[(THEME_CHOICES.indexOf(current) + 1) % THEME_CHOICES.length];
}

/**
 * Runs in <head> before the first paint: applies a saved Light/Dark choice.
 * System needs nothing; CSS follows prefers-color-scheme by itself.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

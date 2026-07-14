// Mounts at the App root. Reads global settings via useSettings() and
// applies them to <html>:
//   - class="dark" toggle for theme
//   - CSS custom properties for font family + per-region sizes
// For theme="auto", subscribes to prefers-color-scheme and re-applies.

import React from "react";
import {
	type FontFamilyRegion,
	type FontSizeRegion,
	getFontFamily,
	getFontSize,
	getTheme,
	getThemeFamily,
	getTypographyPreset,
	type ThemeMode,
} from "../../shared/app-settings-keys";
import { useSettings } from "../queries";

const FAMILY_VAR: Record<FontFamilyRegion, string> = {
	display: "--font-display",
	interface: "--font-interface",
	content: "--font-content",
	mono: "--font-mono",
};

const REGIONS: FontSizeRegion[] = [
	"interface",
	"compact",
	"chatAssistant",
	"chatUser",
	"composer",
	"codeBlock",
];

const REGION_VAR: Record<FontSizeRegion, string> = {
	interface: "--font-size-interface",
	compact: "--font-size-compact",
	chatAssistant: "--font-size-chat-assistant",
	chatUser: "--font-size-chat-user",
	composer: "--font-size-composer",
	codeBlock: "--font-size-code-block",
};

function effectiveTheme(mode: ThemeMode): "light" | "dark" {
	if (mode === "light") return "light";
	if (mode === "dark") return "dark";
	if (typeof window === "undefined" || !window.matchMedia) return "dark";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

export function SettingsApplier() {
	const { data } = useSettings();
	const settings = data?.settings ?? {};
	const theme = getTheme(settings);
	const themeFamily = getThemeFamily(settings);

	// Apply theme class + family attribute.
	React.useEffect(() => {
		const root = document.documentElement;
		root.dataset.themeFamily = themeFamily;
		const apply = () => {
			const eff = effectiveTheme(theme);
			root.classList.toggle("dark", eff === "dark");
		};
		apply();
		if (theme !== "auto" || !window.matchMedia) return;
		const mql = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => apply();
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, [theme, themeFamily]);

	// Apply the typography preset, family overrides, and per-region sizes.
	React.useEffect(() => {
		const root = document.documentElement;
		root.dataset.typographyPreset = getTypographyPreset(settings);
		for (const region of Object.keys(FAMILY_VAR) as FontFamilyRegion[]) {
			const family = getFontFamily(settings, region);
			if (family) root.style.setProperty(FAMILY_VAR[region], family);
			else root.style.removeProperty(FAMILY_VAR[region]);
		}
		for (const region of REGIONS) {
			root.style.setProperty(
				REGION_VAR[region],
				`${getFontSize(settings, region)}px`,
			);
		}
	}, [settings]);

	return null;
}

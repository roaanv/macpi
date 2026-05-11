// Mounts at the App root. Reads global settings via useSettings() and
// applies them to <html>:
//   - class="dark" toggle for theme
//   - CSS custom properties for font family + per-region sizes
// For theme="auto", subscribes to prefers-color-scheme and re-applies.

import React from "react";
import {
	type FontSizeRegion,
	getFontFamily,
	getFontFamilyMono,
	getFontSize,
	getTheme,
	getThemeFamily,
	type ThemeMode,
} from "../../shared/app-settings-keys";
import { useSettings } from "../queries";

const REGIONS: FontSizeRegion[] = [
	"sidebar",
	"chatAssistant",
	"chatUser",
	"composer",
	"codeBlock",
];

const REGION_VAR: Record<FontSizeRegion, string> = {
	sidebar: "--font-size-sidebar",
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

	// Apply font family + sizes. Empty fontFamily lets the active theme's
	// CSS variable take over (each theme family declares its own --font-body).
	React.useEffect(() => {
		const root = document.documentElement;
		const fam = getFontFamily(settings);
		const famMono = getFontFamilyMono(settings);
		if (fam) root.style.setProperty("--font-family", fam);
		else root.style.removeProperty("--font-family");
		if (famMono) root.style.setProperty("--font-family-mono", famMono);
		else root.style.removeProperty("--font-family-mono");
		for (const region of REGIONS) {
			root.style.setProperty(
				REGION_VAR[region],
				`${getFontSize(settings, region)}px`,
			);
		}
	}, [settings]);

	return null;
}

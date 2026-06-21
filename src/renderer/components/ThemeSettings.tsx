// Theme category: family picker (Slate + four trend-forward palettes) plus a
// light/dark/auto mode radio. Each family option previews its light and dark
// swatches and names its type pairing; selecting one writes the themeFamily
// setting, which SettingsApplier maps to html[data-theme-family="…"].

import {
	getTheme,
	getThemeFamily,
	type ThemeFamily,
	type ThemeMode,
} from "../../shared/app-settings-keys";
import { useSetSetting, useSettings } from "../queries";

interface FamilyOption {
	value: ThemeFamily;
	label: string;
	tagline: string;
	fonts: string;
	swatches: {
		light: { bg: string; panel: string; row: string; accent: string };
		dark: { bg: string; panel: string; row: string; accent: string };
	};
}

const FAMILY_OPTIONS: FamilyOption[] = [
	{
		value: "slate",
		label: "Slate",
		tagline: "Neutral cool grey. Quiet and classic.",
		fonts: "Inter · JetBrains Mono",
		swatches: {
			light: {
				bg: "#fcfcfd",
				panel: "#f4f4f6",
				row: "#e6e6ea",
				accent: "#3f6cd8",
			},
			dark: {
				bg: "#1c1c21",
				panel: "#26262b",
				row: "#34343a",
				accent: "#7aa9ee",
			},
		},
	},
	{
		value: "carbon",
		label: "Carbon",
		tagline: "Brutalist mono-tech. Acid-lime accent.",
		fonts: "Space Grotesk · IBM Plex Mono",
		swatches: {
			light: {
				bg: "#fbfbf6",
				panel: "#f1f1e9",
				row: "#e6e6dc",
				accent: "#5b6b00",
			},
			dark: {
				bg: "#14150f",
				panel: "#1c1d15",
				row: "#26271c",
				accent: "#c6f432",
			},
		},
	},
	{
		value: "ember",
		label: "Ember",
		tagline: "Warm editorial. Terracotta on cream.",
		fonts: "Instrument Serif · Hanken Grotesk",
		swatches: {
			light: {
				bg: "#fbf6ef",
				panel: "#f4ebde",
				row: "#ebddcb",
				accent: "#c5562e",
			},
			dark: {
				bg: "#1e160f",
				panel: "#271d14",
				row: "#33271b",
				accent: "#e0743f",
			},
		},
	},
	{
		value: "marine",
		label: "Marine",
		tagline: "Deep marine surfaces, crisp aqua.",
		fonts: "Bricolage Grotesque · Spline Sans",
		swatches: {
			light: {
				bg: "#f6f9fa",
				panel: "#e9f1f2",
				row: "#dae7e9",
				accent: "#0e8c8c",
			},
			dark: {
				bg: "#0b1518",
				panel: "#112022",
				row: "#182d2e",
				accent: "#34d6c0",
			},
		},
	},
	{
		value: "punch",
		label: "Punch",
		tagline: "Neutral canvas, hot-magenta pop.",
		fonts: "Familjen Grotesk · IBM Plex Mono",
		swatches: {
			light: {
				bg: "#fcfbfc",
				panel: "#f3f1f4",
				row: "#e8e4ea",
				accent: "#e11d74",
			},
			dark: {
				bg: "#161318",
				panel: "#1f1b22",
				row: "#2a252e",
				accent: "#ff4d9d",
			},
		},
	},
];

const MODE_OPTIONS: { value: ThemeMode; label: string; description: string }[] =
	[
		{
			value: "auto",
			label: "Auto",
			description: "Follow the operating system's appearance setting.",
		},
		{ value: "light", label: "Light", description: "Always use light mode." },
		{ value: "dark", label: "Dark", description: "Always use dark mode." },
	];

function Swatches({
	mode,
	colors,
}: {
	mode: "light" | "dark";
	colors: FamilyOption["swatches"]["light"];
}) {
	return (
		<div
			role="img"
			aria-label={`${mode} preview`}
			className="flex h-9 w-full overflow-hidden rounded border border-divider"
		>
			<div style={{ backgroundColor: colors.bg }} className="flex-1" />
			<div style={{ backgroundColor: colors.panel }} className="flex-1" />
			<div style={{ backgroundColor: colors.row }} className="flex-1" />
			<div style={{ backgroundColor: colors.accent }} className="w-2" />
		</div>
	);
}

export function ThemeSettings() {
	const { data } = useSettings();
	const setSetting = useSetSetting();
	const settings = data?.settings ?? {};
	const currentFamily = getThemeFamily(settings);
	const currentMode = getTheme(settings);

	return (
		<div className="flex max-w-3xl flex-col gap-6">
			<section className="flex flex-col gap-3">
				<div>
					<h2 className="font-semibold text-primary text-sm">Family</h2>
					<p className="text-muted text-xs">
						Surface palette, accent, and type pairing.
					</p>
				</div>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
					{FAMILY_OPTIONS.map((opt) => {
						const active = currentFamily === opt.value;
						return (
							<button
								key={opt.value}
								type="button"
								onClick={() =>
									setSetting.mutate({ key: "themeFamily", value: opt.value })
								}
								className={`flex flex-col gap-2 rounded-md border p-3 text-left transition-colors ${
									active
										? "border-divider surface-panel"
										: "border-divider hover:surface-row"
								}`}
								style={
									active
										? {
												borderColor: "var(--accent)",
												boxShadow: "inset 0 0 0 1px var(--accent)",
											}
										: undefined
								}
							>
								<div className="flex items-baseline justify-between gap-2">
									<span className="font-semibold text-primary text-sm">
										{opt.label}
									</span>
									{active ? (
										<span className="font-semibold text-[10px] uppercase tracking-wider text-accent">
											● Active
										</span>
									) : null}
								</div>
								<p className="text-muted text-xs leading-snug">{opt.tagline}</p>
								<div className="flex gap-2">
									<Swatches mode="light" colors={opt.swatches.light} />
									<Swatches mode="dark" colors={opt.swatches.dark} />
								</div>
								<div className="flex justify-between text-[10px] text-faint">
									<span>Light</span>
									<span>Dark</span>
								</div>
								<p className="text-[10px] text-faint leading-snug">
									{opt.fonts}
								</p>
							</button>
						);
					})}
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<div>
					<h2 className="font-semibold text-primary text-sm">Mode</h2>
					<p className="text-muted text-xs">
						Light or dark surfaces within the chosen family.
					</p>
				</div>
				<div className="flex gap-2">
					{MODE_OPTIONS.map((opt) => {
						const isActive = currentMode === opt.value;
						return (
							<button
								key={opt.value}
								type="button"
								onClick={() =>
									setSetting.mutate({ key: "theme", value: opt.value })
								}
								className={`min-w-[88px] rounded border px-3 py-1.5 text-xs transition-colors ${
									isActive
										? "border-transparent text-[color:var(--accent-fg)]"
										: "border-divider text-muted hover:surface-row hover:text-primary"
								}`}
								style={isActive ? { background: "var(--accent)" } : undefined}
								title={opt.description}
							>
								{opt.label}
							</button>
						);
					})}
				</div>
			</section>
		</div>
	);
}

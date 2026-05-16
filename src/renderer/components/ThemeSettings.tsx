// Theme category: low-chroma family picker + light/dark/auto mode radio.
// The redesign replaced the loud Sunrise / Meadow / Catppuccin palettes
// with six quieter families (Slate / Linen / Pebble / Sage and dark-only
// Graphite / Nocturne) calibrated for a dev-tool aesthetic.

import {
	getTheme,
	getThemeFamily,
	isDarkOnlyFamily,
	type ThemeFamily,
	type ThemeMode,
} from "../../shared/app-settings-keys";
import { useSetSetting, useSettings } from "../queries";

interface FamilyOption {
	value: ThemeFamily;
	label: string;
	tagline: string;
	darkOnly?: boolean;
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
		value: "linen",
		label: "Linen",
		tagline: "Warm paper. Low-saturation terracotta accent.",
		swatches: {
			light: {
				bg: "#fbf7ee",
				panel: "#f3ecdb",
				row: "#e6dabc",
				accent: "#b14d20",
			},
			dark: {
				bg: "#1f1814",
				panel: "#2a2018",
				row: "#3a2a1c",
				accent: "#cf7c40",
			},
		},
	},
	{
		value: "pebble",
		label: "Pebble",
		tagline: "Cool stone. Light steel-blue accent.",
		swatches: {
			light: {
				bg: "#f7f9fb",
				panel: "#eef1f5",
				row: "#dfe4ea",
				accent: "#3a6da8",
			},
			dark: {
				bg: "#171b1f",
				panel: "#1f242a",
				row: "#2c333a",
				accent: "#7aa8d1",
			},
		},
	},
	{
		value: "sage",
		label: "Sage",
		tagline: "Calm green. Low-chroma forest tones.",
		swatches: {
			light: {
				bg: "#f4f7f2",
				panel: "#e6ece2",
				row: "#d3ddc8",
				accent: "#3f7050",
			},
			dark: {
				bg: "#171b18",
				panel: "#1f2520",
				row: "#2c342c",
				accent: "#83b693",
			},
		},
	},
	{
		value: "graphite",
		label: "Graphite",
		tagline: "Neutral charcoal. The serious-coding mode.",
		darkOnly: true,
		swatches: {
			light: {
				bg: "#28282d",
				panel: "#1d1d22",
				row: "#34343a",
				accent: "#7fb4d8",
			},
			dark: {
				bg: "#1a1a1f",
				panel: "#222226",
				row: "#2c2c33",
				accent: "#7fb4d8",
			},
		},
	},
	{
		value: "nocturne",
		label: "Nocturne",
		tagline: "Near-black with one warm amber accent.",
		darkOnly: true,
		swatches: {
			light: {
				bg: "#141418",
				panel: "#1b1b21",
				row: "#23232a",
				accent: "#c98a4f",
			},
			dark: {
				bg: "#101014",
				panel: "#181820",
				row: "#23232c",
				accent: "#c98a4f",
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
						Surface colour and accent. Calibrated low-saturation palettes.
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
									) : opt.darkOnly ? (
										<span className="font-semibold text-[10px] text-faint uppercase tracking-wider">
											Dark only
										</span>
									) : null}
								</div>
								<p className="text-muted text-xs leading-snug">{opt.tagline}</p>
								<div className="flex gap-2">
									{!opt.darkOnly && (
										<Swatches mode="light" colors={opt.swatches.light} />
									)}
									<Swatches mode="dark" colors={opt.swatches.dark} />
								</div>
								<div className="flex justify-between text-[10px] text-faint">
									{opt.darkOnly ? (
										<span>Dark</span>
									) : (
										<>
											<span>Light</span>
											<span>Dark</span>
										</>
									)}
								</div>
							</button>
						);
					})}
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<div>
					<h2 className="font-semibold text-primary text-sm">Mode</h2>
					<p className="text-muted text-xs">
						{isDarkOnlyFamily(currentFamily)
							? "This family is dark only — the mode setting is ignored."
							: "Light or dark surfaces within the chosen family."}
					</p>
				</div>
				<div className="flex gap-2">
					{MODE_OPTIONS.map((opt) => {
						const isActive = currentMode === opt.value;
						const disabled = isDarkOnlyFamily(currentFamily);
						return (
							<button
								key={opt.value}
								type="button"
								disabled={disabled}
								onClick={() =>
									setSetting.mutate({ key: "theme", value: opt.value })
								}
								className={`min-w-[88px] rounded border px-3 py-1.5 text-xs transition-colors ${
									isActive
										? "border-transparent text-[color:var(--accent-fg)]"
										: "border-divider text-muted hover:surface-row hover:text-primary"
								} disabled:cursor-not-allowed disabled:opacity-50`}
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

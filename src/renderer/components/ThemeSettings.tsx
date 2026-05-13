// Theme category: theme-family picker (Slate / Sunrise / Meadow) with visual
// preview swatches, plus the existing light/dark/auto mode radio. Selecting a
// family changes the entire colour personality + typography of the app; the
// mode radio only flips the light/dark surface inversion.

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
	emoji: string;
	displayFont: string;
	swatches: {
		light: { bg: string; panel: string; row: string; accent: string };
		dark: { bg: string; panel: string; row: string; accent: string };
	};
}

const FAMILY_OPTIONS: FamilyOption[] = [
	{
		value: "slate",
		label: "Slate",
		tagline: "Neutral cool grey. System fonts. Quiet and classic.",
		emoji: "🪨",
		displayFont: "ui-sans-serif, system-ui, sans-serif",
		swatches: {
			light: {
				bg: "#ffffff",
				panel: "#f4f4f5",
				row: "#e4e4e7",
				accent: "#2563eb",
			},
			dark: {
				bg: "#1a1a1f",
				panel: "#27272a",
				row: "#3f3f46",
				accent: "#60a5fa",
			},
		},
	},
	{
		value: "sunrise",
		label: "Sunrise",
		tagline: "Warm citrus & coral. Fraunces serif + Plus Jakarta Sans.",
		emoji: "🌅",
		displayFont: '"Fraunces Variable", "Fraunces", Georgia, serif',
		swatches: {
			light: {
				bg: "#fdf6ec",
				panel: "#faecd3",
				row: "#f3d9a4",
				accent: "#c2410c",
			},
			dark: {
				bg: "#1c130c",
				panel: "#2a1e14",
				row: "#3d2b1c",
				accent: "#fb923c",
			},
		},
	},
	{
		value: "meadow",
		label: "Meadow",
		tagline: "Verdant & energetic. Gloock serif + Manrope.",
		emoji: "🌿",
		displayFont: '"Gloock", Georgia, serif',
		swatches: {
			light: {
				bg: "#f0fdf4",
				panel: "#dcfce7",
				row: "#bbf7d0",
				accent: "#f59e0b",
			},
			dark: {
				bg: "#0a1f17",
				panel: "#11332a",
				row: "#1c4a3a",
				accent: "#fde047",
			},
		},
	},
	{
		value: "catppuccin",
		label: "Catppuccin",
		tagline: "Soothing pastels. Latte + Mocha. Inter + JetBrains Mono.",
		emoji: "🐈",
		displayFont: '"Inter Variable", "Inter", ui-sans-serif, sans-serif',
		swatches: {
			light: {
				bg: "#eff1f5",
				panel: "#e6e9ef",
				row: "#ccd0da",
				accent: "#8839ef",
			},
			dark: {
				bg: "#1e1e2e",
				panel: "#313244",
				row: "#45475a",
				accent: "#cba6f7",
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
			className="flex h-14 w-full overflow-hidden rounded border border-divider"
		>
			<div
				style={{ backgroundColor: colors.bg }}
				className="flex-1 border-r border-divider"
			/>
			<div
				style={{ backgroundColor: colors.panel }}
				className="flex-1 border-r border-divider"
			/>
			<div
				style={{ backgroundColor: colors.row }}
				className="flex-1 border-r border-divider"
			/>
			<div style={{ backgroundColor: colors.accent }} className="w-3" />
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
		<div className="flex flex-col gap-6">
			<section className="flex flex-col gap-3">
				<div>
					<h2 className="text-base font-semibold text-primary">Theme family</h2>
					<p className="text-xs text-muted">
						The personality — colour, typography, mood. Pair with any mode
						below.
					</p>
				</div>
				<div className="grid grid-cols-1 gap-3">
					{FAMILY_OPTIONS.map((opt) => {
						const active = currentFamily === opt.value;
						return (
							<button
								key={opt.value}
								type="button"
								onClick={() =>
									setSetting.mutate({ key: "themeFamily", value: opt.value })
								}
								className={`flex flex-col gap-3 rounded-lg border p-4 text-left transition-all ${
									active
										? "border-divider surface-row"
										: "border-divider hover:opacity-90"
								}`}
								style={
									active
										? {
												borderColor: opt.swatches.light.accent,
												boxShadow: `0 0 0 1px ${opt.swatches.light.accent}`,
											}
										: undefined
								}
							>
								<div className="flex items-baseline justify-between gap-3">
									<div className="flex items-baseline gap-2">
										<span className="text-2xl leading-none">{opt.emoji}</span>
										<span
											className="text-2xl font-semibold text-primary"
											style={{ fontFamily: opt.displayFont }}
										>
											{opt.label}
										</span>
									</div>
									{active && (
										<span
											className="text-[10px] uppercase tracking-wider"
											style={{ color: opt.swatches.light.accent }}
										>
											● Active
										</span>
									)}
								</div>
								<p className="text-xs text-muted">{opt.tagline}</p>
								<div className="flex gap-2">
									<div className="flex flex-1 flex-col gap-1">
										<span className="text-[10px] uppercase tracking-wider text-faint">
											Light
										</span>
										<Swatches mode="light" colors={opt.swatches.light} />
									</div>
									<div className="flex flex-1 flex-col gap-1">
										<span className="text-[10px] uppercase tracking-wider text-faint">
											Dark
										</span>
										<Swatches mode="dark" colors={opt.swatches.dark} />
									</div>
								</div>
							</button>
						);
					})}
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<div>
					<h2 className="text-base font-semibold text-primary">Mode</h2>
					<p className="text-xs text-muted">
						Light or dark surfaces within the chosen family.
					</p>
				</div>
				{MODE_OPTIONS.map((opt) => (
					<label
						key={opt.value}
						className={`flex cursor-pointer items-start gap-3 rounded border border-divider p-3 ${
							currentMode === opt.value ? "surface-row" : ""
						}`}
					>
						<input
							type="radio"
							name="theme-mode"
							value={opt.value}
							checked={currentMode === opt.value}
							onChange={() =>
								setSetting.mutate({ key: "theme", value: opt.value })
							}
							className="mt-1"
						/>
						<div>
							<div className="text-sm font-medium text-primary">
								{opt.label}
							</div>
							<div className="text-xs text-muted">{opt.description}</div>
						</div>
					</label>
				))}
			</section>
		</div>
	);
}

// Font category: typography preset, four family overrides (curated select +
// custom input), and six per-region size sliders.

import React from "react";
import {
	type AppSettingsKey,
	type FontFamilyRegion,
	type FontSizeRegion,
	getFontFamily,
	getFontSize,
	getTypographyPreset,
} from "../../shared/app-settings-keys";
import { useSetSetting, useSettings } from "../queries";

// Empty string = no override; falls through to the active typography preset.
const PROPORTIONAL_FAMILIES = [
	"",
	'"Bricolage Grotesque Variable", "Bricolage Grotesque", system-ui, sans-serif',
	'"Inter Variable", "Inter", -apple-system, system-ui, sans-serif',
	'"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif',
	'"Instrument Serif", Georgia, serif',
	'"Hanken Grotesk Variable", "Hanken Grotesk", system-ui, sans-serif',
	'"Spline Sans Variable", "Spline Sans", system-ui, sans-serif',
	'"Familjen Grotesk Variable", "Familjen Grotesk", system-ui, sans-serif',
	"system-ui, -apple-system, sans-serif",
	'Georgia, "Times New Roman", serif',
];

const MONO_FAMILIES = [
	"",
	'"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace',
	'"IBM Plex Mono", ui-monospace, monospace',
	'"Spline Sans Mono Variable", "Spline Sans Mono", ui-monospace, monospace',
	"ui-monospace, SFMono-Regular, Menlo, monospace",
];

const FAMILY_REGIONS: {
	id: FontFamilyRegion;
	label: string;
	key: AppSettingsKey;
}[] = [
	{ id: "display", label: "Display font family", key: "fontFamilyDisplay" },
	{ id: "interface", label: "Interface font family", key: "fontFamily" },
	{ id: "content", label: "Content font family", key: "fontFamilyContent" },
	{ id: "mono", label: "Monospace font family", key: "fontFamilyMono" },
];

const REGIONS: { id: FontSizeRegion; label: string; key: AppSettingsKey }[] = [
	{ id: "interface", label: "Interface scale", key: "fontSize.interface" },
	{ id: "compact", label: "Compact / navigation", key: "fontSize.compact" },
	{
		id: "chatAssistant",
		label: "Assistant content",
		key: "fontSize.chatAssistant",
	},
	{ id: "chatUser", label: "User content", key: "fontSize.chatUser" },
	{ id: "composer", label: "Composer", key: "fontSize.composer" },
	{ id: "codeBlock", label: "Code / data", key: "fontSize.codeBlock" },
];

const MIN_SIZE = 11;
const MAX_SIZE = 32;

export function FontSettings() {
	const { data } = useSettings();
	const setSetting = useSetSetting();
	const settings = data?.settings ?? {};

	return (
		<div className="flex flex-col gap-5">
			<h2 className="type-section-heading">Font</h2>

			<label className="flex flex-col gap-1 type-label">
				Typography preset
				<select
					value={getTypographyPreset(settings)}
					onChange={(event) =>
						setSetting.mutate({
							key: "typographyPreset",
							value: event.target.value,
						})
					}
					className="surface-row rounded px-2 py-1 type-control"
				>
					<option value="default">Consistent default</option>
					<option value="theme">Follow color theme</option>
				</select>
			</label>

			{FAMILY_REGIONS.map(({ id, label, key }) => (
				<FamilyControl
					key={id}
					id={id}
					label={label}
					value={getFontFamily(settings, id)}
					options={id === "mono" ? MONO_FAMILIES : PROPORTIONAL_FAMILIES}
					onChange={(value) => setSetting.mutate({ key, value })}
				/>
			))}

			<div>
				<div className="mb-2 type-section-heading">Sizes (px)</div>
				{REGIONS.map(({ id, label, key }) => {
					const size = getFontSize(settings, id);
					return (
						<label key={id} className="mb-2 flex items-center gap-3 type-label">
							<span className="w-44">{label}</span>
							<input
								type="range"
								min={MIN_SIZE}
								max={MAX_SIZE}
								value={size}
								onChange={(event) =>
									setSetting.mutate({
										key,
										value: Number(event.target.value),
									})
								}
								className="flex-1 type-control"
							/>
							<span className="w-10 text-right type-metadata type-tabular">
								{size}
							</span>
						</label>
					);
				})}
			</div>
		</div>
	);
}

function FamilyControl({
	id,
	label,
	value,
	options,
	onChange,
}: {
	id: FontFamilyRegion;
	label: string;
	value: string;
	options: string[];
	onChange: (value: string) => void;
}) {
	const [text, setText] = React.useState(value);

	React.useEffect(() => {
		setText(value);
	}, [value]);

	const selectValue = options.includes(value) ? value : "__custom__";
	const selectId = `font-family-${id}`;

	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={selectId} className="type-label">
				{label}
			</label>
			<div className="flex gap-2">
				<select
					id={selectId}
					value={selectValue}
					onChange={(event) => {
						const next =
							event.target.value === "__custom__" ? value : event.target.value;
						setText(next);
						if (next !== value) onChange(next);
					}}
					className="surface-row rounded px-2 py-1 type-control"
				>
					{options.map((option) => (
						<option key={option} value={option}>
							{option === ""
								? "Theme default"
								: option.split(",")[0].replace(/"/g, "")}
						</option>
					))}
					{selectValue === "__custom__" && (
						<option value="__custom__">Custom…</option>
					)}
				</select>
				<input
					type="text"
					value={text}
					onChange={(event) => setText(event.target.value)}
					onBlur={() => {
						const next = text.trim();
						if (next !== value) onChange(next);
					}}
					className="flex-1 surface-row rounded px-2 py-1 type-control"
					aria-label={`${label} custom value`}
					placeholder="custom font-family (leave blank for default)"
				/>
			</div>
		</div>
	);
}

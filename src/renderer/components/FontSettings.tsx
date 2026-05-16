// Font category: UI family + monospace family (text input + curated
// dropdown), plus 5 per-region size sliders.

import React from "react";
import {
	type FontSizeRegion,
	getFontFamily,
	getFontFamilyMono,
	getFontSize,
} from "../../shared/app-settings-keys";
import { useSetSetting, useSettings } from "../queries";

// Empty string = no override; falls through to the theme's --font-body /
// --font-mono token (Inter Variable / JetBrains Mono Variable by default).
const UI_FAMILIES = [
	"",
	'"Inter Variable", "Inter", -apple-system, system-ui, sans-serif',
	"system-ui, -apple-system, sans-serif",
	'"SF Pro Display", system-ui, sans-serif',
	'"Helvetica Neue", Helvetica, sans-serif',
	'Georgia, "Times New Roman", serif',
];

const MONO_FAMILIES = [
	"",
	'"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace',
	"ui-monospace, SFMono-Regular, monospace",
	'"Fira Code", ui-monospace, monospace',
	'"Cascadia Code", ui-monospace, monospace',
	'"Menlo", ui-monospace, monospace',
];

const UI_DEFAULT_LABEL = "Default (Inter)";
const MONO_DEFAULT_LABEL = "Default (JetBrains Mono)";

const REGIONS: { id: FontSizeRegion; label: string }[] = [
	{ id: "sidebar", label: "Sidebar" },
	{ id: "chatAssistant", label: "Chat — assistant text" },
	{ id: "chatUser", label: "Chat — user message" },
	{ id: "composer", label: "Composer input" },
	{ id: "codeBlock", label: "Code blocks" },
];

const REGION_KEY: Record<FontSizeRegion, string> = {
	sidebar: "fontSize.sidebar",
	chatAssistant: "fontSize.chatAssistant",
	chatUser: "fontSize.chatUser",
	composer: "fontSize.composer",
	codeBlock: "fontSize.codeBlock",
};

const MIN_SIZE = 8;
const MAX_SIZE = 32;

export function FontSettings() {
	const { data } = useSettings();
	const setSetting = useSetSetting();
	const settings = data?.settings ?? {};

	return (
		<div className="flex flex-col gap-5">
			<h2 className="text-base font-semibold">Font</h2>

			<FamilyControl
				label="UI font family"
				value={getFontFamily(settings)}
				options={UI_FAMILIES}
				defaultLabel={UI_DEFAULT_LABEL}
				onChange={(v) => setSetting.mutate({ key: "fontFamily", value: v })}
			/>
			<FamilyControl
				label="Monospace font family"
				value={getFontFamilyMono(settings)}
				options={MONO_FAMILIES}
				defaultLabel={MONO_DEFAULT_LABEL}
				onChange={(v) => setSetting.mutate({ key: "fontFamilyMono", value: v })}
			/>

			<div>
				<div className="mb-2 text-sm font-medium">Sizes (px)</div>
				{REGIONS.map(({ id, label }) => {
					const size = getFontSize(settings, id);
					return (
						<div key={id} className="mb-2 flex items-center gap-3 text-sm">
							<span className="w-44 text-muted">{label}</span>
							<input
								type="range"
								min={MIN_SIZE}
								max={MAX_SIZE}
								value={size}
								onChange={(e) =>
									setSetting.mutate({
										key: REGION_KEY[id],
										value: Number(e.target.value),
									})
								}
								className="flex-1"
							/>
							<span className="w-10 text-right tabular-nums">{size}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function FamilyControl({
	label,
	value,
	options,
	defaultLabel,
	onChange,
}: {
	label: string;
	value: string;
	options: string[];
	defaultLabel: string;
	onChange: (v: string) => void;
}) {
	const [text, setText] = React.useState(value);

	React.useEffect(() => {
		setText(value);
	}, [value]);

	const selectValue = options.includes(value) ? value : "__custom__";

	return (
		<div className="flex flex-col gap-1">
			<div className="text-sm font-medium">{label}</div>
			<div className="flex gap-2">
				<select
					value={selectValue}
					onChange={(e) => {
						const next =
							e.target.value === "__custom__" ? value : e.target.value;
						setText(next);
						if (next !== value) onChange(next);
					}}
					className="surface-row rounded px-2 py-1 text-sm"
				>
					{options.map((opt) => (
						<option key={opt} value={opt}>
							{opt === "" ? defaultLabel : opt.split(",")[0].replace(/"/g, "")}
						</option>
					))}
					{selectValue === "__custom__" && (
						<option value="__custom__">Custom…</option>
					)}
				</select>
				<input
					type="text"
					value={text}
					onChange={(e) => setText(e.target.value)}
					onBlur={() => {
						const next = text.trim();
						if (next !== value) onChange(next);
					}}
					className="flex-1 surface-row rounded px-2 py-1 text-sm"
					placeholder="custom font-family (leave blank for default)"
				/>
			</div>
		</div>
	);
}

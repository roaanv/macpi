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

const UI_FAMILIES = [
	"system-ui, -apple-system, sans-serif",
	'"Inter", system-ui, sans-serif',
	'"SF Pro Display", system-ui, sans-serif',
	'"Helvetica Neue", Helvetica, sans-serif',
	'Georgia, "Times New Roman", serif',
];

const MONO_FAMILIES = [
	"ui-monospace, SFMono-Regular, monospace",
	'"JetBrains Mono", ui-monospace, monospace',
	'"Fira Code", ui-monospace, monospace',
	'"Cascadia Code", ui-monospace, monospace',
	'"Menlo", ui-monospace, monospace',
];

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
				onChange={(v) => setSetting.mutate({ key: "fontFamily", value: v })}
			/>
			<FamilyControl
				label="Monospace font family"
				value={getFontFamilyMono(settings)}
				options={MONO_FAMILIES}
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
	onChange,
}: {
	label: string;
	value: string;
	options: string[];
	onChange: (v: string) => void;
}) {
	const [text, setText] = React.useState(value);

	React.useEffect(() => {
		setText(value);
	}, [value]);

	return (
		<div className="flex flex-col gap-1">
			<div className="text-sm font-medium">{label}</div>
			<div className="flex gap-2">
				<select
					value={options.includes(value) ? value : ""}
					onChange={(e) => {
						if (e.target.value) {
							setText(e.target.value);
							onChange(e.target.value);
						}
					}}
					className="surface-row rounded px-2 py-1 text-sm"
				>
					<option value="">— pick —</option>
					{options.map((opt) => (
						<option key={opt} value={opt}>
							{opt.split(",")[0].replace(/"/g, "")}
						</option>
					))}
				</select>
				<input
					type="text"
					value={text}
					onChange={(e) => setText(e.target.value)}
					onBlur={() => {
						if (text.trim() && text !== value) onChange(text.trim());
					}}
					className="flex-1 surface-row rounded px-2 py-1 text-sm"
					placeholder="custom font-family"
				/>
			</div>
		</div>
	);
}

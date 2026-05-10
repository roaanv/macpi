// Theme category: radio group for light / dark / auto.

import { getTheme, type ThemeMode } from "../../shared/app-settings-keys";
import { useSetSetting, useSettings } from "../queries";

const OPTIONS: { value: ThemeMode; label: string; description: string }[] = [
	{
		value: "auto",
		label: "Auto",
		description: "Follow the operating system's appearance setting.",
	},
	{ value: "light", label: "Light", description: "Always use light mode." },
	{ value: "dark", label: "Dark", description: "Always use dark mode." },
];

export function ThemeSettings() {
	const { data } = useSettings();
	const setSetting = useSetSetting();
	const current = getTheme(data?.settings ?? {});

	return (
		<div className="flex flex-col gap-3">
			<h2 className="text-base font-semibold">Theme</h2>
			{OPTIONS.map((opt) => (
				<label
					key={opt.value}
					className={`flex cursor-pointer items-start gap-3 rounded border border-divider p-3 ${
						current === opt.value ? "surface-row" : ""
					}`}
				>
					<input
						type="radio"
						name="theme"
						value={opt.value}
						checked={current === opt.value}
						onChange={() =>
							setSetting.mutate({ key: "theme", value: opt.value })
						}
						className="mt-1"
					/>
					<div>
						<div className="text-sm font-medium">{opt.label}</div>
						<div className="text-xs text-muted">{opt.description}</div>
					</div>
				</label>
			))}
		</div>
	);
}

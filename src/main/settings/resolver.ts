// Pure settings cascade resolver. Merges global/channel/session overrides on top of defaults.
// No side effects — does not read from the database directly.

import {
	DEFAULT_SETTINGS,
	SETTINGS_KEYS,
	type SettingsKey,
	type SettingsValues,
} from "../../shared/settings-keys";

export type Layer = "default" | "global" | "channel" | "session";

export type LayerOverrides = Partial<SettingsValues>;

export interface SettingsLayers {
	global: LayerOverrides;
	channel: LayerOverrides;
	session: LayerOverrides;
}

export interface ResolvedSettings {
	values: SettingsValues;
	provenance: Record<SettingsKey, Layer>;
}

const ORDER: ("session" | "channel" | "global")[] = [
	"session",
	"channel",
	"global",
];

export function resolveSettings(layers: SettingsLayers): ResolvedSettings {
	const values = { ...DEFAULT_SETTINGS } as SettingsValues;
	const provenance = {} as Record<SettingsKey, Layer>;

	for (const key of SETTINGS_KEYS) {
		let assigned: Layer = "default";
		for (const layerName of ORDER) {
			const layer = layers[layerName];
			if (key in layer && layer[key] !== undefined) {
				(values[key] as unknown) = layer[key] as unknown;
				assigned = layerName;
				break;
			}
		}
		provenance[key] = assigned;
	}
	return { values, provenance };
}

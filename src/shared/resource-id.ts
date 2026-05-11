// Stable id for resources (skills, extensions, prompts) discovered by pi.
// Format: `<type>:<source>:<relative-path-from-source-root>`.
// Source MAY contain colons (e.g., git@host:path); we split on the FIRST
// colon for type, then the LAST colon to separate source from path.

export type ResourceType = "skill" | "extension" | "prompt";

export interface ResourceIdParts {
	type: ResourceType;
	source: string;
	relativePath: string;
}

export function skillResourceId(opts: {
	source: string;
	relativePath: string;
}): string {
	return `skill:${opts.source}:${opts.relativePath}`;
}

export function parseResourceId(id: string): ResourceIdParts | null {
	const firstColon = id.indexOf(":");
	if (firstColon < 0) return null;
	const type = id.slice(0, firstColon) as ResourceType;
	if (type !== "skill" && type !== "extension" && type !== "prompt") {
		return null;
	}
	const rest = id.slice(firstColon + 1);
	const lastColon = rest.lastIndexOf(":");
	if (lastColon < 0) return null;
	const source = rest.slice(0, lastColon);
	const relativePath = rest.slice(lastColon + 1);
	if (!source || !relativePath) return null;
	return { type, source, relativePath };
}

export function filterEnabled<T extends { id: string }>(
	items: T[],
	enabled: Record<string, boolean>,
): T[] {
	return items.filter((item) => enabled[item.id] !== false);
}

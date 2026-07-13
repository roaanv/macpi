import type {
	ModelSummary,
	ProviderSummary,
} from "../../shared/model-auth-types";

export type ProviderFilter = "all" | "configured" | "cloud" | "custom";

export interface ProviderView extends ProviderSummary {
	kind: "cloud" | "custom";
	initials: string;
	models: ModelSummary[];
}

export interface ProviderModelGroup {
	provider: ProviderView;
	models: ModelSummary[];
}

export function configuredProviderViews(
	providers: readonly ProviderView[],
): ProviderView[] {
	return providers.filter((provider) => provider.authStatus.configured);
}

export function filterModels(
	models: readonly ModelSummary[],
	query: string,
): ModelSummary[] {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return [...models];

	return models.filter((model) =>
		[model.name, model.id, model.providerName]
			.join(" ")
			.toLowerCase()
			.includes(normalized),
	);
}

export function groupModelsByProvider(
	providers: readonly ProviderView[],
): ProviderModelGroup[] {
	return configuredProviderViews(providers).map((provider) => ({
		provider,
		models: provider.models,
	}));
}

export function buildProviderViews(
	providers: readonly ProviderSummary[],
	models: readonly ModelSummary[],
): ProviderView[] {
	return providers.map((provider) => ({
		...provider,
		kind: isCustomProvider(provider.id) ? "custom" : "cloud",
		initials: providerInitials(provider.name || provider.id),
		models: models.filter((model) => model.provider === provider.id),
	}));
}

export function filterProviderViews(
	providers: readonly ProviderView[],
	filter: ProviderFilter,
	query: string,
): ProviderView[] {
	const normalized = query.trim().toLowerCase();
	return providers.filter((provider) => {
		if (filter === "configured" && !provider.authStatus.configured)
			return false;
		if (filter === "cloud" && provider.kind !== "cloud") return false;
		if (filter === "custom" && provider.kind !== "custom") return false;
		if (!normalized) return true;
		return [provider.name, provider.id, provider.authType]
			.join(" ")
			.toLowerCase()
			.includes(normalized);
	});
}

export function providerInitials(name: string): string {
	const words = name
		.replace(/[^a-zA-Z0-9 ]/g, " ")
		.split(/\s+/)
		.filter(Boolean);
	if (words.length === 0) return "??";
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function isCustomProvider(providerId: string): boolean {
	return providerId.startsWith("custom-");
}

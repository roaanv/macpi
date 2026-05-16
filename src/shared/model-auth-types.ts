export type AuthSource =
	| "stored"
	| "runtime"
	| "environment"
	| "fallback"
	| "models_json_key"
	| "models_json_command";

export type ProviderAuthType = "oauth" | "api_key" | "custom" | "cloud" | "unknown";

export interface ProviderSummary {
	id: string;
	name: string;
	authType: ProviderAuthType;
	authStatus: {
		configured: boolean;
		source?: AuthSource;
		label?: string;
	};
	modelCount: number;
	availableModelCount: number;
	supportsOAuth: boolean;
	supportsStoredApiKey: boolean;
}

export interface ModelSummary {
	provider: string;
	providerName: string;
	id: string;
	name: string;
	authConfigured: boolean;
	usingOAuth: boolean;
	reasoning: boolean;
	thinkingLevels: string[];
	input: Array<"text" | "image">;
	contextWindow: number;
	maxTokens: number;
}

export interface SelectedModelRef {
	provider: string;
	modelId: string;
}

export type OAuthEvent =
	| { type: "oauth.authUrl"; loginId: string; provider: string; url: string; instructions?: string }
	| { type: "oauth.deviceCode"; loginId: string; provider: string; code: string; url?: string; expiresAt?: number }
	| { type: "oauth.prompt"; loginId: string; provider: string; promptId: string; message: string; placeholder?: string }
	| { type: "oauth.select"; loginId: string; provider: string; promptId: string; message: string; options: string[] }
	| { type: "oauth.progress"; loginId: string; provider: string; message: string }
	| { type: "oauth.success"; loginId: string; provider: string }
	| { type: "oauth.error"; loginId: string; provider: string; message: string }
	| { type: "oauth.cancelled"; loginId: string; provider: string };

export interface ModelsJsonReadResult {
	path: string;
	text: string;
	registryError?: string;
}

export interface ImportPiAuthModelsStatus {
	sourceAuthExists: boolean;
	sourceModelsExists: boolean;
	destAuthExists: boolean;
	destModelsExists: boolean;
	sourceAuthPath: string;
	sourceModelsPath: string;
	destAuthPath: string;
	destModelsPath: string;
}

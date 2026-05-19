import { buildProxyEnv } from "../shared/app-settings-keys";

const PROXY_ENV_KEYS = [
	"HTTP_PROXY",
	"http_proxy",
	"HTTPS_PROXY",
	"https_proxy",
	"NO_PROXY",
	"no_proxy",
] as const;

let proxyEnvQueue: Promise<unknown> = Promise.resolve();

function enqueueProxyEnvCallback<T>(callback: () => Promise<T>): Promise<T> {
	const queued = proxyEnvQueue.catch(() => undefined).then(callback);
	proxyEnvQueue = queued.catch(() => undefined);
	return queued;
}

export async function withProxyEnv<T>(
	settings: Record<string, unknown>,
	callback: () => Promise<T> | T,
): Promise<T> {
	return await enqueueProxyEnvCallback(async () => {
		const overrides = buildProxyEnv(settings);
		const keys = Object.keys(overrides);
		if (keys.length === 0) return await callback();

		return await applyProxyEnv(overrides, keys, callback);
	});
}

/**
 * Immediate proxy env scope for short queue-control operations only.
 * Do not use this for long-running or network operations: process.env is global,
 * so this intentionally bypasses the serialized proxy env queue and can overlap
 * other in-flight scopes.
 */
export async function withProxyEnvImmediate<T>(
	settings: Record<string, unknown>,
	callback: () => Promise<T> | T,
): Promise<T> {
	const overrides = buildProxyEnv(settings);
	const keys = Object.keys(overrides);
	return await applyProxyEnv(
		overrides,
		keys.length === 0 ? [...PROXY_ENV_KEYS] : keys,
		callback,
	);
}

async function applyProxyEnv<T>(
	overrides: Record<string, string>,
	keys: string[],
	callback: () => Promise<T> | T,
): Promise<T> {
	const previous = new Map<string, string | undefined>();
	for (const key of keys) {
		previous.set(key, process.env[key]);
		if (Object.hasOwn(overrides, key)) process.env[key] = overrides[key];
		else delete process.env[key];
	}

	try {
		return await callback();
	} finally {
		for (const key of keys) {
			const value = previous.get(key);
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

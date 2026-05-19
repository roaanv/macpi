import { buildProxyEnv } from "../shared/app-settings-keys";

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

		const previous = new Map<string, string | undefined>();
		for (const key of keys) {
			previous.set(key, process.env[key]);
			process.env[key] = overrides[key];
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
	});
}

import { afterEach, describe, expect, it } from "vitest";
import { withProxyEnv, withProxyEnvImmediate } from "../../src/main/proxy-env";

const KEYS = [
	"HTTP_PROXY",
	"http_proxy",
	"HTTPS_PROXY",
	"https_proxy",
	"NO_PROXY",
	"no_proxy",
] as const;

const original = new Map<string, string | undefined>();
for (const key of KEYS) original.set(key, process.env[key]);

afterEach(() => {
	for (const key of KEYS) {
		const value = original.get(key);
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe("withProxyEnv", () => {
	it("sets configured proxy variables during callback and restores afterward", async () => {
		delete process.env.HTTP_PROXY;
		delete process.env.http_proxy;
		process.env.HTTPS_PROXY = "ambient-https";
		process.env.https_proxy = "ambient-https-lower";

		let seen: Record<string, string | undefined> = {};
		const result = await withProxyEnv(
			{
				httpProxy: "http://proxy.example.com:8080",
				httpsProxy: "https://secure.example.com:8443",
				noProxy: "localhost,127.0.0.1",
			},
			async () => {
				seen = {
					HTTP_PROXY: process.env.HTTP_PROXY,
					http_proxy: process.env.http_proxy,
					HTTPS_PROXY: process.env.HTTPS_PROXY,
					https_proxy: process.env.https_proxy,
					NO_PROXY: process.env.NO_PROXY,
					no_proxy: process.env.no_proxy,
				};
				return "ok";
			},
		);

		expect(result).toBe("ok");
		expect(seen).toEqual({
			HTTP_PROXY: "http://proxy.example.com:8080",
			http_proxy: "http://proxy.example.com:8080",
			HTTPS_PROXY: "https://secure.example.com:8443",
			https_proxy: "https://secure.example.com:8443",
			NO_PROXY: "localhost,127.0.0.1",
			no_proxy: "localhost,127.0.0.1",
		});
		expect(process.env.HTTP_PROXY).toBeUndefined();
		expect(process.env.http_proxy).toBeUndefined();
		expect(process.env.HTTPS_PROXY).toBe("ambient-https");
		expect(process.env.https_proxy).toBe("ambient-https-lower");
	});

	it("does not touch ambient env when settings are empty", async () => {
		process.env.HTTP_PROXY = "ambient-http";
		process.env.NO_PROXY = "ambient-no-proxy";

		let seenHttp: string | undefined;
		let seenNoProxy: string | undefined;
		await withProxyEnv({}, async () => {
			seenHttp = process.env.HTTP_PROXY;
			seenNoProxy = process.env.NO_PROXY;
		});

		expect(seenHttp).toBe("ambient-http");
		expect(seenNoProxy).toBe("ambient-no-proxy");
		expect(process.env.HTTP_PROXY).toBe("ambient-http");
		expect(process.env.NO_PROXY).toBe("ambient-no-proxy");
	});

	it("restores env when callback throws", async () => {
		process.env.HTTPS_PROXY = "ambient-https";

		await expect(
			withProxyEnv(
				{ httpsProxy: "http://proxy.example.com:8080" },
				async () => {
					throw new Error("boom");
				},
			),
		).rejects.toThrow("boom");

		expect(process.env.HTTPS_PROXY).toBe("ambient-https");
	});

	it("serializes overlapping async callbacks so proxy env cannot interleave", async () => {
		delete process.env.HTTP_PROXY;

		let releaseFirst: () => void = () => {};
		const firstRelease = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		let firstStarted = false;
		let markFirstStarted: () => void = () => {};
		const firstStartedPromise = new Promise<void>((resolve) => {
			markFirstStarted = resolve;
		});
		let secondStarted = false;

		const first = withProxyEnv(
			{ httpProxy: "http://first.example.com:8080" },
			async () => {
				firstStarted = true;
				markFirstStarted();
				expect(process.env.HTTP_PROXY).toBe("http://first.example.com:8080");
				await firstRelease;
				expect(process.env.HTTP_PROXY).toBe("http://first.example.com:8080");
				return "first";
			},
		);

		await firstStartedPromise;
		expect(firstStarted).toBe(true);

		const second = withProxyEnv(
			{ httpProxy: "http://second.example.com:8080" },
			async () => {
				secondStarted = true;
				expect(process.env.HTTP_PROXY).toBe("http://second.example.com:8080");
				return "second";
			},
		);

		expect(secondStarted).toBe(false);
		expect(process.env.HTTP_PROXY).toBe("http://first.example.com:8080");

		releaseFirst();

		await expect(first).resolves.toBe("first");
		await expect(second).resolves.toBe("second");
		expect(process.env.HTTP_PROXY).toBeUndefined();
	});

	it("supports sync callbacks and restores env afterward", async () => {
		delete process.env.NO_PROXY;

		const result = await withProxyEnv({ noProxy: "localhost" }, () => {
			expect(process.env.NO_PROXY).toBe("localhost");
			return 42;
		});

		expect(result).toBe(42);
		expect(process.env.NO_PROXY).toBeUndefined();
	});
});

describe("withProxyEnvImmediate", () => {
	it("sets configured proxy variables during callback and restores afterward", async () => {
		delete process.env.HTTP_PROXY;
		process.env.HTTPS_PROXY = "ambient-https";

		let seen: Record<string, string | undefined> = {};
		const result = await withProxyEnvImmediate(
			{
				httpProxy: "http://immediate.example.com:8080",
				httpsProxy: "https://immediate-secure.example.com:8443",
				noProxy: "localhost",
			},
			async () => {
				seen = {
					HTTP_PROXY: process.env.HTTP_PROXY,
					http_proxy: process.env.http_proxy,
					HTTPS_PROXY: process.env.HTTPS_PROXY,
					https_proxy: process.env.https_proxy,
					NO_PROXY: process.env.NO_PROXY,
					no_proxy: process.env.no_proxy,
				};
				return "ok";
			},
		);

		expect(result).toBe("ok");
		expect(seen).toEqual({
			HTTP_PROXY: "http://immediate.example.com:8080",
			http_proxy: "http://immediate.example.com:8080",
			HTTPS_PROXY: "https://immediate-secure.example.com:8443",
			https_proxy: "https://immediate-secure.example.com:8443",
			NO_PROXY: "localhost",
			no_proxy: "localhost",
		});
		expect(process.env.HTTP_PROXY).toBeUndefined();
		expect(process.env.HTTPS_PROXY).toBe("ambient-https");
	});

	it("masks ambient proxy variables when settings are empty and restores afterward", async () => {
		for (const key of KEYS) process.env[key] = `ambient-${key}`;

		let seen: Record<string, string | undefined> = {};
		await withProxyEnvImmediate({}, async () => {
			seen = Object.fromEntries(
				KEYS.map((key) => [key, process.env[key]]),
			) as Record<string, string | undefined>;
		});

		expect(seen).toEqual({
			HTTP_PROXY: undefined,
			http_proxy: undefined,
			HTTPS_PROXY: undefined,
			https_proxy: undefined,
			NO_PROXY: undefined,
			no_proxy: undefined,
		});
		for (const key of KEYS) expect(process.env[key]).toBe(`ambient-${key}`);
	});
});

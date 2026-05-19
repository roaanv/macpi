# Proxy Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional global HTTP/HTTPS/NO_PROXY settings, expose them in Settings → Proxy, and apply them to newly-created Pi work without mutating existing sessions.

**Architecture:** Proxy values live in the existing global app settings store. Shared pure helpers validate user input and build environment overrides. Main-process Pi operations use a scoped `withProxyEnv` helper so configured values apply only while fresh sessions/resource/package operations are constructed or executed.

**Tech Stack:** Electron main process, React renderer, TanStack Query, Vitest, TypeScript, existing `AppSettingsRepo` / `settings.set` IPC.

---

## Scope and constraints

- Approved spec: `docs/superpowers/specs/2026-05-19-proxy-settings-design.md`.
- Do not add per-channel/session proxy settings.
- Do not support username/password proxy authentication.
- Do not mutate active sessions when settings change.
- Empty proxy fields mean “macpi has no override”; existing ambient `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` values must remain intact.
- Project AGENTS says GitNexus impact analysis is required before editing symbols. If GitNexus MCP tools are available in the implementation session, run impact analysis before modifying each existing function/class/method and report the blast radius. If the tools are unavailable, say so explicitly before editing.

## File structure

- `src/shared/app-settings-keys.ts` — add proxy defaults, accessors, `validateProxyUrl`, `buildProxyEnv`.
- `tests/unit/app-settings-keys.test.ts` — unit tests for proxy defaults, validation, env building.
- `src/main/proxy-env.ts` — new scoped environment helper `withProxyEnv`.
- `tests/unit/proxy-env.test.ts` — unit tests for restoring `process.env` after scoped calls.
- `src/main/pi-session-manager.ts` — wrap fresh Pi session/resource/package operations with proxy env.
- `src/renderer/components/ProxySettings.tsx` — new Settings category panel with local draft fields and inline validation.
- `src/renderer/components/GlobalSettingsDialog.tsx` — register the new Proxy category.

---

### Task 1: Shared proxy settings helpers

**Files:**
- Modify: `src/shared/app-settings-keys.ts`
- Modify: `tests/unit/app-settings-keys.test.ts`

- [ ] **Step 1: Run impact analysis for `APP_SETTINGS_DEFAULTS` and app-settings accessors**

If GitNexus is available, run impact checks for these targets before editing:

```bash
# Use GitNexus MCP if available in the session, not shell, for these exact targets:
# gitnexus_impact({ target: "APP_SETTINGS_DEFAULTS", direction: "upstream" })
# gitnexus_impact({ target: "getDefaultCwd", direction: "upstream" })
```

Expected: low/medium risk; this file is a shared settings helper used by renderer and main. If risk is HIGH or CRITICAL, stop and warn Roaan before editing.

- [ ] **Step 2: Add failing proxy helper tests**

Append this block to `tests/unit/app-settings-keys.test.ts` after the existing `resourceEnabled setting` describe block:

```ts
describe("proxy settings", () => {
	it("defaults proxy settings to empty strings", () => {
		expect(APP_SETTINGS_DEFAULTS.httpProxy).toBe("");
		expect(APP_SETTINGS_DEFAULTS.httpsProxy).toBe("");
		expect(APP_SETTINGS_DEFAULTS.noProxy).toBe("");
	});

	it("reads stored proxy setting strings", () => {
		expect(getHttpProxy({ httpProxy: "http://proxy.example.com:8080" })).toBe(
			"http://proxy.example.com:8080",
		);
		expect(getHttpsProxy({ httpsProxy: "https://secure.example.com:8443" })).toBe(
			"https://secure.example.com:8443",
		);
		expect(getNoProxy({ noProxy: "localhost,127.0.0.1" })).toBe(
			"localhost,127.0.0.1",
		);
	});

	it("falls back to empty strings for malformed stored proxy values", () => {
		expect(getHttpProxy({ httpProxy: 5 })).toBe("");
		expect(getHttpsProxy({ httpsProxy: null })).toBe("");
		expect(getNoProxy({ noProxy: ["localhost"] })).toBe("");
	});

	it("accepts empty and full http(s) proxy URLs", () => {
		expect(validateProxyUrl("")).toEqual({ ok: true });
		expect(validateProxyUrl(" http://proxy.example.com:8080 ")).toEqual({
			ok: true,
		});
		expect(validateProxyUrl("https://proxy.example.com:8443")).toEqual({
			ok: true,
		});
	});

	it("rejects proxy URLs without http(s) protocol", () => {
		expect(validateProxyUrl("proxy.example.com:8080")).toEqual({
			ok: false,
			message: "Enter a full URL starting with http:// or https://",
		});
		expect(validateProxyUrl("socks5://proxy.example.com:1080")).toEqual({
			ok: false,
			message: "Enter a full URL starting with http:// or https://",
		});
	});

	it("rejects proxy URLs with auth", () => {
		expect(validateProxyUrl("http://user:pass@proxy.example.com:8080")).toEqual({
			ok: false,
			message: "Proxy URLs with usernames/passwords are not supported",
		});
	});

	it("builds upper and lower case env overrides for non-empty proxy settings", () => {
		expect(
			buildProxyEnv({
				httpProxy: "http://proxy.example.com:8080",
				httpsProxy: "http://secure-proxy.example.com:8080",
				noProxy: "localhost,127.0.0.1",
			}),
		).toEqual({
			HTTP_PROXY: "http://proxy.example.com:8080",
			http_proxy: "http://proxy.example.com:8080",
			HTTPS_PROXY: "http://secure-proxy.example.com:8080",
			https_proxy: "http://secure-proxy.example.com:8080",
			NO_PROXY: "localhost,127.0.0.1",
			no_proxy: "localhost,127.0.0.1",
		});
	});

	it("omits empty proxy env settings", () => {
		expect(
			buildProxyEnv({
				httpProxy: "",
				httpsProxy: "https://proxy.example.com:8443",
				noProxy: "",
			}),
		).toEqual({
			HTTPS_PROXY: "https://proxy.example.com:8443",
			https_proxy: "https://proxy.example.com:8443",
		});
	});
});
```

Update the import at the top of `tests/unit/app-settings-keys.test.ts` to include the new symbols:

```ts
import {
	APP_SETTINGS_DEFAULTS,
	buildProxyEnv,
	getDefaultCwd,
	getFontFamily,
	getFontFamilyMono,
	getFontSize,
	getHttpProxy,
	getHttpsProxy,
	getNoProxy,
	getResourceEnabled,
	getResourceRoot,
	getSelectedModel,
	getTheme,
	getThemeFamily,
	validateProxyUrl,
} from "../../src/shared/app-settings-keys";
```

- [ ] **Step 3: Run the failing tests**

Run:

```bash
npm run test -- tests/unit/app-settings-keys.test.ts
```

Expected: FAIL with TypeScript/import errors for `buildProxyEnv`, `getHttpProxy`, `getHttpsProxy`, `getNoProxy`, and `validateProxyUrl`.

- [ ] **Step 4: Implement proxy helpers**

In `src/shared/app-settings-keys.ts`, add proxy defaults inside `APP_SETTINGS_DEFAULTS` directly after `defaultCwd: "",`:

```ts
	httpProxy: "",
	httpsProxy: "",
	noProxy: "",
```

Append these helpers after `getDefaultCwd`:

```ts
export interface ProxyValidationResult {
	ok: boolean;
	message?: string;
}

export function getHttpProxy(settings: Record<string, unknown>): string {
	const v = settings.httpProxy;
	return typeof v === "string" ? v : APP_SETTINGS_DEFAULTS.httpProxy;
}

export function getHttpsProxy(settings: Record<string, unknown>): string {
	const v = settings.httpsProxy;
	return typeof v === "string" ? v : APP_SETTINGS_DEFAULTS.httpsProxy;
}

export function getNoProxy(settings: Record<string, unknown>): string {
	const v = settings.noProxy;
	return typeof v === "string" ? v : APP_SETTINGS_DEFAULTS.noProxy;
}

export function validateProxyUrl(value: string): ProxyValidationResult {
	const trimmed = value.trim();
	if (trimmed.length === 0) return { ok: true };

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return {
			ok: false,
			message: "Enter a full URL starting with http:// or https://",
		};
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return {
			ok: false,
			message: "Enter a full URL starting with http:// or https://",
		};
	}

	if (url.username.length > 0 || url.password.length > 0) {
		return {
			ok: false,
			message: "Proxy URLs with usernames/passwords are not supported",
		};
	}

	return { ok: true };
}

export function buildProxyEnv(
	settings: Record<string, unknown>,
): Record<string, string> {
	const env: Record<string, string> = {};
	const httpProxy = getHttpProxy(settings).trim();
	const httpsProxy = getHttpsProxy(settings).trim();
	const noProxy = getNoProxy(settings).trim();

	if (validateProxyUrl(httpProxy).ok && httpProxy.length > 0) {
		env.HTTP_PROXY = httpProxy;
		env.http_proxy = httpProxy;
	}
	if (validateProxyUrl(httpsProxy).ok && httpsProxy.length > 0) {
		env.HTTPS_PROXY = httpsProxy;
		env.https_proxy = httpsProxy;
	}
	if (noProxy.length > 0) {
		env.NO_PROXY = noProxy;
		env.no_proxy = noProxy;
	}

	return env;
}
```

- [ ] **Step 5: Verify shared helper tests pass**

Run:

```bash
npm run test -- tests/unit/app-settings-keys.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit shared helpers**

Run:

```bash
git add src/shared/app-settings-keys.ts tests/unit/app-settings-keys.test.ts
git commit -m "feat(settings): add proxy setting helpers"
```

---

### Task 2: Scoped proxy environment helper

**Files:**
- Create: `src/main/proxy-env.ts`
- Create: `tests/unit/proxy-env.test.ts`

- [ ] **Step 1: Add failing tests for scoped env application**

Create `tests/unit/proxy-env.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { withProxyEnv } from "../../src/main/proxy-env";

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
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm run test -- tests/unit/proxy-env.test.ts
```

Expected: FAIL because `src/main/proxy-env.ts` does not exist.

- [ ] **Step 3: Implement `withProxyEnv`**

Create `src/main/proxy-env.ts`:

```ts
import { buildProxyEnv } from "../shared/app-settings-keys";

export async function withProxyEnv<T>(
	settings: Record<string, unknown>,
	callback: () => Promise<T> | T,
): Promise<T> {
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
}
```

- [ ] **Step 4: Verify scoped env tests pass**

Run:

```bash
npm run test -- tests/unit/proxy-env.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit scoped env helper**

Run:

```bash
git add src/main/proxy-env.ts tests/unit/proxy-env.test.ts
git commit -m "feat(main): scoped proxy environment helper"
```

---

### Task 3: Apply proxy env to fresh Pi operations

**Files:**
- Modify: `src/main/pi-session-manager.ts`

- [ ] **Step 1: Run impact analysis for `PiSessionManager` methods**

If GitNexus is available, run impact checks before editing:

```bash
# Use GitNexus MCP if available:
# gitnexus_impact({ target: "PiSessionManager", direction: "upstream" })
# gitnexus_impact({ target: "createSession", direction: "upstream" })
# gitnexus_impact({ target: "attachSession", direction: "upstream" })
# gitnexus_impact({ target: "attachSessionByFile", direction: "upstream" })
# gitnexus_impact({ target: "loadPackageManager", direction: "upstream" })
```

Expected: medium risk because this is core session creation. If risk is HIGH or CRITICAL, stop and warn Roaan before editing.

- [ ] **Step 2: Add import for `withProxyEnv`**

In `src/main/pi-session-manager.ts`, add this import near the other local imports:

```ts
import { withProxyEnv } from "./proxy-env";
```

- [ ] **Step 3: Add a private proxy settings helper**

Inside `export class PiSessionManager`, after `setPathStore`, add:

```ts
	private proxySettings(): Record<string, unknown> {
		return this.deps?.appSettings.getAll() ?? {};
	}
```

- [ ] **Step 4: Wrap one-shot resource loader reloads**

In `buildLoadedResourceLoader`, replace:

```ts
		if (loader) await loader.reload();
		return loader;
```

with:

```ts
		if (loader) {
			await withProxyEnv(this.proxySettings(), () => loader.reload());
		}
		return loader;
```

In `loadSkills`, replace:

```ts
		await loader.reload();
```

with:

```ts
		await withProxyEnv(this.proxySettings(), () => loader.reload());
```

In `loadPrompts`, replace:

```ts
		await loader.reload();
```

with:

```ts
		await withProxyEnv(this.proxySettings(), () => loader.reload());
```

In `loadExtensions`, replace:

```ts
		await loader.reload();
```

with:

```ts
		await withProxyEnv(this.proxySettings(), () => loader.reload());
```

- [ ] **Step 5: Wrap configured package listing from another Pi root**

In `listConfiguredPiPackages`, replace the final return block:

```ts
		return pm
			.listConfiguredPackages()
			.filter((p) => p.scope === "user")
			.map((p) => ({
				source: p.source,
				scope: p.scope,
				installedPath: p.installedPath,
			}));
```

with:

```ts
		return withProxyEnv(this.proxySettings(), () =>
			pm
				.listConfiguredPackages()
				.filter((p) => p.scope === "user")
				.map((p) => ({
					source: p.source,
					scope: p.scope,
					installedPath: p.installedPath,
				})),
		);
```

- [ ] **Step 6: Wrap package manager operations that can hit the network**

In `loadPackageManager`, replace:

```ts
		return new ctx.mod.DefaultPackageManager({
			cwd: this.deps.homeDir,
			agentDir,
			settingsManager,
		});
```

with:

```ts
		const pm = new ctx.mod.DefaultPackageManager({
			cwd: this.deps.homeDir,
			agentDir,
			settingsManager,
		});
		return {
			listConfiguredPackages: () => pm.listConfiguredPackages(),
			installAndPersist: (source, options) =>
				withProxyEnv(this.proxySettings(), () =>
					pm.installAndPersist(source, options),
				),
			removeAndPersist: (source, options) =>
				withProxyEnv(this.proxySettings(), () =>
					pm.removeAndPersist(source, options),
				),
			setProgressCallback: (cb) => pm.setProgressCallback(cb),
		};
```

- [ ] **Step 7: Wrap fresh session creation and attachment**

In `createSession`, replace:

```ts
		const result = await ctx.mod.createAgentSession({
			cwd: opts.cwd,
			authStorage: ov?.authStorage ?? ctx.auth,
			modelRegistry: ov?.modelRegistry ?? ctx.registry,
			resourceLoader: await this.buildLoadedResourceLoader(ctx, opts.cwd),
			settingsManager: ov?.settingsManager,
			model: ov?.model ?? (await this.deps?.modelAuth?.resolveSelectedModel()),
		});
```

with:

```ts
		const result = await withProxyEnv(this.proxySettings(), async () =>
			ctx.mod.createAgentSession({
				cwd: opts.cwd,
				authStorage: ov?.authStorage ?? ctx.auth,
				modelRegistry: ov?.modelRegistry ?? ctx.registry,
				resourceLoader: await this.buildLoadedResourceLoader(ctx, opts.cwd),
				settingsManager: ov?.settingsManager,
				model:
					ov?.model ?? (await this.deps?.modelAuth?.resolveSelectedModel()),
			}),
		);
```

In `attachSession`, replace its `const result = await ctx.mod.createAgentSession({ ... });` block with:

```ts
		const result = await withProxyEnv(this.proxySettings(), async () =>
			ctx.mod.createAgentSession({
				cwd,
				authStorage: ov?.authStorage ?? ctx.auth,
				modelRegistry: ov?.modelRegistry ?? ctx.registry,
				resourceLoader: await this.buildLoadedResourceLoader(ctx, cwd),
				settingsManager: ov?.settingsManager,
				model:
					ov?.model ?? (await this.deps?.modelAuth?.resolveSelectedModel()),
				sessionManager,
			}),
		);
```

In `attachSessionByFile`, replace its `const result = await ctx.mod.createAgentSession({ ... });` block with:

```ts
		const result = await withProxyEnv(this.proxySettings(), async () =>
			ctx.mod.createAgentSession({
				cwd,
				authStorage: ov?.authStorage ?? ctx.auth,
				modelRegistry: ov?.modelRegistry ?? ctx.registry,
				resourceLoader: await this.buildLoadedResourceLoader(ctx, cwd),
				settingsManager: ov?.settingsManager,
				model:
					ov?.model ?? (await this.deps?.modelAuth?.resolveSelectedModel()),
				sessionManager,
			}),
		);
```

- [ ] **Step 8: Run focused tests and typecheck**

Run:

```bash
npm run test -- tests/unit/proxy-env.test.ts tests/unit/app-settings-keys.test.ts tests/integration/session-reload.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit Pi runtime wiring**

Run:

```bash
git add src/main/pi-session-manager.ts
git commit -m "feat(pi): apply proxy env to new pi operations"
```

---

### Task 4: Proxy settings panel

**Files:**
- Create: `src/renderer/components/ProxySettings.tsx`
- Modify: `src/renderer/components/GlobalSettingsDialog.tsx`

- [ ] **Step 1: Run impact analysis for `GlobalSettingsDialog`**

If GitNexus is available, run:

```bash
# Use GitNexus MCP if available:
# gitnexus_impact({ target: "GlobalSettingsDialog", direction: "upstream" })
```

Expected: low risk. If risk is HIGH or CRITICAL, stop and warn Roaan before editing.

- [ ] **Step 2: Create the ProxySettings component**

Create `src/renderer/components/ProxySettings.tsx`:

```tsx
import React from "react";
import {
	getHttpProxy,
	getHttpsProxy,
	getNoProxy,
	validateProxyUrl,
} from "../../shared/app-settings-keys";
import { useSetSetting, useSettings } from "../queries";

interface FieldProps {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	helper: string;
	error?: string;
}

function ProxyField({
	id,
	label,
	value,
	onChange,
	placeholder,
	helper,
	error,
}: FieldProps) {
	return (
		<div>
			<label htmlFor={id} className="mb-1 block text-sm font-medium">
				{label}
			</label>
			<div className="mb-1 text-xs text-muted">{helper}</div>
			<input
				id={id}
				type="text"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				className="w-full surface-row rounded px-2 py-1 text-sm"
				aria-invalid={error ? "true" : "false"}
				aria-describedby={error ? `${id}-error` : undefined}
			/>
			{error ? (
				<div id={`${id}-error`} className="mt-1 text-xs text-red-400">
					{error}
				</div>
			) : null}
		</div>
	);
}

export function ProxySettings() {
	const { data } = useSettings();
	const setSetting = useSetSetting();
	const settings = data?.settings ?? {};
	const storedHttp = getHttpProxy(settings);
	const storedHttps = getHttpsProxy(settings);
	const storedNoProxy = getNoProxy(settings);

	const [httpProxy, setHttpProxy] = React.useState(storedHttp);
	const [httpsProxy, setHttpsProxy] = React.useState(storedHttps);
	const [noProxy, setNoProxy] = React.useState(storedNoProxy);

	React.useEffect(() => {
		setHttpProxy(storedHttp);
		setHttpsProxy(storedHttps);
		setNoProxy(storedNoProxy);
	}, [storedHttp, storedHttps, storedNoProxy]);

	const httpValidation = validateProxyUrl(httpProxy);
	const httpsValidation = validateProxyUrl(httpsProxy);
	const hasChanges =
		httpProxy.trim() !== storedHttp ||
		httpsProxy.trim() !== storedHttps ||
		noProxy.trim() !== storedNoProxy;
	const canSave =
		hasChanges &&
		httpValidation.ok &&
		httpsValidation.ok &&
		!setSetting.isPending;

	const save = async () => {
		if (!canSave) return;
		await setSetting.mutateAsync({ key: "httpProxy", value: httpProxy.trim() });
		await setSetting.mutateAsync({ key: "httpsProxy", value: httpsProxy.trim() });
		await setSetting.mutateAsync({ key: "noProxy", value: noProxy.trim() });
	};

	return (
		<div className="flex flex-col gap-4">
			<div>
				<h2 className="text-base font-semibold">Proxy</h2>
				<div className="mt-1 text-xs text-muted">
					Proxy settings apply to new sessions and new Pi operations. Existing
					running sessions keep the environment they started with.
				</div>
			</div>

			<ProxyField
				id="http-proxy"
				label="HTTP proxy"
				value={httpProxy}
				onChange={setHttpProxy}
				placeholder="http://proxy.example.com:8080"
				helper="Used for HTTP requests. Leave empty to use the existing environment."
				error={httpValidation.ok ? undefined : httpValidation.message}
			/>

			<ProxyField
				id="https-proxy"
				label="HTTPS proxy"
				value={httpsProxy}
				onChange={setHttpsProxy}
				placeholder="http://proxy.example.com:8080"
				helper="Used for HTTPS requests. Both http:// and https:// proxy URLs are accepted."
				error={httpsValidation.ok ? undefined : httpsValidation.message}
			/>

			<div>
				<label htmlFor="no-proxy" className="mb-1 block text-sm font-medium">
					No proxy
				</label>
				<div className="mb-1 text-xs text-muted">
					Comma-separated hosts/domains that should bypass the proxy.
				</div>
				<input
					id="no-proxy"
					type="text"
					value={noProxy}
					onChange={(e) => setNoProxy(e.target.value)}
					placeholder="localhost,127.0.0.1,.company.internal"
					className="w-full surface-row rounded px-2 py-1 text-sm"
				/>
			</div>

			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={() => void save()}
					disabled={!canSave}
					className="surface-row rounded px-3 py-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
				>
					{setSetting.isPending ? "Saving…" : "Save"}
				</button>
				{hasChanges && !canSave && (httpValidation.ok && httpsValidation.ok) ? (
					<span className="text-xs text-muted">Saving is unavailable right now.</span>
				) : null}
			</div>
		</div>
	);
}
```

- [ ] **Step 3: Register the Proxy category**

In `src/renderer/components/GlobalSettingsDialog.tsx`, add the import:

```ts
import { ProxySettings } from "./ProxySettings";
```

Add this category after the Defaults category in the `categories` array:

```tsx
				{
					id: "proxy",
					label: "Proxy",
					group: "Workspace",
					render: () => <ProxySettings />,
				},
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit proxy UI**

Run:

```bash
git add src/renderer/components/ProxySettings.tsx src/renderer/components/GlobalSettingsDialog.tsx
git commit -m "feat(ui): add proxy settings panel"
```

---

### Task 5: Final verification and manual smoke notes

**Files:**
- No expected source changes unless verification exposes a defect.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm run test
npm run typecheck
npm run lint
```

Expected: all commands PASS. If `lint` formats or reports style issues, fix the exact reported issues, rerun the failed command, then rerun the full set.

- [ ] **Step 2: Run the app and smoke the settings UI**

Start the app with the process tool in the implementation session, not shell backgrounding:

```bash
npm start
```

Manual checks:

1. Open Settings.
2. Confirm there is a **Proxy** category under Workspace.
3. Enter `proxy.example.com:8080` in HTTP proxy; confirm inline error appears and Save is disabled.
4. Enter `http://user:pass@proxy.example.com:8080`; confirm auth error appears and Save is disabled.
5. Enter `http://proxy.example.com:8080` in HTTP proxy and `http://secure-proxy.example.com:8080` in HTTPS proxy.
6. Enter `localhost,127.0.0.1,.company.internal` in No proxy.
7. Click Save.
8. Close and reopen Settings; confirm values persist.
9. Clear all three values and Save; confirm empty values persist.

- [ ] **Step 3: Check changed scope before completion**

If GitNexus is available, run change detection before claiming completion:

```bash
# Use GitNexus MCP if available:
# gitnexus_detect_changes()
```

Expected: affected scope is limited to app settings helpers, proxy env helper, Pi session/package/resource operation creation paths, and settings UI.

- [ ] **Step 4: Commit any verification fixes**

If Step 1 or Step 2 required fixes, commit them:

```bash
git status --short
git add <fixed-files>
git commit -m "fix(proxy): verification fixes"
```

If there are no changes, do not create an empty commit.

## Self-review

- Spec coverage: global HTTP/HTTPS/NO_PROXY settings are covered by Tasks 1 and 4. Validation is covered by Tasks 1 and 4. Runtime application to new Pi work is covered by Tasks 2 and 3. Existing sessions remaining unchanged is preserved by only wrapping fresh creation/attach/reload/package operations.
- Placeholder scan: no implementation step relies on unspecified code; all new files and code blocks are provided.
- Type consistency: setting keys are `httpProxy`, `httpsProxy`, `noProxy` throughout; helper names are `getHttpProxy`, `getHttpsProxy`, `getNoProxy`, `validateProxyUrl`, `buildProxyEnv`, `withProxyEnv` throughout.

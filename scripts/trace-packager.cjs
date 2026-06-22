// Diagnostic preload (temporary): observe @electron/packager's promise.
//
// electron-forge's package step attaches a `.catch` to the packager promise
// that swallows the error if the per-subtask reject handlers aren't registered
// yet — so a real packaging failure surfaces only as "make exits 0 with no
// .dmg". This preload wraps @electron/packager to log whether packager()
// RESOLVES, REJECTS (with the real error/stack), or never settles (drain).
//
// Wire via: NODE_OPTIONS="--require ./scripts/trace-packager.cjs"
"use strict";
const Module = require("node:module");
const origLoad = Module._load;
Module._load = function (request, ...rest) {
	const m = origLoad.call(this, request, ...rest);
	if (
		request === "@electron/packager" &&
		m &&
		typeof m.packager === "function" &&
		!m.__traced
	) {
		const origPackager = m.packager;
		Object.defineProperty(m, "packager", {
			configurable: true,
			writable: true,
			value: function (...args) {
				console.error("[trace-packager] packager() called");
				const p = origPackager.apply(this, args);
				Promise.resolve(p).then(
					() => console.error("[trace-packager] packager() RESOLVED"),
					(e) =>
						console.error(
							"[trace-packager] packager() REJECTED:\n",
							(e && e.stack) || e,
						),
				);
				return p;
			},
		});
		m.__traced = true;
		console.error("[trace-packager] patched @electron/packager");
	}
	return m;
};

// When the event loop is about to drain, report what (if anything) is still
// keeping the process busy — confirms whether the process exits mid-package.
process.on("beforeExit", (code) => {
	const info =
		typeof process.getActiveResourcesInfo === "function"
			? process.getActiveResourcesInfo()
			: "n/a";
	console.error(
		`[trace-packager] beforeExit code=${code}; active resources:`,
		JSON.stringify(info),
	);
});
process.on("exit", (code) => {
	console.error(`[trace-packager] process exit code=${code}`);
});

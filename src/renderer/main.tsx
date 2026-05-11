// Renderer entry point — mounts the React tree with QueryClientProvider.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { logToMain } from "./ipc";
import "./styles.css";

// Forward uncaught errors/rejections to the main-process logger so they end
// up in the same daily log files as main + pi-host output. Installed before
// the React tree mounts so the first paint is already covered.
window.addEventListener("error", (e) => {
	logToMain(
		"error",
		`window.error: ${e.message} (${e.filename}:${e.lineno}:${e.colno})`,
	);
});
window.addEventListener("unhandledrejection", (e) => {
	logToMain("error", `unhandledrejection: ${String(e.reason)}`);
});

const queryClient = new QueryClient();

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
	</React.StrictMode>,
);

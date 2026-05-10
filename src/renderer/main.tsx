// Renderer entry point — mounts the React tree with QueryClientProvider.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

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

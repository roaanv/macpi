// src/renderer/components/ExtensionsList.tsx — Task 12 fills this in.
interface ExtensionsListProps {
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onInstall: () => void;
	onImport: () => void;
}
export function ExtensionsList(_props: ExtensionsListProps) {
	return (
		<aside className="w-64 surface-rail border-r border-divider p-2 text-muted text-xs">
			Extensions list (coming in task 12)
		</aside>
	);
}

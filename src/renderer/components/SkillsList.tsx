// Left-pane skills list. Final implementation in Task 13; this shell
// lets SkillsMode render while we ship in slices.

interface SkillsListProps {
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onInstall: () => void;
	onImport: () => void;
}

export function SkillsList(_props: SkillsListProps) {
	return (
		<aside className="w-64 surface-rail border-r border-divider p-2 text-muted text-xs">
			Skills list (coming in task 13)
		</aside>
	);
}

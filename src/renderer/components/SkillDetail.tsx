// Right-pane skill detail (manifest + markdown editor). Final
// implementation in Task 15; this shell lets SkillsMode render.

interface SkillDetailProps {
	id: string | null;
}

export function SkillDetail({ id }: SkillDetailProps) {
	return (
		<section className="flex-1 surface-panel p-6 text-muted text-sm">
			{id ? `Detail for ${id}` : "Select a skill on the left."}
		</section>
	);
}

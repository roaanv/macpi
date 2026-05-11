// src/renderer/components/ExtensionDetail.tsx — Task 13 fills this in.
export function ExtensionDetail({ id }: { id: string | null }) {
	return (
		<section className="flex-1 surface-panel p-6 text-muted text-sm">
			{id ? `Detail for ${id}` : "Select an extension."}
		</section>
	);
}

import React from "react";

interface BranchRenameInputProps {
	initial: string;
	onCommit: (label: string) => void;
	onCancel: () => void;
}

export function BranchRenameInput({
	initial,
	onCommit,
	onCancel,
}: BranchRenameInputProps) {
	const [value, setValue] = React.useState(initial);
	const ref = React.useRef<HTMLInputElement>(null);
	React.useEffect(() => {
		ref.current?.focus();
		ref.current?.select();
	}, []);
	return (
		<input
			ref={ref}
			value={value}
			onChange={(e) => setValue(e.target.value)}
			onKeyDown={(e) => {
				if (e.key === "Enter") onCommit(value);
				else if (e.key === "Escape") onCancel();
			}}
			onBlur={() => onCommit(value)}
			className="flex-1 rounded border border-divider bg-transparent px-1 py-0 text-xs"
		/>
	);
}

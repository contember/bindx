import type { ReactNode } from 'react'
import { PlusCircleIcon } from 'lucide-react'
import { Button } from '#bindx-ui/ui/button'
import { dict } from '../dict.js'

export function AddBlockButton({ children, onClick }: { children?: ReactNode; onClick: () => void }): ReactNode {
	return (
		<Button variant="link" size="sm" className="gap-1 px-0" onClick={onClick}>
			<PlusCircleIcon size={16} />
			<span>{children ?? dict.blockRepeater.addBlock}</span>
		</Button>
	)
}

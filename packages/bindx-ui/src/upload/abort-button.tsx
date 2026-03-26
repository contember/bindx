import { type ReactNode } from 'react'
import { XIcon } from 'lucide-react'
import { useUploaderFileState } from '@contember/bindx-uploader'
import { Button } from '#bindx-ui/ui/button'

export const AbortButton = (): ReactNode => {
	const state = useUploaderFileState()

	const handleAbort = (): void => {
		state.file.abortController.abort()
	}

	return (
		<Button
			variant="ghost"
			size="xs"
			onClick={handleAbort}
			className="text-gray-500 hover:text-gray-700"
		>
			<XIcon className="h-4 w-4" />
		</Button>
	)
}

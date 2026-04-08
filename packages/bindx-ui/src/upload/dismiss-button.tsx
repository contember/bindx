import { type ReactNode } from 'react'
import { XIcon } from 'lucide-react'
import { useUploaderFileState } from '@contember/bindx-uploader'
import { Button } from '#bindx-ui/ui/button'

export const DismissButton = (): ReactNode => {
	const state = useUploaderFileState()

	if (state.state !== 'success' && state.state !== 'error') {
		return null
	}

	return (
		<Button
			variant="ghost"
			size="xs"
			onClick={state.dismiss}
			className="text-gray-500 hover:text-gray-700"
		>
			<XIcon className="h-4 w-4" />
		</Button>
	)
}

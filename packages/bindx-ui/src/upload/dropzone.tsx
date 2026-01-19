import { type ReactNode } from 'react'
import { UploadIcon } from 'lucide-react'
import {
	UploaderDropzoneRoot,
	UploaderDropzoneArea,
	useUploaderStateFiles,
} from '@contember/bindx-uploader'
import { Button } from '../ui/button.js'
import { dict } from '../dict.js'
import {
	UploaderDropzoneAreaUI,
	UploaderDropzoneWrapperUI,
	UploaderInactiveDropzoneUI,
} from './ui.js'

export interface UploaderDropzoneProps {
	inactiveOnUpload?: boolean
	dropzonePlaceholder?: ReactNode
	disabled?: boolean
}

export const UploaderDropzone = ({
	inactiveOnUpload,
	dropzonePlaceholder,
	disabled,
}: UploaderDropzoneProps): ReactNode => {
	const filesInProgress = useUploaderStateFiles({ state: ['uploading', 'initial', 'finalizing'] })
	const showLoader = inactiveOnUpload && filesInProgress.length > 0

	return (
		<UploaderDropzoneRoot disabled={disabled}>
			<UploaderDropzoneWrapperUI>
				{showLoader
					? <UploaderInactiveDropzoneUI />
					: (
						<UploaderDropzoneArea>
							{dropzonePlaceholder ?? (
								<UploaderDropzoneAreaUI>
									<UploadIcon className="w-12 h-12 text-gray-400" />
									<div className="font-semibold text-sm">{dict.uploader.dropFiles}</div>
									<div className="text-xs">{dict.uploader.or}</div>
									<div className="flex gap-2 items-center text-xs">
										<Button size="sm" variant="outline">{dict.uploader.browseFiles}</Button>
									</div>
								</UploaderDropzoneAreaUI>
							)}
						</UploaderDropzoneArea>
					)
				}
			</UploaderDropzoneWrapperUI>
		</UploaderDropzoneRoot>
	)
}

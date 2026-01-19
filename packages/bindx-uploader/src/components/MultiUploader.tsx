import { useCallback, useMemo, useRef, type ReactNode } from 'react'
import type { EntityRef, HasManyRef, SelectionFieldMeta, SelectionMeta } from '@contember/bindx'
import { FIELD_REF_META } from '@contember/bindx'
import { BINDX_COMPONENT, type SelectionProvider, createEmptySelection } from '@contember/bindx-react'
import type { FileType, UploaderEvents } from '../types.js'
import {
	MultiUploaderEntityToFileStateMapContext,
	UploaderOptionsContext,
	UploaderStateContext,
	UploaderUploadFilesContext,
} from '../contexts.js'
import { useUploadState } from '../internal/hooks/useUploadState.js'
import { useUploaderDoUpload } from '../internal/hooks/useUploaderDoUpload.js'
import { resolveAcceptingSingleType } from '../internal/utils/resolveAccept.js'
import { executeExtractors } from '../internal/utils/executeExtractors.js'
import { uploaderErrorHandler } from '../internal/utils/uploaderErrorHandler.js'

export interface MultiUploaderProps<TEntity = Record<string, unknown>> {
	/**
	 * The has-many relation to add uploaded files to.
	 */
	field: HasManyRef<TEntity>
	/**
	 * File type configuration defining accepted files and extractors.
	 * Must be created with the same entity type as the field prop.
	 */
	fileType: FileType<TEntity>
	/**
	 * Children to render within the uploader context.
	 */
	children?: ReactNode
}

/**
 * Multi-file upload component for bindx.
 * Creates new items in a has-many relation for each uploaded file.
 *
 * @example
 * ```tsx
 * <MultiUploader field={article.images} fileType={imageFileType}>
 *   <DropZone multiple />
 *   <UploaderEachFile>
 *     <UploaderFileStateSwitch
 *       uploading={<ProgressBar />}
 *       success={<SuccessMessage />}
 *       error={<ErrorMessage />}
 *     />
 *   </UploaderEachFile>
 * </MultiUploader>
 * ```
 */
export function MultiUploader<TEntity extends Record<string, unknown>>({
	field,
	fileType,
	children,
}: MultiUploaderProps<TEntity>): ReactNode {
	// Map file ID -> entity ID
	const fileToEntityMapRef = useRef(new Map<string, string>())
	// Map entity ID -> file ID (for reverse lookup)
	const entityToFileMapRef = useRef(new Map<string, string>())

	const getEntityForFile = useCallback(
		(fileId: string): EntityRef<unknown> | undefined => {
			const entityId = fileToEntityMapRef.current.get(fileId)
			if (!entityId) return undefined
			return field.items.find((item: { id: string }) => item.id === entityId) as EntityRef<unknown> | undefined
		},
		[field.items],
	)

	// Create entity for file and track mapping
	const useCreateRepeaterEntityEvents = useCallback(
		(events: UploaderEvents): UploaderEvents => ({
			...events,
			onBeforeUpload: async event => {
				if (!(await resolveAcceptingSingleType(event.file, fileType as FileType))) {
					return undefined
				}

				// Create new entity in the has-many relation
				const entityId = field.add()
				fileToEntityMapRef.current.set(event.file.id, entityId)
				entityToFileMapRef.current.set(entityId, event.file.id)

				return (await events.onBeforeUpload?.(event)) ?? (fileType as FileType)
			},
			onAfterUpload: async event => {
				await Promise.all([
					(async () => {
						const entity = getEntityForFile(event.file.id)
						if (!entity) return

						const extractionResult = await executeExtractors({
							fileType: fileType as FileType,
							result: event.result,
							file: event.file,
						})
						extractionResult?.({ entity })
					})(),
					events.onAfterUpload?.(event),
				])
			},
			onError: event => {
				// Remove entity on error
				const entityId = fileToEntityMapRef.current.get(event.file.id)
				if (entityId) {
					field.remove(entityId)
					fileToEntityMapRef.current.delete(event.file.id)
					entityToFileMapRef.current.delete(entityId)
				}
				events.onError?.(event)
			},
		}),
		[field, fileType, getEntityForFile],
	)

	const baseEvents: UploaderEvents = useMemo(
		() => ({
			onError: uploaderErrorHandler,
			onStartUpload: () => {},
			onBeforeUpload: async () => undefined,
			onProgress: () => {},
			onAfterUpload: async () => {},
			onSuccess: () => {},
		}),
		[],
	)

	const fillEntityEvents = useCreateRepeaterEntityEvents(baseEvents)
	const { files, ...stateEvents } = useUploadState(fillEntityEvents)
	const onDrop = useUploaderDoUpload(stateEvents)

	const options = useMemo(
		() => ({
			accept: fileType.accept,
			multiple: true,
		}),
		[fileType.accept],
	)

	return (
		<MultiUploaderEntityToFileStateMapContext.Provider value={entityToFileMapRef.current}>
			<UploaderStateContext.Provider value={files}>
				<UploaderUploadFilesContext.Provider value={onDrop}>
					<UploaderOptionsContext.Provider value={options}>
						{children}
					</UploaderOptionsContext.Provider>
				</UploaderUploadFilesContext.Provider>
			</UploaderStateContext.Provider>
		</MultiUploaderEntityToFileStateMapContext.Provider>
	)
}

/**
 * Collects field names from all extractors in a file type.
 */
function collectExtractorFieldNames(fileType: FileType): string[] {
	const fieldNames: string[] = []
	for (const extractor of fileType.extractors ?? []) {
		fieldNames.push(...extractor.getFieldNames())
	}
	return fieldNames
}

/**
 * Builds nested selection meta from field names.
 */
function buildNestedSelection(fieldNames: string[]): SelectionMeta {
	const selection = createEmptySelection()
	for (const fieldName of fieldNames) {
		selection.fields.set(fieldName, {
			fieldName,
			alias: fieldName,
			path: [],
			isArray: false,
			isRelation: false,
		})
	}
	return selection
}

// Static method for selection extraction
const multiUploaderWithSelection = MultiUploader as typeof MultiUploader & SelectionProvider & { [BINDX_COMPONENT]: true }

multiUploaderWithSelection.getSelection = (
	props: MultiUploaderProps,
	_collectNested: (children: ReactNode) => SelectionMeta,
): SelectionFieldMeta | null => {
	const fieldNames = collectExtractorFieldNames(props.fileType)

	if (fieldNames.length === 0) {
		return null
	}

	const meta = props.field[FIELD_REF_META]

	// MultiUploader always works with a has-many relation
	return {
		fieldName: meta.fieldName,
		alias: meta.fieldName,
		path: meta.path,
		isArray: true,
		isRelation: true,
		nested: buildNestedSelection(fieldNames),
	}
}

multiUploaderWithSelection[BINDX_COMPONENT] = true

export { multiUploaderWithSelection as MultiUploaderWithMeta }

import { useMemo, type ReactNode } from 'react'
import type { EntityRef, HasOneRef, SelectionFieldMeta, SelectionMeta } from '@contember/bindx'
import { FIELD_REF_META } from '@contember/bindx'
import { BINDX_COMPONENT, type SelectionProvider, createEmptySelection } from '@contember/bindx-react'
import type { FileType } from '../types.js'
import {
	UploaderOptionsContext,
	UploaderStateContext,
	UploaderUploadFilesContext,
} from '../contexts.js'
import { useUploadState } from '../internal/hooks/useUploadState.js'
import { useUploaderDoUpload } from '../internal/hooks/useUploaderDoUpload.js'
import { useFillEntity } from '../internal/hooks/useFillEntity.js'
import { uploaderErrorHandler } from '../internal/utils/uploaderErrorHandler.js'

export interface UploaderProps<TEntity = Record<string, unknown>> {
	/**
	 * The entity to fill with uploaded file data.
	 * Can be an EntityRef or HasOneRef.
	 */
	entity: EntityRef<TEntity> | HasOneRef<TEntity>
	/**
	 * File type configuration defining accepted files and extractors.
	 * Must be created with the same entity type as the entity prop.
	 */
	fileType: FileType<TEntity>
	/**
	 * Children to render within the uploader context.
	 */
	children?: ReactNode
}

const noop = (): Promise<undefined> => Promise.resolve(undefined)

/**
 * Single file upload component for bindx.
 * Provides upload state and upload function to children via context.
 *
 * @example
 * ```tsx
 * interface Image {
 *   id: string
 *   url: string
 *   width: number
 *   height: number
 * }
 *
 * const imageFileType = createImageFileType<Image>({
 *   urlField: 'url',
 *   widthField: 'width',
 *   heightField: 'height',
 * })
 *
 * // article.image is HasOneRef<Image>
 * <Uploader entity={article.image} fileType={imageFileType}>
 *   <DropZone />
 *   <UploaderEachFile>
 *     <UploaderFileStateSwitch
 *       uploading={<ProgressBar />}
 *       success={<SuccessMessage />}
 *       error={<ErrorMessage />}
 *     />
 *   </UploaderEachFile>
 * </Uploader>
 * ```
 */
export function Uploader<TEntity extends Record<string, unknown>>({
	entity,
	fileType,
	children,
}: UploaderProps<TEntity>): ReactNode {
	const fillEntityEvents = useFillEntity({
		entity,
		fileType,
		onError: uploaderErrorHandler,
		onStartUpload: noop,
		onBeforeUpload: noop,
		onProgress: noop,
		onAfterUpload: noop,
		onSuccess: noop,
	})

	const { files, ...stateEvents } = useUploadState(fillEntityEvents)
	const onDrop = useUploaderDoUpload(stateEvents)

	const options = useMemo(
		() => ({
			accept: fileType.accept,
			multiple: false,
		}),
		[fileType.accept],
	)

	return (
		<UploaderStateContext.Provider value={files}>
			<UploaderUploadFilesContext.Provider value={onDrop}>
				<UploaderOptionsContext.Provider value={options}>
					{children}
				</UploaderOptionsContext.Provider>
			</UploaderUploadFilesContext.Provider>
		</UploaderStateContext.Provider>
	)
}

/**
 * Type guard to check if an entity has FIELD_REF_META (is a relation handle).
 */
function hasFieldRefMeta(entity: unknown): entity is { [FIELD_REF_META]: { fieldName: string; path: string[]; isRelation: boolean } } {
	return entity !== null && typeof entity === 'object' && FIELD_REF_META in entity
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
const uploaderWithSelection = Uploader as typeof Uploader & SelectionProvider & { [BINDX_COMPONENT]: true }

uploaderWithSelection.getSelection = (
	props: UploaderProps,
	_collectNested: (children: ReactNode) => SelectionMeta,
): SelectionFieldMeta | null => {
	const fieldNames = collectExtractorFieldNames(props.fileType)

	if (fieldNames.length === 0) {
		return null
	}

	// Only HasOneRef has FIELD_REF_META - EntityRef doesn't have it
	// If passed an EntityRef directly, we can't build selection (return null)
	if (!hasFieldRefMeta(props.entity)) {
		return null
	}

	const meta = props.entity[FIELD_REF_META]

	// Return nested selection under the relation
	return {
		fieldName: meta.fieldName,
		alias: meta.fieldName,
		path: meta.path,
		isArray: false,
		isRelation: true,
		nested: buildNestedSelection(fieldNames),
	}
}

uploaderWithSelection[BINDX_COMPONENT] = true

export { uploaderWithSelection as UploaderWithMeta }

import { useCallback, useRef } from 'react'
import type { EntityRef, HasOneAccessor } from '@contember/bindx'
import type { FileType, PrepareUploadTarget, StartUploadEvent, UploaderEvents } from '../../types.js'
import { resolveAcceptingSingleType } from '../utils/resolveAccept.js'
import { executeExtractors } from '../utils/executeExtractors.js'

type FillTarget<TEntity> = EntityRef<TEntity> | HasOneAccessor<TEntity>

export interface UseFillEntityArgs<TEntity = Record<string, unknown>> extends Partial<UploaderEvents> {
	/**
	 * The entity to fill. Can be:
	 * - EntityRef: fill the entity directly
	 * - HasOneAccessor: fill the related entity (disconnect first on upload start)
	 */
	entity: FillTarget<TEntity>
	fileType: FileType<TEntity>
	/**
	 * Resolves the target of an incoming batch, before the upload disconnects or fills anything.
	 */
	prepareTarget?: PrepareUploadTarget<FillTarget<TEntity>>
}

export interface UseFillEntityResult extends Partial<UploaderEvents> {
	prepareUpload: (files: File[]) => Promise<void>
}

/**
 * Checks if the entity is a HasOneRef (has $disconnect method)
 */
const isHasOneAccessor = <TEntity>(entity: FillTarget<TEntity>): entity is HasOneAccessor<TEntity> => {
	return '$disconnect' in entity && typeof entity.$disconnect === 'function'
}

/**
 * Gets the target entity for filling.
 * For HasOneAccessor, returns the related entity. For EntityRef, returns the entity itself.
 */
const getTargetEntity = <TEntity>(entity: FillTarget<TEntity>): EntityRef<TEntity> => {
	if (isHasOneAccessor(entity)) {
		return entity.$entity
	}
	return entity
}

/**
 * Hook that connects upload events to entity field population.
 * Handles both direct EntityRef and HasOneRef (for has-one relations).
 */
export const useFillEntity = <TEntity extends Record<string, unknown>>({
	entity,
	fileType,
	prepareTarget,
	...events
}: UseFillEntityArgs<TEntity>): UseFillEntityResult => {
	const preparedTargetRef = useRef<FillTarget<TEntity> | undefined>(undefined)

	const prepareUpload = useCallback(
		async (files: File[]): Promise<void> => {
			preparedTargetRef.current = await prepareTarget?.(files)
		},
		[prepareTarget],
	)

	const getTarget = useCallback((): FillTarget<TEntity> => preparedTargetRef.current ?? entity, [entity])

	const handleBeforeUpload = useCallback(
		async (event: Parameters<UploaderEvents['onBeforeUpload']>[0]): Promise<FileType | undefined> => {
			if (!(await resolveAcceptingSingleType(event.file, fileType as FileType))) {
				return undefined
			}
			return (await events.onBeforeUpload?.(event)) ?? (fileType as FileType)
		},
		[events, fileType],
	)

	const handleStartUpload = useCallback(
		(event: StartUploadEvent) => {
			// Disconnect existing relation before upload
			const target = getTarget()
			if (isHasOneAccessor(target)) {
				target.$disconnect()
			}
			events.onStartUpload?.(event)
		},
		[events, getTarget],
	)

	const handleAfterUpload = useCallback(
		async (event: Parameters<UploaderEvents['onAfterUpload']>[0]) => {
			await Promise.all([
				(async () => {
					const targetEntity = getTargetEntity(getTarget())
					const extractionResult = await executeExtractors({
						fileType: fileType as FileType,
						result: event.result,
						file: event.file,
					})
					extractionResult?.({ entity: targetEntity as EntityRef<unknown> })
				})(),
				events.onAfterUpload?.(event),
			])
		},
		[events, fileType, getTarget],
	)

	return {
		...events,
		prepareUpload,
		onBeforeUpload: handleBeforeUpload,
		onStartUpload: handleStartUpload,
		onAfterUpload: handleAfterUpload,
	}
}

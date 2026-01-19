import { useCallback } from 'react'
import type { EntityRef, HasOneRef } from '@contember/bindx'
import type { FileType, StartUploadEvent, UploaderEvents } from '../../types.js'
import { resolveAcceptingSingleType } from '../utils/resolveAccept.js'
import { executeExtractors } from '../utils/executeExtractors.js'

export interface UseFillEntityArgs<TEntity = Record<string, unknown>> extends UploaderEvents {
	/**
	 * The entity to fill. Can be:
	 * - EntityRef: fill the entity directly
	 * - HasOneRef: fill the related entity (disconnect first on upload start)
	 */
	entity: EntityRef<TEntity> | HasOneRef<TEntity>
	fileType: FileType<TEntity>
}

/**
 * Checks if the entity is a HasOneRef (has $disconnect method)
 */
const isHasOneRef = <TEntity>(entity: EntityRef<TEntity> | HasOneRef<TEntity>): entity is HasOneRef<TEntity> => {
	return '$disconnect' in entity && typeof entity.$disconnect === 'function'
}

/**
 * Gets the target entity for filling.
 * For HasOneRef, returns the related entity. For EntityRef, returns the entity itself.
 */
const getTargetEntity = <TEntity>(entity: EntityRef<TEntity> | HasOneRef<TEntity>): EntityRef<TEntity> => {
	if (isHasOneRef(entity)) {
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
	...events
}: UseFillEntityArgs<TEntity>): UploaderEvents => {
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
			if (isHasOneRef(entity)) {
				entity.$disconnect()
			}
			events.onStartUpload?.(event)
		},
		[entity, events],
	)

	const handleAfterUpload = useCallback(
		async (event: Parameters<UploaderEvents['onAfterUpload']>[0]) => {
			await Promise.all([
				(async () => {
					const targetEntity = getTargetEntity(entity)
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
		[entity, events, fileType],
	)

	return {
		...events,
		onBeforeUpload: handleBeforeUpload,
		onStartUpload: handleStartUpload,
		onAfterUpload: handleAfterUpload,
	}
}

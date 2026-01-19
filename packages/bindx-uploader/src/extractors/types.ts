import type { FieldRef } from '@contember/bindx'
import type { FileWithMeta, FileUploadResult, FileDataExtractor, FileDataExtractorPopulator } from '../types.js'

/**
 * Generic entity type for extractors - allows any string field access
 */
export type ExtractorEntity = {
	$fields: Record<string, FieldRef<unknown>>
}

/**
 * Helper type for extractor factory function
 */
export type ExtractorFactory<TProps, TEntity = ExtractorEntity> = (props: TProps) => FileDataExtractor<TEntity>

export * from './enums'
export * from './entities'
export * from './names'
export * from './types'

import { schemaNames } from './names'
import type { BindxSchema } from './entities'
import { createBindx } from '@contember/bindx-react'

/**
 * Pre-configured bindx instance for this schema
 */
export const { useEntity, useEntityList, Entity, createComponent } = createBindx<BindxSchema>(schemaNames as any)

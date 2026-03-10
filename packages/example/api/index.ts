import type { Schema } from '@contember/schema'
import { AllowAllPermissionFactory, createSchema } from '@contember/schema-definition'
import * as model from './model'

export default createSchema(model, (schema): Schema => ({
	...schema,
	acl: {
		...schema.acl,
		roles: {
			...schema.acl.roles,
			admin: {
				...schema.acl.roles['admin'],
				variables: {},
				entities: new AllowAllPermissionFactory().create(schema.model, true),
			},
		},
	},
}))

/**
 * Tests for RoleSchemaGenerator
 */

import { describe, test, expect } from 'bun:test'
import { Acl } from '@contember/schema'
import { RoleSchemaGenerator } from '../src/RoleSchemaGenerator'
import { generate } from '../src/BindxGenerator'
import { testModel } from './shared'

const testAcl: Acl.Schema = {
	roles: {
		admin: {
			stages: '*',
			variables: {},
			entities: {
				Author: {
					predicates: {},
					operations: {
						read: { id: true, name: true, email: true, salary: true, posts: true },
					},
				},
				Post: {
					predicates: {},
					operations: {
						read: { id: true, title: true, content: true, status: true, author: true, tags: true },
					},
				},
				Tag: {
					predicates: {},
					operations: {
						read: { id: true, name: true, posts: true },
					},
				},
			},
		},
		public: {
			stages: '*',
			variables: {},
			entities: {
				Author: {
					predicates: {},
					operations: {
						read: { id: true, name: true },
					},
				},
				Post: {
					predicates: {},
					operations: {
						read: { id: true, title: true, author: true },
					},
				},
				Tag: {
					predicates: {},
					operations: {
						read: { id: true, name: true },
					},
				},
			},
		},
	},
}

describe('RoleSchemaGenerator', () => {
	test('generates per-role entity types', () => {
		const generator = new RoleSchemaGenerator()
		const code = generator.generateRoleEntities(testModel, testAcl)

		// Admin types should have all fields
		expect(code).toContain('export interface Author$admin')
		expect(code).toContain('export interface Post$admin')
		expect(code).toContain('export interface Tag$admin')

		// Public types should have limited fields
		expect(code).toContain('export interface Author$public')
		expect(code).toContain('export interface Post$public')

		// Admin Author should have email and salary
		const adminAuthorMatch = code.match(/export interface Author\$admin \{([^}]+)\}/)
		expect(adminAuthorMatch).not.toBeNull()
		expect(adminAuthorMatch![1]).toContain('email')
		expect(adminAuthorMatch![1]).toContain('salary')

		// Public Author should NOT have email or salary
		const publicAuthorMatch = code.match(/export interface Author\$public \{([^}]+)\}/)
		expect(publicAuthorMatch).not.toBeNull()
		expect(publicAuthorMatch![1]).not.toContain('email')
		expect(publicAuthorMatch![1]).not.toContain('salary')
	})

	test('generates role map types per entity', () => {
		const generator = new RoleSchemaGenerator()
		const code = generator.generateRoleEntities(testModel, testAcl)

		expect(code).toContain('export interface Author$Roles')
		expect(code).toContain('readonly admin: Author$admin')
		expect(code).toContain('readonly public: Author$public')

		expect(code).toContain("export type AvailableRoles = 'admin' | 'public'")
	})

	test('generates role-aware relations', () => {
		const generator = new RoleSchemaGenerator()
		const code = generator.generateRoleEntities(testModel, testAcl)

		// Admin Post should reference Author$admin
		const adminPostMatch = code.match(/export interface Post\$admin \{([^}]+)\}/)
		expect(adminPostMatch).not.toBeNull()
		expect(adminPostMatch![1]).toContain('author: Author$admin')
		expect(adminPostMatch![1]).toContain('tags: Tag$admin[]')

		// Public Post should reference Author$public
		const publicPostMatch = code.match(/export interface Post\$public \{([^}]+)\}/)
		expect(publicPostMatch).not.toBeNull()
		expect(publicPostMatch![1]).toContain('author: Author$public')
	})

	test('generates schema file with roleEntityDef', () => {
		const generator = new RoleSchemaGenerator()
		const schemaCode = generator.generateSchemaFile(testModel, testAcl)

		expect(schemaCode).toContain('roleEntityDef')
		expect(schemaCode).toContain("import { entityDef, roleEntityDef } from '@contember/bindx'")
		expect(schemaCode).toContain('Author$Roles')
		expect(schemaCode).toContain('Post$Roles')
	})

	test('generates AvailableRoles type', () => {
		const generator = new RoleSchemaGenerator()
		const code = generator.generateRoleEntities(testModel, testAcl)

		expect(code).toContain("export type AvailableRoles = 'admin' | 'public'")
	})
})

describe('generate() with ACL', () => {
	test('generates entities with role types appended', () => {
		const files = generate(testModel, testAcl)

		// entities.ts should have both base and role types
		expect(files['entities.ts']).toContain('export interface Author {')
		expect(files['entities.ts']).toContain('export interface Author$admin {')
		expect(files['entities.ts']).toContain('export interface Author$public {')
	})

	test('generates role-aware schema.ts', () => {
		const files = generate(testModel, testAcl)

		expect(files['schema.ts']).toContain('roleEntityDef')
		expect(files['schema.ts']).toContain('Author$Roles')
	})

	test('generate() without ACL produces no role types', () => {
		const files = generate(testModel)

		expect(files['entities.ts']).not.toContain('$admin')
		expect(files['entities.ts']).not.toContain('$public')
		expect(files['schema.ts']).not.toContain('roleEntityDef')
	})
})

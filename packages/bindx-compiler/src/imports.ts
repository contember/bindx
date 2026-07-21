/**
 * Resolves local binding names for symbols imported from any `@contember/bindx*`
 * package, so the analyzer follows aliased imports (`import { Field as F }`).
 */
import * as t from '@babel/types'

export type ComponentKind = 'Field' | 'Attribute' | 'Show' | 'HasOne' | 'HasMany' | 'If'

const COMPONENT_NAMES: ReadonlySet<string> = new Set<ComponentKind>([
	'Field', 'Attribute', 'Show', 'HasOne', 'HasMany', 'If',
])

export interface ImportBindings {
	/** local names that refer to `createComponent`. */
	readonly createComponent: ReadonlySet<string>
	/** local names that refer to the `cond` DSL object. */
	readonly cond: ReadonlySet<string>
	/** local component name → recognized bindx component kind. */
	readonly components: ReadonlyMap<string, ComponentKind>
}

function isBindxSource(source: string): boolean {
	return source === '@contember/bindx' || source.startsWith('@contember/bindx-') || source.startsWith('@contember/bindx/')
}

export function collectImportBindings(program: t.Program): ImportBindings {
	const createComponent = new Set<string>()
	const cond = new Set<string>()
	const components = new Map<string, ComponentKind>()

	for (const node of program.body) {
		if (!t.isImportDeclaration(node) || !isBindxSource(node.source.value)) {
			continue
		}
		for (const spec of node.specifiers) {
			if (!t.isImportSpecifier(spec)) {
				continue
			}
			const imported = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value
			const local = spec.local.name
			if (imported === 'createComponent') {
				createComponent.add(local)
			} else if (imported === 'cond') {
				cond.add(local)
			} else if (COMPONENT_NAMES.has(imported)) {
				components.set(local, imported as ComponentKind)
			}
		}
	}

	return { createComponent, cond, components }
}

/**
 * Names bound at module scope (imports + top-level declarations). A hole's component
 * thunk (`() => Identifier`) is emitted as a sibling of the `.render()` call, so its tag
 * must resolve in module scope; unresolved tags bail instead of forming a hole.
 */
export function collectModuleBindings(program: t.Program): Set<string> {
	const names = new Set<string>()

	const addDeclaration = (decl: t.Node): void => {
		if (t.isImportDeclaration(decl)) {
			for (const spec of decl.specifiers) {
				names.add(spec.local.name)
			}
			return
		}
		if (t.isVariableDeclaration(decl)) {
			for (const d of decl.declarations) {
				for (const name of Object.keys(t.getBindingIdentifiers(d.id))) {
					names.add(name)
				}
			}
			return
		}
		if ((t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) && decl.id) {
			names.add(decl.id.name)
		}
	}

	for (const node of program.body) {
		addDeclaration(node)
		if (t.isExportNamedDeclaration(node) && node.declaration) {
			addDeclaration(node.declaration)
		}
		if (t.isExportDefaultDeclaration(node)) {
			const d = node.declaration
			if ((t.isFunctionDeclaration(d) || t.isClassDeclaration(d)) && d.id) {
				names.add(d.id.name)
			}
		}
	}

	return names
}

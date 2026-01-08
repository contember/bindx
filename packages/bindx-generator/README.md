# @contember/bindx-generator

Schema generator for `@contember/bindx` with role-based ACL support. Generates TypeScript types and runtime schema definitions from Contember `Model.Schema` and `Acl.Schema`.

## Installation

```bash
npm install @contember/bindx-generator @contember/schema @contember/schema-utils
```

## Usage

### Basic Generation (Without ACL)

```typescript
import { generate } from '@contember/bindx-generator'
import { Model } from '@contember/schema'

const model: Model.Schema = {
  enums: { /* ... */ },
  entities: { /* ... */ }
}

const files = generate(model)

// Write files
for (const [filename, content] of Object.entries(files)) {
  fs.writeFileSync(`./generated/${filename}`, content)
}
```

### Generation with Role-Based ACL

```typescript
import { generate } from '@contember/bindx-generator'
import { Model, Acl } from '@contember/schema'

const model: Model.Schema = { /* ... */ }
const acl: Acl.Schema = {
  roles: {
    public: {
      stages: '*',
      entities: {
        Article: {
          predicates: {},
          operations: {
            read: {
              id: true,
              title: true,
              // Only public fields
            }
          }
        }
      },
      variables: {}
    },
    editor: {
      stages: '*',
      entities: {
        Article: {
          predicates: {},
          operations: {
            read: {
              id: true,
              title: true,
              content: true,
              author: true,
              // All fields accessible to editors
            }
          }
        }
      },
      variables: {}
    }
  }
}

const files = generate(model, acl)
```

## Generated Files

The generator produces 5 files:

| File | Description |
|------|-------------|
| `entities.ts` | TypeScript entity types with `columns`, `hasOne`, `hasMany` structure |
| `names.ts` | Runtime schema names (JSON) for query building |
| `enums.ts` | TypeScript enum types |
| `types.ts` | Shared schema interface definitions |
| `index.ts` | Exports and pre-configured bindx instance |

### Example Output

#### Without ACL

```typescript
// entities.ts
export interface Article {
  columns: {
    id: string
    title: string
    content: string | null
  }
  hasOne: {
    author: Author
  }
  hasMany: {
    tags: Tag
  }
}

// index.ts
export const { useEntity, useEntityList, Entity, createComponent } = createBindx<BindxSchema>(schemaNames)
```

#### With Role-Based ACL

```typescript
// entities.ts
export interface PublicArticle {
  columns: {
    id: string
    title: string
  }
  hasOne: {}
  hasMany: {}
}

export interface EditorArticle {
  columns: {
    id: string
    title: string
    content: string | null
  }
  hasOne: {
    author: EditorAuthor
  }
  hasMany: {
    tags: EditorTag
  }
}

export interface RoleSchemas {
  public: PublicSchema
  editor: EditorSchema
}

// index.ts
export const {
  roleSchemaRegistry,
  RoleAwareProvider,
  Entity,
  HasRole,
  useEntity,
  useEntityList,
  createComponent
} = createRoleAwareBindx<RoleSchemas>(roleSchemaDefinitions)
```

## Options

```typescript
export interface BindxGeneratorOptions {
  /**
   * Whether to flatten inherited roles.
   * Default: true
   */
  flattenInheritance?: boolean

  /**
   * Whether to treat predicate-based permissions as allowed.
   * When true, any non-false permission allows access.
   * When false, only explicit `true` permissions are allowed.
   * Default: true
   */
  allowPredicateAccess?: boolean
}

const files = generate(model, acl, {
  flattenInheritance: true,
  allowPredicateAccess: true
})
```

## CLI Usage

You can create a script to generate schemas:

```typescript
// scripts/generate-schema.ts
import { generate } from '@contember/bindx-generator'
import { Model, Acl } from '@contember/schema'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

// Import your model and ACL
import { model, acl } from './your-schema'

async function main() {
  const files = generate(model, acl)
  
  const outputDir = './src/generated'
  await mkdir(outputDir, { recursive: true })
  
  for (const [filename, content] of Object.entries(files)) {
    await writeFile(join(outputDir, filename), content)
  }
  
  console.log('✅ Schema generated')
}

main()
```

Add to `package.json`:

```json
{
  "scripts": {
    "generate:schema": "tsx scripts/generate-schema.ts"
  }
}
```

## How It Works

### ACL Filtering

The generator applies ACL permissions similar to Contember's `IntrospectionSchemaFactory`:

1. **Entity Filtering**: Only entities with `read` operations are included
2. **Field Filtering**: Only fields with read permissions (`true` or predicates) are included
3. **Relation Filtering**: Relations to inaccessible entities are excluded
4. **Role Inheritance**: Permissions from inherited roles are merged

### Type Safety

Generated types are fully type-safe:

```typescript
// Public role cannot access content field
<RoleAwareProvider roles={['public']}>
  <Entity name="Article" id={id}>
    {article => (
      // ✅ OK
      <div>{article.data.title}</div>
      
      // ❌ Type error: 'content' doesn't exist on PublicArticle
      <div>{article.data.content}</div>
    )}
  </Entity>
</RoleAwareProvider>
```

## License

MIT

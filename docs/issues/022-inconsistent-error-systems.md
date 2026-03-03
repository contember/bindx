# 022: Inconsistent error systems

**Severity:** Minor
**Category:** Architecture
**Reported by:** delta

## Description

The codebase has two separate error systems:

1. **Load errors** — plain `Error` objects stored on `EntityLoadState`
2. **Persistence errors** — structured system with `FieldError`, `EntityError`, `RelationError`, including `source`, `category`, `retryable` metadata

Consumers need to handle two different error patterns depending on whether the error came from loading or persistence.

## Impact

- Inconsistent error handling in UI components
- Cannot use a single error display component for all error types
- Load errors have no structure (category, retryable, source)

## Fix

Options:
1. Unify under a single error model with structured metadata
2. Provide a unified error accessor on the entity handle that normalizes both types

# 023: Role system complexity

**Severity:** Minor
**Category:** Architecture
**Reported by:** alpha, beta

## Location

`packages/bindx/src/roles/`

## Description

`createRoleAwareBindx()` adds significant type-level and runtime complexity:
- Multiple levels of generic constraints
- Deep type nesting
- Role-based schema narrowing at compile time

The feature is experimental and may not be justified given the complexity it introduces.

## Impact

- Steep learning curve for contributors
- Complex generics slow down TypeScript compiler
- Unclear if the feature is needed in practice

## Decision Needed

- If role-based schema narrowing is a hard requirement: keep and simplify the type-level complexity
- If not: defer or drop, and add back when there's concrete demand

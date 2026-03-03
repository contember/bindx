# 009: `inputProps` creates new object on every access

**Severity:** Important
**Category:** Architecture
**Reported by:** gamma

## Location

`packages/bindx/src/handles/FieldHandle.ts:158-165`

## Description

The `inputProps` getter creates a new object and a new closure on every access:

```typescript
get inputProps(): InputProps<T> {
    const setValue = (value: T | null) => this.setValue(value)
    return {
        value: this.value,
        setValue,
        onChange: setValue,
    }
}
```

## Impact

- Every access returns a new object reference
- React components using `inputProps` as a prop will re-render unnecessarily
- Spreading `{...field.inputProps}` into a component breaks `React.memo` and `shouldComponentUpdate`
- Performance degradation in forms with many fields

## Fix

Cache the object and `onChange` handler. Invalidate only when value changes:

```typescript
private _cachedInputProps: InputProps<T> | null = null
private _cachedValue: T | null = undefined

get inputProps(): InputProps<T> {
    if (!this._cachedInputProps || this.value !== this._cachedValue) {
        this._cachedValue = this.value
        this._cachedInputProps = {
            value: this.value,
            setValue: this._boundSetValue,
            onChange: this._boundSetValue,
        }
    }
    return this._cachedInputProps
}
```

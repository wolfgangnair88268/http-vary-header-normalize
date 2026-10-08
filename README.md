# HTTP Vary Header Normalize

Parses HTTP `Vary` header values and emits a canonical, comma-joined string for cache-key computation. Zero runtime dependencies, ESM only.

```js
import { normalizeVary, mergeVary, varyFields, canonicalizeField, VARY_WILDCARD } from './src/index.js';

const cacheKey = normalizeVary('Accept-Encoding, Accept-Language');
// 'accept-encoding,accept-language'

if (normalizeVary('Accept, *') === VARY_WILDCARD) {
  // response is uncacheable in any field-specific way
}
```

## Why this exists

A cache key derived from `Vary` must collapse semantically-equal lists to the same bytes: `Accept, Host` and `host,accept` must hash the same. Raw header values fail this because of case, whitespace, duplicates, and the `*` wildcard. This library exists to produce one stable string per equivalence class.

The trade-off: this is a normalizer, not a validator. It drops field names that are not syntactically valid RFC 9110 tokens rather than throwing — an upstream that sends `Vary: Bad(Token)` should not crash the cache. If you need rejection, check the input before calling.

## Exported names

- `normalizeVary(input)` — `string | string[]` → canonical string. Returns `''` for empty input and `VARY_WILDCARD` (`'*'`) when the list contains the wildcard.
- `varyFields(input)` — returns the sorted, de-duplicated, lowercased field-name array. `['*']` when the wildcard is present.
- `canonicalizeField(name)` — lowercases one field name; returns `''` if the name is not a valid token.
- `mergeVary(inputs[])` — unions several Vary sources into one normalized string; short-circuits to `VARY_WILDCARD` if any source is the wildcard.
- `VARY_WILDCARD` — the string constant `'*'`.

## Edge you will hit

A `Vary` header of `*, Accept-Encoding` is treated as `*` alone. RFC 9110 says the wildcard means "varies on everything," so once it appears, the rest of the list carries no additional information. If your cache needs to *ignore* a wildcard and still key on the named fields, that is a different policy and this library does not implement it.

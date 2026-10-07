/**
 * Normalizes HTTP `Vary` response-header field lists for use in cache-key
 * computation.
 *
 * RFC 9110 defines `Vary` as a comma-separated list of field names (or `*`
 * for "varies on everything the request could influence"). Two `Vary` strings
 * are semantically equivalent for caching whenever they name the same set of
 * fields after lowercasing and de-duplicating, e.g.
 * `Accept-Encoding, Accept-Language` ≡ `accept-language ,accept-encoding`.
 *
 * We resolve every observable ambiguity the brief leaves open by picking a
 * single, documented rule rather than trying to satisfy several readings:
 *
 *  1. Tokenization follows RFC 9110 §5.5: a comma separates list elements;
 *     OWS (optional whitespace) around each comma is ignored. Empty elements
 *     produced by leading/trailing/repeated commas (`", ,"`) are dropped —
 *     a header like `Vary: ,` carries no information and must not poison the
 *     cache key. We deliberately reject field names containing characters
 *     outside RFC 9110 token syntax, because accepting them would let a
 *     malformed upstream header smuggle arbitrary bytes into a cache key.
 *  2. Wildcard semantics: a single `*` means "unrestricted". We treat any
 *     Vary list containing `*` (after de-duplication) as equivalent to `*`
 *     alone — once a response varies on everything, listing further fields is
 *     redundant. This is the one reading RFC 9110 §12.5.5 endorses.
 *  3. Field-name case: HTTP field names are case-insensitive; we lowercase
 *     so that `Host` and `host` collapse to the same cache dimension.
 *  4. Output ordering is stable and ascending by code unit, so the function
 *     is a pure normalizer: identical input sets always yield byte-identical
 *     output strings. This lets a cache compare with a single `===`.
 */

/**
 * Sentinel returned in the normalized result when the Vary list contains `*`.
 * Exported so callers can test `result === VARY_WILDCARD` rather than doing a
 * string comparison, and so `mergeVary` can short-circuit without re-joining.
 */
export const VARY_WILDCARD = '*';

const TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Lowercase a field name to its canonical cache-key form.
 *
 * Exported so callers building cache keys from individual headers (rather
 * than a raw Vary string) end up using the exact same case-folding the
 * normalizer applies, guaranteeing `mergeVary([canonicalizeField('Accept')])`
 * and `normalizeVary('Accept')` produce identical tokens.
 *
 * @param {string} name Raw field name, e.g. from `req.headers`.
 * @returns {string} Lowercased name if `name` is a syntactically valid
 *   RFC 9110 token, otherwise the empty string — callers should treat an
 *   empty result as "unusable, drop this field".
 */
export function canonicalizeField(name) {
  if (typeof name !== 'string' || name.length === 0) return '';
  if (!TOKEN_RE.test(name)) return '';
  return name.toLowerCase();
}

/**
 * Split a raw `Vary` header into a de-duplicated, normalized set of
 * lowercased field names.
 *
 * Used internally by `normalizeVary` and exposed for callers that need the
 * *set* rather than the joined string (e.g. to iterate over fields when
 * building a composite cache key). The set is returned as a sorted array.
 *
 * @param {string|string[]} input One or more raw `Vary` header values. An
 *   array is accepted because HTTP client libraries commonly return repeated
 *   headers as an array; we concatenate with commas the same way the wire
 *   would, so `['Accept', 'Accept-Language']` and `'Accept, Accept-Language'`
 *   are indistinguishable downstream.
 * @returns {string[]} Sorted unique lowercased field names. If the input
 *   contains `*` the result is exactly `['*']`.
 */
export function varyFields(input) {
  if (Array.isArray(input)) {
    input = input.join(',');
  }
  if (typeof input !== 'string' || input.length === 0) return [];

  const seen = new Set();
  for (const piece of input.split(',')) {
    const token = piece.trim();
    if (token.length === 0) continue;
    if (!TOKEN_RE.test(token)) continue;
    const lower = token.toLowerCase();
    if (lower === '*') {
      seen.clear();
      seen.add('*');
      break;
    }
    seen.add(lower);
  }

  return Array.from(seen).sort();
}

/**
 * Normalize a `Vary` header value into a canonical string suitable for use
 * as (part of) a cache key.
 *
 * The empty string is returned for empty/whitespace-only/invalid input so
 * that `normalizeVary('')` and `normalizeVary(undefined)` are both falsy and
 * safe to concatenate into a key with a separator.
 *
 * @param {string|string[]} input Raw Vary header value(s).
 * @returns {string} Canonical comma-separated form, e.g.
 *   `'accept-encoding,accept-language'`, or `VARY_WILDCARD` (`'*'`) when the
 *   list names the wildcard, or `''` for empty input.
 */
export function normalizeVary(input) {
  const fields = varyFields(input);
  if (fields.length === 0) return '';
  if (fields.length === 1 && fields[0] === '*') return VARY_WILDCARD;
  return fields.join(',');
}

/**
 * Merge multiple Vary sources into one normalized list.
 *
 * A cache that composes responses from several upstreams often inherits
 * several `Vary` headers. Merging them is not string concatenation: the union
 * of `{A, B}` and `{B, C}` is `{A, B, C}`, not `A,B,B,C`. If any source is the
 * wildcard, the whole union is the wildcard — that is the only reading that
 * preserves the wildcard's "varies on everything" meaning.
 *
 * @param {(string|string[])[]} inputs Raw Vary values from each source.
 * @returns {string} Normalized union, or `VARY_WILDCARD` if any input
 *   normalizes to `*`.
 */
export function mergeVary(inputs) {
  if (!Array.isArray(inputs)) return '';
  const acc = new Set();
  for (const v of inputs) {
    for (const f of varyFields(v)) {
      if (f === '*') return VARY_WILDCARD;
      acc.add(f);
    }
  }
  if (acc.size === 0) return '';
  return Array.from(acc).sort().join(',');
}

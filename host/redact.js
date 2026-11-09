/**
 * Redaction for everything that crosses the Host → Client wire.
 *
 * `asc` never prints private key material, but child diagnostics can echo a
 * command line, an absolute `.p8` path or an environment assignment. These
 * patterns are applied to every stdout/stderr/log string the plugin returns and
 * to everything it writes to the Host log.
 */

const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
const AUTHKEY_PATH = /(?:[A-Za-z]:\\|\/)[^\s'"`]*AuthKey_[A-Za-z0-9]+\.p8/g
const ENV_ASSIGNMENT = /\b(ASC_(?:PRIVATE_KEY|PRIVATE_KEY_PATH|KEY_ID|ISSUER_ID))\s*=\s*\S+/g
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
const PEM_BODY_LINE = /^[A-Za-z0-9+/=]{40,}$/gm

/**
 * Remove credential-shaped text from one string.
 * @param {string} text
 * @returns {string}
 */
export function redact(text) {
  if (typeof text !== 'string' || text === '') return ''
  return text
    .replace(PRIVATE_KEY_BLOCK, '<redacted-private-key>')
    .replace(AUTHKEY_PATH, '<redacted-path>')
    .replace(ENV_ASSIGNMENT, '$1=<redacted>')
    .replace(JWT, '<redacted-jwt>')
    .replace(PEM_BODY_LINE, '<redacted-key-body>')
}

/**
 * Shorten an identifier for display. Key ids and issuer ids are not secrets
 * without the private key, but the panel never needs more than the tail.
 * @param {string | undefined | null} value
 */
export function tail(value, keep = 4) {
  if (typeof value !== 'string' || value === '') return undefined
  return value.length <= keep ? value : `…${value.slice(-keep)}`
}

/**
 * Bound a log string so a runaway child cannot blow up the panel payload.
 * @param {string} text
 * @param {number} maxBytes
 */
export function clampText(text, maxBytes) {
  if (typeof text !== 'string') return ''
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text
  const slice = Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8')
  return `${slice}\n… truncated at ${maxBytes} bytes`
}

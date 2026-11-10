import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { clampText, redact, tail } from '../dist/host/redact.js'

test('redact removes private key blocks', () => {
  const text = 'before\n-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----\nafter'
  const out = redact(text)
  assert.ok(out.includes('before'))
  assert.ok(out.includes('after'))
  assert.ok(!out.includes('MIIEvQIBADANBg'))
  assert.ok(out.includes('<redacted-private-key>'))
})

test('redact removes AuthKey paths and credential assignments', () => {
  const out = redact('open /Users/me/Downloads/AuthKey_ABC123XYZ.p8 then ASC_KEY_ID=ABC123 and ASC_ISSUER_ID=DEF')
  assert.ok(!out.includes('AuthKey_ABC123XYZ'))
  assert.ok(!out.includes('ABC123 and'))
  assert.ok(out.includes('<redacted-path>'))
  assert.ok(out.includes('ASC_KEY_ID=<redacted>'))
})

test('redact removes jwt-shaped tokens', () => {
  const out = redact('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1g')
  assert.ok(!out.includes('eyJhbGciOiJIUzI1NiJ9'))
  assert.ok(out.includes('<redacted-jwt>'))
})

test('redact keeps ordinary asc error text intact', () => {
  const text = 'Error: apps: missing authentication. Run "asc auth login".'
  assert.equal(redact(text), text)
})

test('tail shortens identifiers and tolerates absence', () => {
  assert.equal(tail('ABCDEF1234'), '…1234')
  assert.equal(tail('AB'), 'AB')
  assert.equal(tail(undefined), undefined)
  assert.equal(tail(''), undefined)
})

test('clampText bounds a runaway log', () => {
  const out = clampText('x'.repeat(100), 10)
  assert.ok(out.length < 100)
  assert.ok(out.includes('truncated'))
  assert.equal(clampText('short', 10), 'short')
})

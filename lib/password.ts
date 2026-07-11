import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto'

// Формат хранения: `scrypt$<salt_hex>$<derived_hex>`.
// Старый формат (одиночный SHA-256) `<salt>:<hash>` поддерживается для входа,
// после успешного входа пароль перехешируется в scrypt (см. needsRehash).
const SCRYPT_PREFIX = 'scrypt$'
const KEYLEN = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, KEYLEN).toString('hex')
  return `${SCRYPT_PREFIX}${salt}$${derived}`
}

export function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith(SCRYPT_PREFIX)) {
    const [, salt, hash] = stored.split('$')
    if (!salt || !hash) return false
    const derived = scryptSync(password, salt, KEYLEN)
    const expected = Buffer.from(hash, 'hex')
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  }
  // legacy: SHA-256 в формате `<salt>:<hash>`
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const legacy = Buffer.from(createHash('sha256').update(salt + password).digest('hex'))
  const expected = Buffer.from(hash)
  return legacy.length === expected.length && timingSafeEqual(legacy, expected)
}

// true, если пароль сохранён в старом (слабом) формате и его стоит перехешировать
export function needsRehash(stored: string): boolean {
  return !stored.startsWith(SCRYPT_PREFIX)
}

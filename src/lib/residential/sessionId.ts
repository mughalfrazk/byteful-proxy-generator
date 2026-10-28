import { randomInt } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
export const SESSION_ID_LENGTH = 16

/** 16 characters from `[A-Z0-9]`, from a CSPRNG so IDs are not predictable. */
export function generateSessionId(): string {
  let id = ''
  for (let i = 0; i < SESSION_ID_LENGTH; i += 1) {
    id += ALPHABET[randomInt(ALPHABET.length)]
  }
  return id
}

import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { firebaseConfig } from './firebase-config.js'

const app  = initializeApp(firebaseConfig)
export const db   = getDatabase(app)
export const auth = getAuth(app)

export async function signIn() {
  const cred = await signInAnonymously(auth)
  return cred.user.uid
}

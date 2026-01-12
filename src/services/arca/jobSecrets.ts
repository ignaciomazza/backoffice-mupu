// src/services/arca/jobSecrets.ts
type SecretEntry = { password: string; expiresAt: number };

const SECRET_TTL_MS = 1000 * 60 * 15;
const jobSecrets = new Map<number, SecretEntry>();

export function setJobSecret(jobId: number, password: string): void {
  jobSecrets.set(jobId, { password, expiresAt: Date.now() + SECRET_TTL_MS });
}

export function getJobSecret(jobId: number): string | null {
  const entry = jobSecrets.get(jobId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    jobSecrets.delete(jobId);
    return null;
  }
  return entry.password;
}

export function clearJobSecret(jobId: number): void {
  jobSecrets.delete(jobId);
}

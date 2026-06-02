import bcrypt from "bcryptjs";

const DEFAULT_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 1) {
    throw new Error("Password is required");
  }
  return bcrypt.hash(password, DEFAULT_COST);
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!password || !hash) {
    return false;
  }
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

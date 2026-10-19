import { authOptions } from "./config";
import NextAuth, { type NextAuthConfig } from "next-auth";

/**
 * Convenience wrapper around getServerSession.
 * Usage in Server Components: `const session = await getSession();`
 * Usage in tRPC context:       `const session = await getServerSession(authOptions);`
 */
export const getSession = () => auth();
export { authOptions };

export const { auth } = NextAuth(authOptions as any);

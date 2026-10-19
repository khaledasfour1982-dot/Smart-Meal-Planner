import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "~/server/db";
import { user } from "~/server/db/schema";

/**
 * NextAuth v5 imports with v4-style configuration for simplicity.
 *
 * Using JWT session strategy (no DB adapter needed for sessions).
 * Credentials provider validates email/password against the users table.
 */
export const authOptions: NextAuthConfig = {
    session: {
        strategy: "jwt",
    },

    pages: {
        signIn: "/login",
    },

    providers: [
        Credentials({
            name: "credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },

            async authorize(credentials) {
                if (
                    typeof credentials?.email !== "string" ||
                    typeof credentials?.password !== "string"
                ) {
                    return null;
                }

                const [dbUser] = await db
                    .select()
                    .from(user)
                    .where(eq(user.email, credentials.email))
                    .limit(1);

                if (!dbUser?.passwordHash) return null;

                const isValid = await bcrypt.compare(
                    credentials.password,
                    dbUser.passwordHash,
                );

                if (!isValid) return null;

                return {
                    id: dbUser.id,
                    email: dbUser.email,
                    name: dbUser.name,
                };
            },
        }),
    ],

    callbacks: {
        jwt({ token, user }) {
            if (user) {
                token.id = user.id;
            }
            return token;
        },

        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string;

                const dbUser = await db.query.user.findFirst({
                    where: eq(user.id, token.id as string),
                    columns: { consentTimestamp: true },
                });

                (session.user as typeof session.user & { hasConsented: boolean })
                    .hasConsented = Boolean(dbUser?.consentTimestamp);
            }

            return session;
        },
    },
};

// Add auth method for tRPC compatibility
export const { auth, handlers, signIn, signOut } = NextAuth(authOptions);

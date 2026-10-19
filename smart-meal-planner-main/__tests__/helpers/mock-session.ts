import type { Session } from "next-auth";

/**
 * Creates a mock NextAuth v4 session for use in tRPC context tests.
 *
 * Usage:
 *   import { mockSession } from "__tests__/helpers/mock-session";
 *   const ctx = createInnerTRPCContext({ session: mockSession("user-1") });
 */
export const mockSession = (userId: string): Session => ({
  user: { id: userId, email: "test@test.com" },
  expires: "9999-01-01",
});

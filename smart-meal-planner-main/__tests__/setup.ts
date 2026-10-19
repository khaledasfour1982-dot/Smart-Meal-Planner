// Global Vitest setup file.
// Add shared mocks here as features are implemented.
// Example: vi.mock("~/server/db") for Drizzle DB mock.
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock server-only to allow importing server code in jsdom/test environments
vi.mock("server-only", () => ({}));

vi.mock("~/env", () => ({
	env: {
		DATABASE_URL: "postgres://test:test@localhost:5432/test",
		DATABASE_URL_UNPOOLED: "postgres://test:test@localhost:5432/test",
		AI_PROVIDER: "groq",
		GROQ_API_KEY: "test-key",
		OPENAI_API_KEY: "",
		OPENAI_MODEL: "gpt-4o-mini",
		GROQ_MODEL: "llama-3.3-70b-versatile",
		NODE_ENV: "test",
	},
}));

// next-auth may import `next/server` in node test environments.
// Provide a lightweight shim so UI tests can load without Next runtime.
vi.mock("next/server", () => ({
	NextRequest: class NextRequest {},
	NextResponse: {
		next: () => ({}) as Record<string, unknown>,
		redirect: () => ({}) as Record<string, unknown>,
		json: (body: unknown) => body,
	},
}));

vi.mock("next-auth/react", () => ({
	SessionProvider: ({ children }: { children: unknown }) => children,
	useSession: () => ({ data: null, status: "unauthenticated" as const }),
	signIn: vi.fn(),
	signOut: vi.fn(),
}));

vi.mock("next-auth", () => ({
	default: vi.fn(() => ({
		auth: vi.fn(),
		handlers: {
			GET: vi.fn(),
			POST: vi.fn(),
		},
		signIn: vi.fn(),
		signOut: vi.fn(),
	})),
	AuthError: class AuthError extends Error {},
}));

vi.mock("next-auth/providers/credentials", () => ({
	default: vi.fn(),
}));

vi.mock("~/server/ai/groq-client", () => ({
	groqClient: {},
}));

vi.mock("~/server/services/ai-provider.service", () => ({
	getAiProvider: vi.fn(() => "groq"),
	createJsonCompletion: vi.fn(),
	createChatCompletion: vi.fn(),
}));

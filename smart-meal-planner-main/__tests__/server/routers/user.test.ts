import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  findFirstUser: vi.fn(),
  findFirstProfile: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  delete: vi.fn(),
  deleteWhere: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
  cookies: () => ({ get: () => null, getAll: () => [] }),
}));

vi.mock("~/server/db", () => ({
  db: {
    query: {
      user: { findFirst: dbMocks.findFirstUser },
      profiles: { findFirst: dbMocks.findFirstProfile },
    },
    update: dbMocks.update,
    insert: dbMocks.insert,
    delete: dbMocks.delete,
  },
}));

vi.mock("~/server/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

import { userRouter } from "~/server/api/routers/user";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";
import { mockSession } from "../../helpers/mock-session";

const makeCallerFactory = createCallerFactory(userRouter);

function authedCaller(userId = "user-1") {
  return makeCallerFactory({
    db: db as unknown,
    session: mockSession(userId),
    headers: new Headers(),
  } as Parameters<typeof makeCallerFactory>[0]);
}

function unauthedCaller() {
  return makeCallerFactory({
    db: db as unknown,
    session: null,
    headers: new Headers(),
  } as Parameters<typeof makeCallerFactory>[0]);
}

const householdPayload = {
  adults: 2,
  children: 1,
  toddlers: 0,
  dietTypes: ["vegetarian"],
  allergens: ["peanuts"],
  dislikes: ["mushrooms"],
  weeklyBudgetEuro: 95,
  portionMultipliers: { adult: 1, child: 0.75, toddler: 0.5 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);

  dbMocks.updateWhere.mockResolvedValue({ success: true });
  dbMocks.updateSet.mockReturnValue({ where: dbMocks.updateWhere });
  dbMocks.update.mockReturnValue({ set: dbMocks.updateSet });

  dbMocks.insertValues.mockResolvedValue({ success: true });
  dbMocks.insert.mockReturnValue({ values: dbMocks.insertValues });

  dbMocks.deleteWhere.mockResolvedValue({ success: true });
  dbMocks.delete.mockReturnValue({ where: dbMocks.deleteWhere });
});

describe("user.updateProfile", () => {
  it("throws UNAUTHORIZED when no session is present", async () => {
    await expect(unauthedCaller().updateProfile(householdPayload)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    expect(dbMocks.findFirstProfile).not.toHaveBeenCalled();
    expect(dbMocks.insertValues).not.toHaveBeenCalled();
  });

  it("accepts a household payload through the canonical user.updateProfile route", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(undefined);

    await authedCaller("user-1").updateProfile(householdPayload);

    expect(dbMocks.findFirstProfile).toHaveBeenCalledOnce();
    expect(dbMocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        adults: 2,
        children: 1,
        toddlers: 0,
        dietTypes: ["vegetarian"],
        allergens: ["peanuts"],
        dislikes: ["mushrooms"],
        weeklyBudgetEuro: 95,
        portionMultipliers: { adult: 1, child: 0.75, toddler: 0.5 },
      }),
    );
  });
});

describe("user.deleteAccount", () => {
  it("throws UNAUTHORIZED when no session is present", async () => {
    await expect(unauthedCaller().deleteAccount()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    expect(dbMocks.delete).not.toHaveBeenCalled();
  });

  it("deletes the authenticated user record and returns success", async () => {
    const result = await authedCaller("user-1").deleteAccount();

    expect(dbMocks.delete).toHaveBeenCalledOnce();
    expect(dbMocks.deleteWhere).toHaveBeenCalledOnce();
    expect(result).toEqual({ success: true });
  });

  it("keeps deletion user-scoped by relying on the caller session rather than external input", async () => {
    await authedCaller("user-2").deleteAccount();

    expect(dbMocks.delete).toHaveBeenCalledOnce();
    expect(dbMocks.deleteWhere).toHaveBeenCalledOnce();
  });
});
"use server"

import { db } from "~/server/db"
import { user } from "~/server/db/schema"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { redirect } from "next/navigation"

export async function register(formData: FormData) {
    const name = String(formData.get("name") ?? "");
    const email = String(formData.get("email") ?? "").trim().toLowerCase()
    const password = String(formData.get("password") ?? "")

    if (!email || !password) {
        redirect("/register?error=missing_fields")
    }

    const existingUser = await db.select().from(user).where(eq(user.email, email))
    if (existingUser.length > 0) {
        redirect("/register?error=user_exists")
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    await db.insert(user).values({
        name,
        email,
        passwordHash: hashedPassword,
    })

    return { success: true }
}

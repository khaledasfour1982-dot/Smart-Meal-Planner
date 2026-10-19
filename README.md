Smart Meal Planner (Gourmet Edition)
AI-Powered Family Nutrition Orchestration & Bespoke Culinary Concierge
Next.js TypeScript Database ORM AI Engine Multi-Agent

Executive Summary
Smart Meal Planner is a premium, concierge-level SaaS application engineered to solve the daily headache of family meal planning. By bridging the gap between Large Language Models (LLMs) and strict, structured relational data, it delivers hyper-personalized 7-day menus tailored to European households.

Unlike generic recipe scrapers, the system features Dynamic Portion Scaling (automatically adjusts quantities based on adults, children, and toddlers), Strict Allergen Validation (EU Annex II compliance), and an AI Kitchen Concierge (a context-aware chatbot capable of updating database schedules directly through natural conversation).

The platform is designed with a Mobile-First philosophy—tailored for high-stress environments like the kitchen or the supermarket aisle—featuring a fluid, glassmorphism aesthetic that scales beautifully from mobile devices to desktop viewports.

🛠️ System Architecture & Multi-Agent Core
The application is built on a modular T3 Stack pattern and operates as a Cooperative Multi-Agent System (MAS). Rather than relying on a single monolithic LLM call, specialized agents coordinate to generate, validate, fetch assets, and refine plans.


The Cooperative Agents
The Orchestrator Agent (plan-generation.service.ts):
Role: Coordinates lifecycle states. It manages the active/inactive status of plans, controls the transactional boundaries, initiates async generation threads, and streams generation progress down to the client using Server-Sent Events (SSE).
The Generator Agent (meal-generator.service.ts):
Role: Translates raw prompts into structured menus. It compiles household sizes, budget lines, dislikes, and recent meal histories into system instructions, prompts the LLM, and enforces Zod structure compliance via self-correcting retry loops.
The Verifier Agent (allergen-validator.ts):
Role: Enforces hard safety requirements. It acts as an independent validation gateway. If it detects any cross-contamination or blacklisted allergen (like peanut traces in a nut-free plan), it immediately fails the check, forcing the Generator Agent to trigger a correction retry.
The Retrieval Agent (pixabay-image.ts & meal-plan-saver.ts):
Role: Media asset enrichment. It scans the finalized recipes, processes search queries, and makes external API requests to match dishes with high-quality photos (using Pixabay or falling back to LoremFlickr).
The Interactive Concierge Agent (help.ts router):
Role: Natural language interface. Evaluates current user profiles, schedule schemas, and browser URL paths to construct context-grounded conversational responses. It outputs structured JSON command blocks to execute schedule modifications.
💬 Kitchen Concierge Chatbot Architecture
The Kitchen Concierge chatbot is a specialized context-aware agent that bridges natural language instruction with UI reactivity and database states.


The Engineering Journey: From Draft to Production
This section documents the technical evolution of the application, focusing on key challenges, architectural decisions, and performance optimizations.

🟢 Phase 1: Structured AI Prompting & The "JSON Shape" Problem
Goal: Instruct an LLM to generate a valid 7-day meal plan.

The Problem: LLMs are naturally conversational and frequently return markdown formatting, conversational pleasantries, or inconsistent JSON schemas (e.g., changing array keys from ingredients to items). This crashed the backend during serialization.
The Solution:
Constructed a strict backend validation schema using Zod (MealPlanSchema).
Configured the AI provider to enforce JSON Mode.
Implemented an automated Retry Engine (up to 3 attempts). If the returned JSON fails the Zod parse boundary, the system catches the error, appends the validator trace to the history, and requests a corrected payload.
🟡 Phase 2: User Safety & Allergen Filter Pipelines
Goal: Ensure meal plan generation is 100% safe for family members with severe allergies.

The Problem: Even when told to omit an allergen (e.g., peanuts) in a prompt, LLMs sometimes hallucinate or include cross-contaminated ingredients (e.g., peanut oil or satay sauce).
The Solution:
Developed a post-generation Allergen Validation Service (allergen-validator.ts).
Before saving a plan to the database, the code parses every generated ingredient and compares it against the user's allergen profile.
If a violation is discovered, it throws a custom AllergenViolationError, immediately halts the transaction, and regenerates the plan.
🟠 Phase 3: Optimizing LLM Costs with Lazy Hashed Caching
Goal: Minimize API response times and token costs.

The Problem: Generating a full 7-day plan with complete, detailed cooking steps in a single API call consumes massive amounts of tokens, hits token limits, and causes HTTP request timeouts.
The Solution:
Lazy Loading: The plan generator only outputs meal summaries and scaled ingredient lists initially. Cooking instructions are generated on-demand only when a user clicks a specific meal.
Hashed Caching: When instructions are generated, the server computes a mealHash (a SHA-256 hash of the normalized recipe name and ingredients). The recipe instructions are stored in the database under this hash key.
If a user (or another user) generates the same meal, the app serves the instructions instantly from the database cache, skipping the LLM call entirely.
🔴 Phase 4: Dynamic Unit & Package Price Normalization
Goal: Correct inaccurate pricing totals across scaled ingredient lists.

The Problem: The database contains static ingredient package prices (e.g., Oats at €0.99 with unit g). When a recipe scaled up to 435g, the formula calculated 0.99 * 435 = €430.65 for a single bowl of oatmeal!
The Solution:
Refactored the price calculation service (ingredient-pricing.service.ts).
Implemented package-price scaling: if the database stores a price with a small unit (like "g" or "ml"), it is normalized to standard retail sizes (e.g., dividing by 500g for grains or 250ml for liquids).
Added standard unit conversion filters (converting recipe grams to database kilograms, and recipe milliliters to database liters) to enable accurate calculations.
Kept strict unit mismatch fallback rules (counting unmatched units as 1x package price) to satisfy edge cases and unit tests.
🟣 Phase 5: Professional Portion Rounding Rules
Goal: Avoid strange decimal fractions in quantities for discrete, countable items.

The Problem: Scaling ingredients for a household (e.g., multiplying by a family factor of 3.25) resulted in weird, unhelpful quantities like 4.25 pcs of lemons, 8.75 slices of bread, or 1.3 cans of beans.
The Solution:
Enhanced portion-scaler.ts by introducing discrete unit filters.
If an ingredient's unit is countable (e.g., pcs, pieces, slices, cans, bottles), the system rounds the scaled quantity to the nearest 0.5 boundary.
For liquids (ml, L) and powders (g, kg), the system continues to use standard fractional rounding (0.25 or 0.1 boundaries). This delivers intuitive, kitchen-friendly instructions (like 4.5 lemons instead of 4.25).
💻 Tech Stack
Component	Technology	Description
Framework	Next.js 15.2 (App Router), React 19	Core engine & rendering environment.
Type Safety	tRPC v11, TypeScript 5.8	End-to-end type safety between backend & client.
Database	Neon, Drizzle ORM	Serverless PostgreSQL database & TypeScript ORM.
Auth	NextAuth.js (Auth.js v5 Beta)	Secure authentication with JWT session strategy.
AI Reasoning	OpenAI (GPT-4o) & Groq (Llama-3.3)	Plan generation, lazy instructions, & chatbot.
Styling	Tailwind CSS 4.0, Radix UI	Responsive glassmorphism interface design.
Testing	Vitest, Testing Library	High-speed unit and UI smoke testing.
📂 Project Structure
smart-meal-planner/
├── __tests__/                  # Vitest Test Suite (Unit & UI Tests)
├── drizzle/                    # Database Migrations folder
├── src/
│   ├── app/                    # Next.js App Router (Pages, Layouts & Route handlers)
│   │   ├── api/                # API Route handlers (Auth, SSE stream, tRPC)
│   │   └── (protected)/        # Auth-locked screens (Dashboard, Plans, Shopping List)
│   ├── components/             # Reusable UI Components (Meal cards, shopping list)
│   ├── data/                   # Seed files & Local database pricing files
│   ├── hooks/                  # Custom react hooks (SSE connection helper)
│   ├── server/                 # Domain logic layer
│   │   ├── ai/                 # Prompts, schemas, portion scalers, allergen checks
│   │   ├── api/                # tRPC Router definitions (help, plans, meals)
│   │   ├── db/                 # Database schema definitions and client connection
│   │   └── services/           # AI providers, orchestrators, pricing calculators
│   └── env.js                  # Environment variable Zod validation schema
├── drizzle.config.ts           # Drizzle migration connection details
├── package.json                # Project dependencies and run scripts
└── tsconfig.json               # TypeScript configurations
🚀 Installation & Setup
Prerequisites
Node.js: v20 or higher.
PostgreSQL: A cloud instance (Neon recommended).
OpenAI API Key: Required for generation and chatbot operations.
1. Setup Configuration
Copy .env.example in the root directory to .env and fill in your real credentials:

# Neon PostgreSQL – pooled connection (used by the app at runtime)
DATABASE_URL="postgres://user:password@host/db?sslmode=require"

# Neon PostgreSQL – direct/unpooled connection (migrations only via drizzle-kit)
DATABASE_URL_UNPOOLED="postgres://user:password@host/db?sslmode=require"

# NextAuth.js v4
# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET=""
# Your public app URL (http://localhost:3000 for local dev)
NEXTAUTH_URL="http://localhost:3000"

# AI provider selection
# "groq" (default) or "openai"
AI_PROVIDER="groq"

# OpenAI API (required when AI_PROVIDER="openai")
OPENAI_API_KEY=""
# Optional: OpenAI model override (default: gpt-4o-mini)
OPENAI_MODEL="gpt-4o-mini"

# Groq LLM
GROQ_API_KEY=""
# Optional: Groq model override (default: llama-3.3-70b-versatile)
GROQ_MODEL=""

# Image retrieval
# PIXABAY
PIXABAY_API_KEY="" # Get from https://pixabay.com/api/docs/ Under Search Images
2. Install Dependencies
npm install
3. Sync Database Schema
Push Drizzle schema configurations directly to your Neon PostgreSQL instance:

npm run db:push
4. Start Local Development
Run the Next.js dev server:

npm run dev
Open http://localhost:3000 in your browser.

5. Run Tests
To verify the system's integrity, execute the Vitest suite:

npm run test
License & Disclaimer
MIT License. This project is a professional Proof of Concept (PoC) built to validate multi-agent AI orchestration patterns. No guarantee of production readiness or long-term maintenance is provided.

Client: Studio Vinnie
Developers: khaled Asfour, Derek, Hasham

Smart Meal Planner – Engineered for the Palate, Optimized for the Future.

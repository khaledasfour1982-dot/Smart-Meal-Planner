# Smart Meal Planner (Gourmet Edition)
### AI-Powered Family Nutrition Orchestration

**Smart Meal Planner** is a premium, concierge-level SaaS Proof of Concept (PoC) developed for **Studio Vinnie**. It is engineered to solve the "daily headache" of family meal planning by bridging the gap between Large Language Models (LLMs) and structured, safe nutritional data.

---

## Executive Summary

Developed as a modern "T3" stack application, **Smart Meal Planner** generates hyper-personalized 7-day menus tailored to European households. Unlike generic recipe apps, this system prioritizes **Household Composition** (adults vs. children), **Strict Allergen Safety** (EU Annex II), and **Kitchen-Ready UX**.

The platform is built with a **Mobile-First** philosophy—designed for high-stress environments like the kitchen or the supermarket aisle—while maintaining a fluid, "Gourmet" glassmorphism aesthetic that scales seamlessly to tablets, laptops, and 4K desktops.

---

## Key Features

*   **Mobile-First "Kitchen Companion"**: Priority #1 UX design for mobile devices, featuring high-contrast typography and touch-optimized glassmorphism components for one-handed use.
*   **Dynamic Household Scaling**: Automatically adjusts portion sizes and ingredient quantities based on your unique family profile (Adults, Children, and Toddlers).
*   **Real-Time AI Streaming (SSE)**: Utilizes Server-Sent Events to stream Zod-validated JSON meal plans from Groq/OpenAI, ensuring the user sees progress immediately without waiting for the full 7-day generation.
*   **European Allergen Compliance**: Implements a recursive validation engine to enforce strict dietary constraints (Halal, Vegan, Nut-free, Gluten-free) across the entire weekly schedule.
*   **Consolidated Shopping Logic**: Merges disparate meal ingredients into a single, optimized grocery list categorized by supermarket aisle (Produce, Dairy, Pantry, etc.).
*   **Interactive Feedback Loop**: Features a "Thumbs Up/Down" grading system that allows the AI to learn household taste preferences for future plan optimizations.

---

## Technical Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Next.js 15.2 (App Router), React 19 |
| **Type Safety** | tRPC v11, TypeScript 5.8 |
| **Styling** | Tailwind CSS 4.0, Radix UI (Gourmet Design System) |
| **Database** | Drizzle ORM, Neon (Serverless PostgreSQL) |
| **AI Engine** | Groq (Llama-3.3) & OpenAI (GPT-4o) |
| **Auth** | NextAuth.js (Auth.js v5 Beta) |

---

## Technical Showcase: The Streaming Intelligence Layer

A core challenge of this project was converting fuzzy LLM prompts into rigid, valid JSON that the application could rely on for database persistence.

**The Solution:**
I engineered a robust **Prompt-to-Schema** pipeline. The system uses a specialized system prompt containing 2026 Belgian supermarket price data and strict EU allergen identifiers. By utilizing **SSE (Server-Sent Events)**, the application bypasses standard request timeouts, allowing the "Gourmet" UI to render meals as they are generated. 

Before committing to the database, every ingredient passes through a **Recursive Zod Validator**. If the AI suggests an ingredient that violates a family's allergen blacklist, the system detects the conflict at the stream level, ensuring that the final saved plan is 100% safe.

---

## Installation & Setup

### Prerequisites
*   Node.js 20+
*   PostgreSQL (Neon)
*   Groq or OpenAI API Key

### Quick Start
1.  **Clone**: `git clone https://github.com/your-repo/smart-meal-planner.git`
2.  **Install**: `npm install`
3.  **Config**: `cp .env.example .env` (Populate with your keys)
4.  **Database**: `npm run db:push`
5.  **Run**: `npm run dev`

---

## Research & Future Roadmap

This Proof of Concept has laid the groundwork for several advanced research areas:
*   **Retailer Integration**: Future versions aim to fetch real-time promotional data (Colruyt/Carrefour) to suggest "Promo-Swaps" (e.g., swapping Broccoli for Cauliflower based on current flyers).
*   **One-Click Ordering**: Researching deep-links to supermarket shopping carts (Collect&Go) for direct ingredient checkout.
*   **Nutri-Score Analysis**: Automated health-score calculation for the entire weekly menu.

---

## License & Disclaimer
**MIT License**. This project is a student-led Proof of Concept. No guarantee of production readiness or long-term maintenance is provided.

**Client:** Studio Vinnie (Vincent Peters)  
**Developers:** Hasham, Derek, Khaled  

---
*Smart Meal Planner – Engineered for the Palate, Optimized for the Future.*

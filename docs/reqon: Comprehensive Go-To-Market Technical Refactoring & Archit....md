Markdown
# reqon: Comprehensive Go-To-Market Technical Refactoring & Architecture Plan

This document outlines the prioritized architectural changes, infrastructure enhancements, and packaging strategies required to transition the `reqon` system from its current state to a market-ready production product.

---

## Phase 1: High Priority – Core Monorepo Restructuring & Schema Enforcement
**Objective:** Eliminate type duplication, enforce architectural consistency across all five sub-apps (Cloud Server, Personal Server, Extension, Mobile View, Web View), and ensure predictable, "crash-early" runtime configurations.

### 1. Transition to a Turborepo Workspace
To manage dependencies uniformly and ensure that changes to shared core files propagate across all components instantly, transition the repository into a Monorepo.

#### Recommended Workspace Directory Layout:
```text
reqon-monorepo/
├── apps/
│   ├── cloud-server/       # Hosted on Render
│   ├── personal-server/    # Self-hosted stack (Targeting macOS installer)
│   ├── extension/          # Chrome Extension
│   ├── mobile/             # React Native / Expo App
│   └── web-view/           # Shared Dashboard Web View
├── packages/
│   ├── core/               # Shared logic, scoring, and data synchronization
│   ├── database/           # Prisma / Supabase schema definitions
│   └── tsconfig/           # Shared TypeScript configurations
├── package.json
└── turbo.json
Root Configuration: turbo.json
Place this in your root directory to orchestrate optimized, parallelized builds across the workspace:

JSON
{
  "$schema": "[https://turbo.build/schema.json](https://turbo.build/schema.json)",
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**", "build/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "test": {
      "dependsOn": ["^test"],
      "outputs": ["coverage/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
2. Runtime Environment Validation
Enforce strict validation on initialization using Zod and Envalid so that both Render-hosted instances and local Personal Servers crash instantly with meaningful logs if a required environment variable is missing.

Implementation: packages/core/src/env.ts
TypeScript
import { cleanEnv, str, port } from 'envalid';
import { z } from 'zod';

// Zod schema for runtime validation and static typing
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string().url(),
  BREVO_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
});

export function validateEnv() {
  return cleanEnv(process.env, {
    NODE_ENV: str({ choices: ['development', 'test', 'production'] }),
    PORT: port({ default: 3000 }),
    DATABASE_URL: str(),
    BREVO_API_KEY: str(),
    SUPABASE_URL: str({ default: undefined }),
    SUPABASE_ANON_KEY: str({ default: undefined }),
  });
}
Phase 2: Medium-High Priority – Cloud, Mail, & Supabase Architecture
Objective: Solidify Render deployment pipelines, transition critical email hooks over to Brevo, and build a scalable abstraction path to handle data migration to Supabase at critical mass.

1. Render Deployment Infrastructure as Code (render.yaml)
Define your infrastructure declaratively. This ensures identical staging and production environments on Render.

YAML
services:
  - type: web
    name: reqon-cloud-server
    env: node
    plan: starter
    buildCommand: pnpm install && pnpm build --filter=cloud-server
    startCommand: pnpm start --filter=cloud-server
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: reqon-primary-db
          property: connectionString
      - key: BREVO_API_KEY
        sync: false

databases:
  - name: reqon-primary-db
    plan: starter
    postgresVersion: 15
2. Standardized Brevo Inbound/Outbound Mail Client Layer
Abstract transactional mailing processes using Brevo's official transactional API library.

Implementation: packages/core/src/mail.ts
TypeScript
import LucrativeMail from '@getbrevo/brevo';

export class MailService {
  private apiInstance: LucrativeMail.TransactionalEmailsApi;

  constructor(apiKey: string) {
    this.apiInstance = new LucrativeMail.TransactionalEmailsApi();
    this.apiInstance.setApiKey(LucrativeMail.TransactionalEmailsApiApiKeys.apiKey, apiKey);
  }

  async sendApplicationAlert(toEmail: string, candidateName: string, jobTitle: string, status: string) {
    const sendSmtpEmail = new LucrativeMail.SendSmtpEmail();
    
    sendSmtpEmail.subject = `reqon Update: Application status for ${jobTitle}`;
    sendSmtpEmail.htmlContent = `<html><body><h1>Hello ${candidateName},</h1><p>Your application tracking status updated to: <strong>${status}</strong>.</p></body></html>`;
    sendSmtpEmail.sender = { name: "reqon Platform", email: "no-reply@reqon.ai" };
    sendSmtpEmail.to = [{ email: toEmail }];

    try {
      await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      return { success: true };
    } catch (error) {
      console.error("Brevo Mail Pipeline Error:", error);
      throw new Error("Failed to dispatch critical system notification.");
    }
  }
}
3. Repository Pattern for Seamless Supabase Migration
To prevent code lock-in with the current local/SQLite storage mechanism, use an abstract repository pattern. When the time comes to cut over to Supabase, you will only need to swap the active class implementation via Dependency Injection, leaving the business logic completely untouched.

Strategy Pattern: packages/core/src/repository.ts
TypeScript
export interface JobApplication {
  id: string;
  title: string;
  company: string;
  status: string;
  createdAt: Date;
}

// Storage agnostic structural contract
export interface IApplicationRepository {
  findById(id: string): Promise<JobApplication null |>;
  save(application: JobApplication): Promise<JobApplication>;
}

// Current Production Framework (SQLite/Prisma Local)
export class LocalPrismaRepository implements IApplicationRepository {
  async findById(id: string) { 
    // Handle local query mechanics 
    return null; 
  }
  async save(app: JobApplication) { 
    return app; 
  }
}

// Future Scaled Framework (Supabase Migration Target)
export class SupabaseRepository implements IApplicationRepository {
  async findById(id: string) { 
    // Handle Supabase JS Client fetching logic 
    return null; 
  }
  async save(app: JobApplication) { 
    return app; 
  }
}
Phase 3: Medium Priority – Automated CI/CD Workflows
Objective: Build a unified GitHub Actions pipeline running lint, unit tests, automated integration checks, and hands-free delivery deployments to Render.

Production Configuration: .github/workflows/ci-cd.yml
YAML
name: reqon Platform CI/CD

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  verify-and-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Source Code
        uses: actions/checkout@v4

      - name: Setup Node.js Environment
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Get pnpm cache directory
        shell: bash
        run: echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

      - name: Cache Monorepo Dependencies
        uses: actions/cache@v4
        with:
          path: ${{ env.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: ${{ runner.os }}-pnpm-store-

      - name: Install Workspace Dependencies
        run: pnpm install --frozen-lockfile

      - name: Global Monorepo Code Linting
        run: pnpm turbo run lint

      - name: Execute Isolated Unit Tests
        run: pnpm turbo run test

  deploy-cloud-server:
    needs: verify-and-test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy Production Stack to Render
        uses: johnbeynon/render-deploy-action@v0.0.8
        with:
          service-id: ${{ secrets.RENDER_SERVICE_ID }}
          api-key: ${{ secrets.RENDER_API_KEY }}
Phase 4: Foundational Priority – Personal Server macOS Packaging Strategy
Objective: Prepare the distributed background services and agents for distribution via a native, consumer-grade macOS installer bundle (.pkg or .dmg).

Blueprint Recommendations for the Engineer:
Lightweight Runtime Wrapper Shell: Wrap the background services, web dashboard interface, and initialization loops inside Tauri (highly recommended due to its tiny Rust runtime memory footprint) or Electron. This creates a single system tray app or executable bundle.

Handling PyInstaller Binaries for Python Agents: The python modules (agent/mail_ingest.py, agent/scout.py) must be bundled down into self-contained architectural binaries (Darwin arm64/x64 targets) using PyInstaller or Briefcase prior to wrapping them in the GUI package. This bypasses requiring users to have Python manually pre-configured on their machines.

Codesigning and Notarization Pipeline: To prevent macOS from blocking the installer with "App is corrupted / developer unidentified" warnings, the CI/CD pipeline must use an Apple Developer Certificate to codesign the output app, and submit it directly to Apple's background notary engine (notarytool) during compilation releases.

Operational Anti-Patterns & Engineering Fixes to Monitor
⚠️ Anti-Pattern: In-Memory / Synchronous Email Processing
Risk: Processing high-volume or heavily nested email inputs directly inline will block single-threaded event loops, drop background connections, and result in timeouts.

Engineering Fix: Enforce a strict decoupling pattern. Ingest scripts should save raw, unparsed email payloads straight into an entry-level ingestion queue table within SQLite, allowing background workers to parse contents and perform LLM enrichments asynchronously.

⚠️ Anti-Pattern: Uncontrolled Mobile Re-renders
Risk: Constantly passing full websocket synchronization updates down to components like RoleCard.tsx inside React Native can degrade UI frames per second.

Engineering Fix: Implement Shopify's FlashList instead of default core list primitives and utilize fine-grained primitive memoization primitives (React.memo, useCallback) on individual dynamic tracking nodes.
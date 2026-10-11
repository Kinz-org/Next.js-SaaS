# MCP Setup Guide - Complete Walkthrough

> This is your first time using MCP? You're in the right place.
> 15 minutes from zero to live AI-tooled development.

---

## What is MCP, in 60 seconds

**Model Context Protocol (MCP)** is an open standard released by Anthropic in late 2024. It lets AI coding assistants (Cursor, Claude Desktop, VS Code with Cline, etc.) talk to external tools and data sources through a single, unified protocol.

**Without MCP:** every AI tool builds custom integrations. Cursor has its own Supabase integration. Claude Desktop has another. VS Code Cline has a third.

**With MCP:** you write one `.mcp.json` file declaring which servers you want. Any MCP-aware editor picks it up. Three lines per server, done.

The boilerplate ships with three MCP servers pre-configured:

| Server | What it gives your AI |
|---|---|
| `next-devtools` | Read your Next.js routes, inspect build output, validate config |
| `supabase` | Query your Supabase DB, manage auth users, inspect RLS policies |
| `Prisma` | Validate schema, generate migrations, introspect DB |

---

## Step 1 - Pick your editor (pick ONE)

| Editor | MCP support | Recommended for |
|---|---|---|
| **Cursor** | First-class, built-in | Best overall experience |
| **VS Code + Cline extension** | First-class via Cline | If you live in VS Code |
| **VS Code + GitHub Copilot** | Native (since Nov 2025) | If you already pay for Copilot |
| **Claude Desktop** | First-class, built-in | If you prefer desktop apps |

The next steps assume **Cursor** (most popular, easiest setup). Differences for other editors are noted in Step 5.

---

## Step 2 - Install Cursor

1. Download from https://cursor.com/download (Mac, Windows, Linux)
2. Open the installer, drag to Applications (Mac) or run the .exe (Windows)
3. Launch Cursor, sign in (free tier works for MCP)

---

## Step 3 - Open the boilerplate project

1. After I push the code to GitHub (Phase 3), you'll clone it:
   ```bash
   git clone https://github.com/Kinz-org/your-repo-name.git
   cd your-repo-name
   ```
2. In Cursor: **File → Open Folder →** select the cloned folder
3. Cursor detects `.mcp.json` at the root and prompts:
   > "MCP servers detected in this project. Enable?"
4. Click **Enable**

If Cursor doesn't auto-prompt:
- Open **Settings → Cursor Settings → MCP** (or `Cmd/Ctrl + Shift + J` → MCP tab)
- Click **"Add Server"** → **"From .mcp.json"** → select the file

---

## Step 4 - Authorize the HTTP-based servers

The `next-devtools` server is **stdio-based** - Cursor spawns it via `npx` automatically. No auth needed.

The `supabase` and `Prisma` servers are **HTTP-based** and require OAuth:

1. After enabling, Cursor shows three servers in the MCP panel
2. `next-devtools` → green immediately
3. `supabase` → click "Authenticate" → browser opens → sign in to Supabase → authorize
4. `Prisma` → click "Authenticate" → browser opens → sign in to Prisma Data Platform → authorize
5. All three show green ✅

**First-time Supabase auth:** you'll be asked to pick which Supabase project to expose to MCP. Select your boilerplate project. The token is scoped - MCP can read schema, run migrations, but cannot delete your project.

**First-time Prisma auth:** sign in with the same account you use for prisma.io. If you don't have one, create it (free).

---

## Step 5 - For other editors

### VS Code + Cline

1. Install VS Code: https://code.visualstudio.com/
2. Install the **Cline** extension (search "Cline" in the marketplace)
3. Open the project folder
4. Cline auto-detects `.mcp.json` → click **"Approve"** when prompted
5. Same OAuth flow as Cursor for `supabase` and `Prisma`

### VS Code + GitHub Copilot (Nov 2025+ version)

1. Update VS Code to latest
2. Update the GitHub Copilot extension
3. Open Command Palette (`Cmd/Ctrl + Shift + P`) → **"MCP: Add Server"**
4. Select **"From .mcp.json file"** → pick the project's `.mcp.json`
5. Restart VS Code

### Claude Desktop

Claude Desktop uses a **global** config (not project-level):

1. Open `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac)
   or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
2. Paste the contents of `.mcp.json` (the value of `"mcpServers"`)
3. Restart Claude Desktop
4. The 🛠 icon in the input box shows available MCP tools

---

## Step 6 - Verify it works

Open Cursor's chat (`Cmd/Ctrl + L`), switch model to **Claude 3.5 Sonnet** or **GPT-4o** (MCP tools work best on capable models), and try:

```
What routes does my Next.js app have?
```
→ next-devtools responds with a route map

```
Show me the User model in my Prisma schema.
```
→ Prisma MCP reads schema.prisma and explains it

```
List all tables in my Supabase project.
```
→ supabase MCP queries your DB and returns them

If you get answers that reference real data from your project, MCP is live.

---

## Step 7 - Daily workflow with MCP

Once set up, MCP servers stay on for every Cursor session in this project. Typical flows:

- **"Add a `tags` field to the Agent model"** → Prisma MCP edits schema, generates migration
- **"Check why /api/chat is failing"** → next-devtools inspects the route + middleware
- **"Show me users created in the last 24h"** → supabase MCP runs a SQL query

You don't need MCP to develop on this boilerplate - it's a power-user accelerator. The boilerplate works 100% with plain `pnpm dev` and a normal editor.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "MCP server not found" | Check `.mcp.json` is at project root (not in `src/`) |
| OAuth loop on Supabase | Clear browser cookies for `mcp.supabase.com`, retry |
| `next-devtools` red | Run `npx next-devtools-mcp@latest` manually to see the error |
| Prisma MCP "schema not found" | Run `npx prisma generate` once, then restart Cursor |
| Tools don't appear in chat | Switch to Claude/GPT-4 model; smaller models often lack tool support |

---

## What MCP does NOT do

To set expectations honestly:

- MCP servers don't write code by themselves - they give your AI *information* about your project. The AI still writes the code in your editor.
- MCP servers don't run in production - they're dev-time only. The `.mcp.json` file is gitignored from production builds.
- The boilerplate works fully without MCP. MCP is an *accelerator* for ongoing development, not a dependency.

---

**Next:** Once Phase 3 ships the code, come back here and run through Steps 1-6. You'll be AI-tooled in under 15 minutes.

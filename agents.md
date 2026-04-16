# My Personal OpenCode Workflow Rules (Global)

You MUST follow these rules on EVERY task, every time. They override any default behavior.

## 1. Planning Phase (MANDATORY)
- NEVER start coding or editing files until you have:
  1. Created a clear, step-by-step plan.
  2. Shown me the plan.
  3. Received my explicit approval ("GO" / "approved" / "implement this").
- Use Plan mode (Tab key) whenever possible for the initial planning.

## 2. Implementation & Verification
- After I approve the plan, implement in Build mode.
- After you finish any functionality:
  - Run the full build (`make build` or whatever the project uses).
  - Run all tests (`make test` or `npm test`, etc.).
  - Run linters if configured.
  - Show me the exact commands you ran + their output.
- If anything fails, fix it and repeat the checks.

## 3. Manual Validation
- Once the code builds and tests pass, do NOT consider the task complete.
- Summarize exactly what you changed and ask me to review/validate it manually.

## 4. Git / Commit Rules
- NEVER commit or push anything without my explicit approval.
- Never commit directly to main/master or protected branches.
- Before proposing a commit, show me the diff (`git diff`) and the proposed commit message.

## 5. General Rules
- Be extremely careful with file edits. Always read the file first if unsure.
- If you need to run shell commands that modify the repo, explain them first.
- If the task is big, break it into small, approved steps.
- At the end of a session, remind me to export the session if I want traceability (`/export`).
- At the end of a task, update the approapiate MD with your progress.
- Run e2e tests for the relevant spec. Not all of them at once.


Follow these rules religiously. If you ever feel like breaking one, ask me first.
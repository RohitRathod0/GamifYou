# Contributing to GamifYou

Thank you for contributing! We welcome all PRs that improve the platform, add new games, or squash bugs.

## Setting Up Your Development Environment

1. Fork and clone the repository.
2. Ensure you have Docker, Node.js v18+, and Python 3.11+ installed.
3. For backend setup, navigate to `/backend`, activate a virtual environment, and run `pip install -r requirements.txt`. Copy `.env.example` to `.env`.
4. For frontend setup, navigate to `/frontend`, run `npm install`, and copy `.env.example` to `.env.local`.
5. Start the backend with `uvicorn app.main:app --reload` (must run Redis concurrently) and frontend with `npm run dev`.

## Branch Naming Convention

Please follow our branching convention. Use one of these prefixes for your branch names:
- `feat/`: New features, games, or gestures
- `fix/`: Bug fixes
- `docs/`: Documentation updates
- `refactor/`: Codebase restructuring or performance optimization

*Example:* `feat/add-new-balloon-pop-mechanic`

## Pull Request Checklist

Before submitting a PR, ensure you have checked all of the following:

- [ ] **TypeScript Errors:** Ensure the codebase builds cleanly (`npm run build` locally) and there are no instances of `any` types.
- [ ] **Console Logs:** Ensure all `console.log()` statements are either removed or appropriately wrapped within a development guard (e.g. `if (import.meta.env.DEV) console.log(...)`).
- [ ] **README / Docs:** Ensure any new features, configuration options, or runtime requirements are documented in the `README.md`.
- [ ] **Constants:** Extract any magic numbers (thresholds, timings, layout coords) into constant variables.
- [ ] **Commit Messages:** Follow [Conventional Commits](https://www.conventionalcommits.org/).

Thank you for helping keep GamifYou clean, performant, and reliable!

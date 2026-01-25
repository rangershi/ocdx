# AGENTS.md

## Build & Test Commands

## Code Style Guidelines

### Imports & Module System

- Use ES6 `import`/`export` syntax (module: "ESNext", type: "module")
- Group imports: external libraries first, then internal modules

### Formatting (Prettier)

- Single quotes (`singleQuote: true`)
- Line width: 100 characters
- Tab width: 2 spaces
- Trailing commas: ES5
- Semicolons: enabled

### TypeScript & Naming

- Strict mode: enabled
- Avoid deeply nested structures; exit early

### Linting Rules

- `@typescript-eslint/no-explicit-any`: warn
- `no-console`: error
- `prettier/prettier`: error

## Project Context

- Type: ES Module package for OpenCode plugin system
- Purpose: minimal plugin scaffolding + CI/release best practices

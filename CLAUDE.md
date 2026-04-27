# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the official Moodle Mobile App, an Ionic/Angular application for accessing Moodle learning management system. The app supports both iOS and Android platforms via Cordova.

- **Framework**: Angular 20+ with Ionic 8
- **Language**: TypeScript with strict null checks enabled
- **Node Version**: v22.17+ (< 23)
- **Platform Support**: iOS and Android via Cordova
- **Testing**: Jest
- **Build Tool**: Gulp + Angular CLI

## Essential Commands

### Development

```bash
# Start development server with SSL
npm start

# Run on Android device with livereload
npm run dev:android

# Run on iOS device
npm run dev:ios

# Serve for testing environment
npm run serve:test
```

### Building

```bash
# Development build
npm run build

# Production build
npm run build:prod

# Testing build
npm run build:test
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# CI tests (no watch, runs in band)
npm run test:ci
```

Test files use the pattern `**/?(*.)test.ts` and should be colocated with the code they test.

### Linting

```bash
# Run ESLint on all TypeScript and HTML files
npm run lint
```

### Language Pack Management

```bash
# Update language packs from Moodle
npm run lang:update-langpacks

# Detect language pack changes
npm run lang:detect-langpacks

# Create language index
npm run lang:create-langindex
```

## Architecture

### Directory Structure

- **`src/core/`** - Core framework code
  - `features/` - Core feature modules (login, courses, user, etc.)
  - `services/` - Core singleton services (DB, file system, network, etc.)
  - `singletons/` - Utility singletons (DOM helpers, text utils, etc.)
  - `components/` - Shared UI components
  - `directives/` - Angular directives
  - `pipes/` - Angular pipes
  - `guards/` - Route guards
  - `classes/` - Base classes and utilities
  - `initializers/` - App initialization logic

- **`src/addons/`** - Extended functionality modules
  - `mod/` - Activity modules (forum, quiz, assignment, etc.)
  - `block/` - Block plugins
  - `qtype/` - Question types
  - `qbehaviour/` - Question behaviors
  - `filter/` - Content filters
  - Feature-specific addons (calendar, messages, notifications, etc.)

- **`src/app/`** - Application entry point and routing

- **`cordova-plugin-moodleapp/`** - Custom Cordova plugin with native code

### Module System

The app uses a hierarchical module structure:

1. **CoreFeaturesModule** (`src/core/features/features.module.ts`) - Imports all core feature modules
2. **AddonsModule** (`src/addons/addons.module.ts`) - Imports all addon modules
3. Feature modules are lazy-loaded where appropriate via Angular routing

### TypeScript Path Aliases

Import aliases are configured in `tsconfig.json`:

```typescript
@addons/*       // src/addons/*
@classes/*      // src/core/classes/*
@components/*   // src/core/components/*
@directives/*   // src/core/directives/*
@features/*     // src/core/features/*
@guards/*       // src/core/guards/*
@pipes/*        // src/core/pipes/*
@services/*     // src/core/services/*
@singletons     // src/core/singletons/index
@singletons/*   // src/core/singletons/*
@/*             // src/*
```

### Key Services

Core services in `src/core/services/` provide essential functionality:

- **DB / SQLite** - Database abstraction layer
- **File / FileHelper** - File system operations
- **FilePool** - File download and caching management
- **Site / Sites** - Moodle site connection management
- **Network** - Network status monitoring
- **Navigator** - Navigation and routing
- **Lang** - Internationalization
- **Cron** - Background task scheduling
- **LocalNotifications** - Push notification handling

### Singletons

Utility functions are organized as singletons in `src/core/singletons/`. Import from `@singletons` for tree-shakeable access to utilities like:

- DOM manipulation
- Text/URL/time utilities
- Promise helpers
- Array/object helpers
- File utilities

### Configuration

- **`moodle.config.json`** - Main app configuration (can be overridden with environment-specific files like `moodle.config.dev.json` or `moodle.config.prod.json`)
- **`angular.json`** - Angular build configuration
- **`tsconfig.json`** - TypeScript compiler configuration
- **`jest.config.js`** - Jest test configuration
- **`gulpfile.js`** - Build tasks for language files, environment setup, icons

### Build Process

Before serving or building, Gulp tasks run automatically:

1. **lang** - Compiles language JSON files from feature directories
2. **env** - Generates environment configuration from `moodle.config.json`
3. **icons** - Builds icon JSON mapping
4. **behat** (if configured) - Generates Behat plugin for testing

These tasks are triggered via `ionic:serve:before` and `ionic:build:before` hooks.

### Cordova Integration

Native functionality is accessed through:

- Awesome Cordova Plugins (`@awesome-cordova-plugins/*`)
- Custom Moodle-maintained Cordova plugins (`@moodlehq/*`)
- Custom `cordova-plugin-moodleapp` for app-specific native code

### Important Notes

- The app uses strict TypeScript settings (strict null checks, strict property initialization)
- All dates/times should use `dayjs` library
- Database operations use SQLite (native on device, WebSQL/WASM in browser)
- File operations differ between browser and native - use File service abstraction
- Network requests should handle offline scenarios gracefully
- Content from Moodle servers needs proper sanitization and filtering

## Documentation

- User documentation: https://docs.moodle.org/en/Moodle_app
- Developer documentation: https://moodledev.io/general/app
- Development setup: https://moodledev.io/general/app/development/setup
- Bug tracker: https://moodle.atlassian.net/browse/MOBILE
- Release notes: https://moodledev.io/general/app_releases

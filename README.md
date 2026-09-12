# Zen Routine

A cross-platform time management app that helps you design weekly routines, track time, and predict goal completion.

**Web beta:** https://zenroutine-web.onrender.com

Reviewers should use the [prototype review guide](docs/reviews/PROTOTYPE_REVIEW_GUIDE.md) to separate product-direction feedback, interaction friction, and known beta limitations.

## Development Setup

### Prerequisites
- Node.js 22.13+
- npm
- Expo Go app on your mobile device (for testing)

### Installation
```bash
# Clone the repository
git clone https://github.com/RogueKostas/ZenRoutine.git
cd ZenRoutine

# Install dependencies
npm ci

# Start development server
npm start
```

### Testing on Device

1. Install Expo Go on your iOS or Android device for a quick local smoke test
2. Run `npm start`
3. Scan the QR code with your device

Expo development and preview builds are the intended production-grade beta path once EAS is configured. The public web beta is deployed separately as a Render Static Site; see [the cloud beta task contract](docs/CLOUD_BETA_TASK.md).

## Project Structure

- `src/core/` - Pure TypeScript business logic (no React dependencies)
  - `types/` - Data type definitions
  - `engine/` - Prediction, analytics, validation logic
  - `utils/` - Time and ID utilities
- `src/store/` - Zustand state management
- `src/components/` - Reusable UI components
- `src/screens/` - Full screen views
- `src/navigation/` - React Navigation setup
- `src/platform/` - Platform-specific adapters
- `src/theme/` - Colors, typography, spacing

## Architecture

The app follows a clean separation of concerns:

1. **Core Engine** - Pure TypeScript, testable in isolation
2. **State Management** - Zustand store with persistence
3. **Platform Adapters** - Device-specific configurations
4. **UI Components** - Stateless, props-driven components

## Tech Stack

- React Native + Expo
- TypeScript
- Zustand for state management
- React Native Gesture Handler
- React Navigation

## Project Status

The project is being brought out of hibernation. See [the revival plan](docs/REVIVAL_PLAN.md) for the current assessment, staged upgrade path, and next milestone. Codex contributors should also read [AGENTS.md](AGENTS.md); multi-step work can use the repository $revival-loop skill.

Product direction is settled: [docs/PRODUCT.md](docs/PRODUCT.md) records the director's decisions D1–D8 of 2026-09-11, which closed the five product questions the revival plan had been waiting on. Read it before proposing feature work — the revival plan's milestones follow it, not the other way round.

Verification gate, measured on commit `9cca4f2` on 2026-09-12 with Node v22.23.2 and Vitest 4.1.11:

```
npm ci             -> exit 0
npm run typecheck  -> exit 0
npm test           -> exit 0   7 files, 79 tests passed
npm run build:web  -> exit 0
```

Known limitations, so they are not rediscovered: four reviewed defects are still open on `main`
(issues #4, #5, #6, #9), the public web beta is **not** built from `main` (issue #11), and this
project has never had a physical-device smoke test (issue #15). The revival plan's assessment
section carries the detail.

## Building for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android

# Export the web build
npm run build:web
```

## License

MIT

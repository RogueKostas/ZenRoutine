# Zen Routine

A cross-platform time management app that helps you design weekly routines, track time, and predict goal completion.

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

The project is being brought out of hibernation. See [the revival plan](docs/REVIVAL_PLAN.md) for the current assessment, product questions, staged upgrade path, and next milestone. Codex contributors should also read [AGENTS.md](AGENTS.md); multi-step work can use the repository $revival-loop skill.

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

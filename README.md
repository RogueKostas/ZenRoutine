# Zen Routine

A cross-platform time management app that helps you design weekly routines, track time, and predict goal completion.

## Development Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Expo Go app on your mobile device (for testing)

### Installation
```bash
# Clone the repository
git clone https://github.com/RogueKostas/ZenRoutine.git
cd ZenRoutine

# Install dependencies
npm install

# Start development server
npx expo start
```

### Testing on Device

1. Install Expo Go on your iOS or Android device
2. Run `npx expo start`
3. Scan the QR code with your device

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
- React Native Gesture Handler + Reanimated
- React Navigation

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

# Build for web
npx expo export:web
```

## License

MIT

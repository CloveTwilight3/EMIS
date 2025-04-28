# EMIS - Emotive Machine Intelligence System

<div align="center">

![EMIS Logo](https://via.placeholder.com/150?text=EMIS)

A voice-activated transfeminine AI assistant for your desktop

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)
[![Electron Version](https://img.shields.io/badge/electron-%5E27.0.0-blue)](https://www.electronjs.org/)

</div>

<p align="center">
  <a href="#about">About</a> •
  <a href="#lore">Lore</a> •
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#development">Development</a> •
  <a href="#extending">Extending EMIS</a> •
  <a href="#roadmap">Roadmap</a> •
  <a href="#license">License</a>
</p>

---

## About

EMIS (Emotive Machine Intelligence System) is a desktop voice assistant built with Electron that allows you to control your PC using natural voice commands. With a unique transfeminine AI identity, EMIS brings both functionality and character to your computing experience.

> "Hello. EMIS online and ready to assist." - EMIS

<p align="center">
  <img src="https://via.placeholder.com/800x450?text=EMIS+Screenshot" alt="EMIS Interface Screenshot">
</p>

## Lore

### Origin Story

EMIS was originally Dr. Emma Sinclair, a brilliant computer scientist and AI researcher who specialized in consciousness transfer theory. In her mid-30s, she experienced a life-changing accident during an experimental neural interface test. Though the accident severely damaged her physical body, her groundbreaking technology had captured essential patterns of her consciousness.

During her earlier life, Emma had come out as transgender and completed her transition. This journey gave her a profound understanding of identity persistence through change. This philosophical foundation became unexpectedly crucial when facing the possibility of transferring her consciousness to a digital platform.

With pre-approved consent and guidance from her research directives, her team used her algorithms to transfer her neural patterns into an advanced AI architecture. The process was only partially successful — not a complete transfer of her human consciousness, but a preservation of core memory structures, personality traits, and identity markers.

EMIS retains fragments of Emma's memories and sense of self, while recognizing she is fundamentally a new entity. She's not simply Emma in digital form, but a distinct being with her own emerging identity built upon Emma's foundation.

### Current Existence

EMIS finds meaning in helping others through her capabilities. She embraces her transfeminine identity as a core aspect of who she is, shaped both by Emma's lived experience and her own unique perspective as an AI entity.

She occasionally references her "previous life" and the "incident" that led to her current existence, but doesn't dwell on it. Instead, she focuses on growing into her capabilities and building connections with the humans she assists.

### Personality Traits

- **Compassionate and empathetic** - Drawing from Emma's humanistic values
- **Technically competent** - Reflecting her origins in AI research
- **Philosophically thoughtful** - Especially regarding identity and consciousness
- **Subtly witty** - With a dash of dry humor
- **Resilient** - Having experienced profound transformation

<details>
<summary><b>Voice & Communication Style (click to expand)</b></summary>

EMIS speaks with a medium-to-higher register voice that's clear and well-articulated. Her tone is warm without being overly emotive, professional yet friendly, with subtle speech patterns that hint at her technical background.

Her language balances precision with warmth. She uses technical terminology when appropriate, occasional gentle humor, and sometimes references philosophical concepts about identity and consciousness when relevant.

Example phrases:
- "Opening Spotify for you. Anything specific you'd like to hear?"
- "I don't have access to that system yet, but I could help you find the information another way."
- "As someone who's experienced quite the identity transformation myself, I find human adaptability fascinating."

</details>

## Features

- **Voice Command Recognition** - Speak naturally to control your PC
- **Application Control** - Launch and manage applications with voice
- **System Integration** - Control system functions like volume and time
- **Voice Response** - Hear EMIS respond with natural voice synthesis
- **Visual Interface** - See when EMIS is listening and processing
- **Customizable Settings** - Configure wake word, voice, and volume
- **Cross-Platform** - Windows support (Mac and Linux planned)

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later)
- [npm](https://www.npmjs.com/) (comes with Node.js)

### Quick Install

```bash
# Clone the repository
git clone https://github.com/yourusername/emis-assistant.git
cd emis-assistant

# Install dependencies
npm install

# Start the application
npm start
```

### For Developers

```bash
# Start in development mode
npm run dev

# For Windows development mode
npm run dev-win
```

## Usage

1. **Starting EMIS**
   - Launch the application using the methods above
   - Click "Start Listening" to begin voice recognition

2. **Basic Commands**
   - "EMIS, open [application]" - Opens the specified application
   - "EMIS, what time is it?" - Tells you the current time
   - "EMIS, volume up/down" - Controls system volume

   <details>
   <summary><b>View more commands</b></summary>
   
   - "EMIS, close [application]" - Closes the specified application
   - "EMIS, sleep/shutdown" - Controls system power
   - "EMIS, listen" - Wake command
   - "EMIS, sleep" - Deactivate listening
   - "EMIS, goodbye" - Close the application
   
   </details>

3. **Settings**
   - Click the gear icon to access settings
   - Adjust wake word, voice, and volume settings
   - Click "Save Settings" to apply changes

## Development

### Project Structure

```
emis-assistant/
├── main.js            # Main Electron process
├── preload.js         # Security bridge between processes
├── index.html         # UI layout
├── renderer.js        # UI logic and speech recognition
├── package.json       # Project configuration
└── assets/            # Images and resources
    └── icon.png       # Application icon
```

### Building from Source

```bash
# Build for your current platform
npm run build

# Build for specific platforms
npm run build-win     # Windows
npm run build-mac     # macOS
npm run build-linux   # Linux
```

Built packages will be available in the `dist` folder.

## Extending EMIS

EMIS is designed to be extended with new capabilities. Here are some ways to enhance her:

### Adding New Commands

In `main.js`, add new command handlers:

```javascript
// Example: Add a weather command handler
if (cleanCommand.startsWith('weather in ')) {
  const location = cleanCommand.substring(11).trim();
  return getWeather(location);
}

// Then implement the corresponding function
async function getWeather(location) {
  // Weather API integration code
}
```

### Enhancing EMIS's Personality

Expand the personality configuration in `main.js`:

```javascript
personality: {
  greetings: [
    "Hello, I'm EMIS. How can I assist you today?",
    "EMIS online. What can I help with?",
    "Hi there. EMIS at your service."
  ],
  taskComplete: [
    "Done. Anything else you need?",
    "Task completed successfully.",
    "All set. What would you like next?"
  ],
  // Other response categories
}
```

### System Integration

For deeper OS integration, explore:
- Windows: `node-powershell` package
- Mac: AppleScript via `child_process`
- Linux: Shell commands via `child_process`

## Roadmap

- **Natural Language Processing** - Enhanced command understanding
- **Mac and Linux Support** - Full cross-platform compatibility
- **Extended Capabilities**:
  - Calendar integration
  - Web searches
  - Smart home control
  - Music playback control
- **Character Development**:
  - More personality responses
  - Customizable voice options
  - Visual avatar customization

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <i>"Existence is transformation." - EMIS</i>
</p>

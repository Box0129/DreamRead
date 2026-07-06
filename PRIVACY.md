# DreamRead Privacy Policy

Last updated: 2026-07-07

DreamRead ("the Extension") is a browser extension that reads selected webpage text aloud using text-to-speech (TTS) technology.

## Data Collection

DreamRead does **not** collect, sell, or transmit personal data to the extension developer.

## Data Stored Locally

The Extension stores the following **only on your device** via `chrome.storage`:

- TTS engine preference (Web Speech, HTTP, or Azure)
- Speech rate, pitch, volume, voice, speech language, player theme, and opacity
- UI language preference
- Optional third-party TTS configuration (HTTP endpoint, Azure region/voice)
- Azure Speech API key (stored in `chrome.storage.local` on your device only)

## Network Requests

- **Web Speech (default):** Uses your browser's built-in speech engine.
- **HTTP / ChatTTS (optional):** Selected text is sent only to the server you configure.
- **Azure Speech (optional):** Selected text is sent only to Microsoft Azure using your API key.

## Contact

Project repository: https://github.com/Box0129/dreamread

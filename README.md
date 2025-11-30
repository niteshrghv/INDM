<h1 align="center">INDM - Internet Download Manager</h1>

<p align="center">
  <img src="assets/icon.png" width="200" height="200" alt="INDM Logo">
</p>

**INDM** is a high-performance, open-source Internet Download Manager built with **Electron** and **TypeScript**. It leverages multi-threaded downloading technology to accelerate file transfers, ensuring you get your files faster and more reliably.

<p align="center">
  <a href="https://opensource.org/licenses/ISC"><img src="https://img.shields.io/badge/License-ISC-blue.svg" alt="License: ISC"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.9-blue.svg" alt="TypeScript"></a>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-39.0-green.svg" alt="Electron"></a>
  <a href="#"><img src="https://img.shields.io/badge/build-passing-brightgreen.svg" alt="Build Status"></a>
</p>

---

## 🚀 Key Features

- **⚡ Multi-Threaded Downloading**: Splits files into multiple chunks (default: 8 connections) and downloads them simultaneously to maximize bandwidth usage.
- **⏯️ Pause & Resume**: Stop downloads anytime and resume exactly where you left off, even after restarting the application.
- **🛡️ Robust Error Handling**: Automatic retry logic with exponential backoff for failed chunks ensures downloads complete even on unstable connections.
- **📊 Real-time Statistics**: View download speed, progress, and estimated time remaining in real-time.
- **🖥️ Cross-Platform**: Native experience on macOS, Windows, and Linux.
- **🎨 Modern UI**: A clean, dark-mode friendly interface designed for usability.



- **Core**: [Electron](https://www.electronjs.org/), [Node.js](https://nodejs.org/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Networking**: [Axios](https://axios-http.com/) (with custom agents for keep-alive and connection pooling)
- **State Management**: JSON-based local state persistence

## 🏁 Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **Package Manager**: npm or pnpm

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/niteshrghv/INDM-macos-silicon.git
   cd INDM-macos-silicon
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start Development Server**
   ```bash
   npm start
   ```

### Building for Production

To create a distributable binary for your OS:

```bash
npm run build
```

The output will be in the `dist/` directory.

## 🧩 Architecture

INDM uses a dedicated `Downloader` class (`src/downloader.ts`) that handles the heavy lifting:
1. **Head Request**: Fetches file size and support for ranges.
2. **Chunking**: Calculates byte ranges for parallel connections.
3. **Parallel Streams**: Opens multiple HTTP/HTTPS connections.
4. **File Assembly**: Writes chunks directly to specific positions in a `.part` file using file handles.
5. **State Persistence**: Periodically saves download state to allow resumption after crashes or closures.

## 🗺️ Roadmap

- [ ] Browser Extensions (Chrome/Firefox) integration
- [ ] Download categorization (Music, Video, Documents)
- [ ] Speed limiter / Bandwidth scheduler
- [ ] Proxy support
- [ ] Theme customization

## 🤝 Contributing

We love contributions! Here's how you can help:

1.  **Fork** the repo on GitHub.
2.  **Clone** the project to your own machine.
3.  **Commit** changes to your own branch.
4.  **Push** your work back up to your fork.
5.  Submit a **Pull Request** so that we can review your changes.



Made with ❤️ by Nitesh (https://github.com/niteshrghv)

# Release Notes

## v1.0.0 - Initial Release (INDM)

**INDM (Internet Download Manager)** is a high-performance, open-source download manager built for macOS (Apple Silicon optimized), Windows, and Linux. This initial release brings a robust multi-threaded downloading engine wrapped in a sleek, modern "True Black" interface.

### 🚀 New Features

*   **Multi-Threaded Downloading Engine**:
    *   Accelerates downloads by splitting files into multiple chunks (default: 8, up to 32 connections).
    *   Smart connection pooling and keep-alive agents for maximum throughput.
*   **Pause & Resume Capability**:
    *   Full support for pausing downloads and resuming them later, even after restarting the app.
    *   Persists download state to disk to prevent data loss.
*   **Modern "True Black" UI**:
    *   Designed specifically for OLED screens and dark mode lovers.
    *   Glassmorphism effects in headers and overlays.
    *   Clean, distraction-free layout with a responsive sidebar.
*   **Real-Time Analytics**:
    *   Live download speed graph using ECharts.
    *   Detailed progress information: Speed, ETA, File Size, and Percentage.
*   **Download Management**:
    *   Categorization (Compressed, Documents, Music, Video, Programs).
    *   Status filtering (Finished, Unfinished).
    *   One-click clear history.

### 🛠️ Technical Highlights

*   **Built with Electron & TypeScript**: Ensuring type safety and cross-platform compatibility.
*   **Native Apple Silicon Support**: Optimized for M1/M2/M3 chips.
*   **Local State Management**: No external database required; uses efficient JSON-based storage.
*   **Custom Icon**: Brand new premium dark-themed app icon.

### 🐛 Known Issues

*   Browser extension integration is currently in development.
*   Proxy settings are not yet exposed in the UI.

---

*Made with ❤️ by Nitesh*

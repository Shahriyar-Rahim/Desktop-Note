![Desktop Note icon](public/icon.png)

# Desktop-Note

[![Stars](https://img.shields.io/github/stars/Shahriyar-Rahim/Desktop-Note?style=flat-square)](https://github.com/Shahriyar-Rahim/Desktop-Note/stargazers)
[![Forks](https://img.shields.io/github/forks/Shahriyar-Rahim/Desktop-Note?style=flat-square)](https://github.com/Shahriyar-Rahim/Desktop-Note/network/members)
[![Issues](https://img.shields.io/github/issues/Shahriyar-Rahim/Desktop-Note?style=flat-square)](https://github.com/Shahriyar-Rahim/Desktop-Note/issues)
[![License](https://img.shields.io/github/license/Shahriyar-Rahim/Desktop-Note?style=flat-square)](https://github.com/Shahriyar-Rahim/Desktop-Note/blob/main/LICENSE)
[![Top language](https://img.shields.io/github/languages/top/Shahriyar-Rahim/Desktop-Note?style=flat-square)](https://github.com/Shahriyar-Rahim/Desktop-Note)
[![Last commit](https://img.shields.io/github/last-commit/Shahriyar-Rahim/Desktop-Note?style=flat-square)](https://github.com/Shahriyar-Rahim/Desktop-Note/)

A simple desktop note application — quick notes on your desktop.

## Key features

- Clean, distraction-free note editor for quick capture
- Local persistence (SQLite / localStorage depending on build)
- Fast startup and small footprint
- Production-ready build output included in `build/`
- App icons included in both `build/` and `public/` for packaging

## Technology stack

- JavaScript (primary)
- Electron (desktop shell) / Web renderer (React/Vite or equivalent)
- Tailwind CSS (or project-specific styling)
- SQLite for local storage (if used by this build)

> Note: The repository's language composition is predominantly JavaScript.

## Repository layout

- `public/` — static assets and development-time icons
- `build/` — production build output (optimized bundle and production icons)
- `src/` — application source code (UI, renderer code)
- `electron/` or `main/` — (if present) main process, packaging scripts, native integrations
- `package.json` — scripts, dependencies, and build commands

Icons are present in both `public/` (source/static) and `build/` (production-optimized) — use the `build/` icons when packaging distributables.

## Requirements

- Node.js 16+ (or the version specified in `package.json`)
- npm or yarn
- macOS, Windows, or Linux for development; package on the target platform for native installers

## Development

1. Clone the repository:

   git clone https://github.com/Shahriyar-Rahim/Desktop-Note.git
   cd Desktop-Note

2. Install dependencies:

   npm install
   # or
   yarn install

3. Start the development server with hot reload (if the project uses Vite/React):

   npm run dev
   # or
   yarn dev

Open the URL reported by the dev server (commonly http://localhost:3000) and/or let your Electron wrapper open the application window.

## Production build

To build an optimized production bundle:

   npm run build
   # or
   yarn build

The build artifacts are written to the `build/` directory. Use the files in `build/` when packaging with Electron, Tauri, or another desktop packager.

## Packaging

When creating installers or distributables:
- Point your packager to the `build/` directory as the app's web content.
- Use the provided icons in `build/` (or `public/` if you prefer source originals) for each platform's required sizes.
- Build platform-specific installers on their respective platforms for best results.

## Configuration & Data

- User data is stored in the platform's application data directory (Electron: `app.getPath('userData')`) or in the file paths defined by the app's configuration.
- Backups, attachments, and database files (if present) are typically located under the user data directory.

## Troubleshooting

- If the app fails to start, confirm Node.js and dependency versions and run `npm install` again.
- For runtime or packaging issues, consult `package.json` scripts, build logs, and the packager's documentation.

## Contributing

Contributions are welcome. To contribute:

1. Open an issue describing the bug or feature request.
2. Create a branch for your work: `git checkout -b feat/your-feature`.
3. Open a pull request with a clear description and any relevant screenshots or reproduction steps.

Be sure to follow any existing code style and include tests where applicable.

## License

This project is licensed under the MIT License — see the `LICENSE` file for details.

## Maintainer

Shahriyar-Rahim

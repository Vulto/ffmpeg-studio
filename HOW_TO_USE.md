# FFmpeg Studio — How to Use

FFmpeg Studio is a local web app for importing images and videos onto a canvas, running ffmpeg commands in a terminal, and previewing outputs.

## Prerequisites

Install these on the machine that runs the server:

| Tool | Required | Check |
|------|----------|-------|
| [Bun](https://bun.sh) | Yes | `bun --version` |
| ffmpeg | Yes | `ffmpeg -version` |
| realesrgan-ncnn-vulkan | No (AI Upscale preset) | `realesrgan-ncnn-vulkan -h` |

Project directory:

```bash
cd "/home/vulto/C/meus/grok Imagine/ffmpeg-studio"
```

## First-time setup

```bash
bun install
```

## Launch (recommended)

Start the API server and web client together:

```bash
bun run dev
```

- **API** runs on port `4317`
- **Web client** runs on port `5173` and is exposed on your local network
- Stop everything with `Ctrl+C`

After launch, Vite prints two URLs in the terminal:

```
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.x.x:5173/
```

### Where to open the app

| Device | URL |
|--------|-----|
| This computer | `http://localhost:5173` |
| Phone, tablet, or another PC on the same Wi‑Fi | `http://<your-lan-ip>:5173` |

### Find your LAN IP (Linux)

```bash
ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '^127\.'
```

Use the address that matches your Wi‑Fi or Ethernet interface (often `192.168.x.x`).

## Alternative: run server and client separately

Useful for debugging:

```bash
# Terminal 1 — API
bun run dev:server

# Terminal 2 — web client (LAN-enabled)
bun run dev:web
```

## Verify it is ready

1. Open `http://localhost:5173` — you should see the canvas and terminal panel.
2. In the terminal, look for green status lines:
   - `● ffmpeg version …`
   - `● Real-ESRGAN ready` (if installed)
3. From another device on the same network, open `http://<your-lan-ip>:5173`.

If the terminal shows `API server offline`, the backend is not running — start it with `bun run dev` or `bun run dev:server`.

## Quick usage

1. **Import media** — click Import in the sidebar or drag images/videos onto the canvas.
2. **Reference files** — in Select mode, click a node to insert `{{0}}`, `{{1}}`, etc. into the terminal command.
3. **Run ffmpeg** — type a command (e.g. `ffprobe -hide_banner {{0}}`) and press Play.
4. **Presets** — use the bottom toolbar:
   - **Upscale** — AI upscale a selected image (Real-ESRGAN)
   - **Make video** — slideshow from 2+ selected images
   - **Extract frames** — extract frames from a selected video
5. **Outputs** — successful jobs add new nodes to the canvas automatically.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `API server offline` in terminal | Run `bun run dev` or `bun run dev:server` |
| Port 4317 already in use | `fuser -k 4317/tcp` then restart, or `PORT=4318 bun run dev:server` |
| Another device cannot connect | Same Wi‑Fi network; allow port `5173` in firewall |
| Blank or flickering canvas | Hard-refresh the page (`Ctrl+Shift+R`) |
| Upscale preset fails | Install `realesrgan-ncnn-vulkan` and confirm it is on PATH |

### Firewall (Linux)

If other devices cannot reach the app, allow port 5173:

```bash
sudo ufw allow 5173/tcp
```

## Production build (optional)

Build static files and preview with LAN access:

```bash
bun run build
bun run preview -- --host
```

The preview serves the UI only. You still need the API running separately:

```bash
bun run dev:server
```

## Architecture

```
Browser  →  Vite :5173  →  /api proxy  →  Bun API :4317  →  ffmpeg / Real-ESRGAN
```

LAN clients only need access to port **5173** on the host machine. API requests are proxied server-side to port 4317.

## GitHub Pages (demo UI)

The static UI is published at:

**https://vulto.github.io/ffmpeg-studio/**

GitHub Pages serves the built frontend only. The ffmpeg API, terminal jobs, and presets require running the local server (`bun run dev`) on your machine.
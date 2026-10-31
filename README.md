# Blue Knight Panel - Meera Solution

Meera Solution edition of Blue Knight Panel. Deploy your own app with its own public domain.

## MS HOST / Meera Solution

Supports **Node.js**, **Docker**, and Meera's **Next.js standalone deployment template**. The server and proxy transports remain Node.js; a build adapter packages the same panel for the Next.js template without replacing its routing with a framework server.

### Next.js deployment mode

If Node.js deployment is unavailable, select **Next.js** and use:

| Setting | Value |
| --- | --- |
| Repository | `BlueKnightNet/Blue-Knight-Panel-meerasolution` |
| Branch | `blue-knight-net` |
| Root directory | `/` |
| Package manager | npm |
| Build command | `npm run build` |
| Port | `3000`, or the internal port assigned by the host through `PORT` |
| Production start command | `npm run start:prod` (runs `node server.js`) |
| Persistent storage, if available | `/data` |

The build creates `.next/standalone/server.js`, the panel, production dependencies, `.next/static`, and `public`. This supports templates that copy those directories into a non-root runtime image. It does not run the panel at build time, download engine binaries during build, or include local passwords and data in the output. Engine downloads still happen at runtime. This is deployment-template compatibility, not a conversion to a React/Next.js application.

Leave generated runtime/start settings at their defaults when the host runs `npm run start:prod` or `node server.js`. If the template runs `npm start`, that command continues to start the panel as well. The standalone launcher defaults to internal port 3000 and respects `PORT` / `SERVER_PORT`; external subscription links use HTTPS 443 for each app's Meera domain.

### Docker deployment mode

Use the repository's Dockerfile:

| Setting | Value |
| --- | --- |
| Repository | `BlueKnightNet/Blue-Knight-Panel-meerasolution` |
| Branch | `blue-knight-net` |
| Framework | **Docker** |
| Root / build context | `/` |
| Dockerfile | `Dockerfile` at the repository root |
| Container port | `3000` |
| Build command override | Leave empty |
| Start command override | Leave empty; the image runs `node index.js` |
| Persistent volume, if available | `/data`, writable by UID/GID `1000` |

See the official [Next.js deployment guide](https://host.meerasolution.com/blogs/how-to-deploy-nextjs) and [Docker deployment guide](https://host.meerasolution.com/blogs/how-to-deploy-docker) for the host dashboard controls.

The image installs production npm dependencies and archive tools, then runs as the unprivileged `node` user. It defaults to internal port `3000` and public HTTPS/TLS links on `443`. If the platform assigns another `PORT`, match its internal routing to that value. Engine binaries are downloaded on first startup; allow time for initialization.

Open `https://YOUR-APP-DOMAIN/knight` to create the password, then refresh the subscription. The panel learns the public hostname from the request. It does not contain a fixed Meera application domain. Keep `/data` persistent to preserve the UUID, password, subscription token, certificates, and engine files.

### Node.js deployment mode

Where available, select **Node.js**, start with `npm start`, and match the platform's internal port to the app's `PORT` value. This path keeps the original startup behavior and does not require a build. Running `npm run build` is also supported if the host requires a build step.

Generated `*.deploy.meerasolution.com` and `*.ms-host.com` app domains are recognized automatically: client configs use public HTTPS/TLS on **443**, independently of the internal port, and omit the panel's internal certificate pin. Refresh the subscription after deploying this version. For a custom domain, set `LINK_TLS=true` and `LINK_PORT=443` explicitly. Remove or correct stale overrides such as `LINK_PORT=8080`, which take priority over automatic detection.

## Container checks

The [container workflow](.github/workflows/container-check.yml) builds both the Node.js Dockerfile and a representative Node 20 Alpine/non-root Next.js standalone template on Linux, waits for the login page, and checks sing-box/Xray listeners. It also validates the standalone package and launcher. Building an image successfully is separate from confirming the hosting provider supports the proxy transports.

## Experimental IP Scanner tab

After deploying, open **Scanner** in the panel. It uses the public domain learned by this deployment; there is no fixed app hostname in the scanner.

1. Leave DNS discovery checked to collect public A/AAAA answers from system DNS, Cloudflare, and Google.
2. Optionally paste known public ingress IPs, one per line. The scan accepts at most 32 individual addresses, tests three concurrently, and uses port 443 only. Private addresses and CIDR ranges are not accepted.
3. Select **Start scan**. Each candidate must pass certificate validation with the app's TLS SNI, a WebSocket upgrade with the app's Host header, and an authenticated VLESS request to `example.com`.
4. Copy configs from verified results. The connection address becomes the IP while TLS SNI and WebSocket Host retain your app domain. Choose VLESS, VMess, or Trojan WS TLS in the result protocol selector; VLESS is the protocol tested end to end, while the other exports require their respective engine listeners.

This is a reachability test **from the hosting server**, not an ISP filtering test from your phone or computer. A host may expose only one working ingress IP, and an address that works on the server may fail from your network. The scanner does not invent extra addresses or bypass domain-based routing requirements. Results are temporary and do not replace the main subscription automatically.

The scanner requires panel login and VLESS WS/TLS enabled on public port 443. No additional service key is needed. Use **Cancel** to stop an active scan.

## Channels

- [YouTube · BlueKnight-Net](https://www.youtube.com/@BlueKnight-Net)
- [Telegram · BlueKnight_Net](https://t.me/BlueKnight_Net)

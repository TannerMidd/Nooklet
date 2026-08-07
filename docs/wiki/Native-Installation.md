# Native installation

Native installation is intended for development and advanced operators who prefer to manage the Node.js process and host filesystem directly. Docker remains the recommended production path because it supplies the exact runtime and media-processing tools together.

## Requirements

- Node.js `>=24.15.0`
- npm
- Git
- Build support for native Node dependencies if a matching binary is unavailable
- `par2`, `unrar`, and `7zz` on `PATH` for complete built-in download repair and extraction
- A process supervisor for an always-on production deployment

Nooklet can start without the three media-processing executables, but built-in downloads that require repair or archive extraction will not finalize correctly. The Docker image installs all three.

## 1. Clone and install dependencies

```bash
git clone https://github.com/TannerMidd/Nooklet.git
cd Nooklet
npm ci
```

Verify the runtime:

```bash
node --version
npm --version
```

## 2. Configure the environment

macOS or Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Generate independent values for `AUTH_SECRET`, `BOOTSTRAP_TOKEN`, and `SECRET_BOX_KEY`, then edit `.env`. `AUTH_SECRET` must be at least 32 characters; the other two accept 32-512 characters. Known placeholder values are rejected.

For a host-native installation, paths are resolved on the machine running Node.js. A minimal example is:

```dotenv
APP_URL=http://localhost:42021
DATABASE_URL=file:./data/nooklet.db
AUTH_SECRET=<independent-random-value>
BOOTSTRAP_TOKEN=<independent-random-value>
SECRET_BOX_KEY=<independent-random-value>
APPROVED_MEDIA_ROOTS=/srv/media
DOWNLOAD_ENGINE_WORK_DIR=/srv/nooklet/engine-work
DOWNLOAD_ENGINE_DIR=/srv/downloads/nooklet-engine
```

On Windows, use normal absolute host paths and separate multiple approved roots with semicolons:

```dotenv
APPROVED_MEDIA_ROOTS=D:\Media;E:\Archive
DOWNLOAD_ENGINE_WORK_DIR=F:\NookletData\EngineWork
DOWNLOAD_ENGINE_DIR=F:\Downloads\Nooklet
```

Do not approve an entire filesystem root. Each configured media folder must exist, resolve to a directory, and remain within one of the approved roots.

## 3. Start in development mode

```bash
npm run dev
```

The development command listens on port `42021`. Open [http://localhost:42021](http://localhost:42021). It supervises a hot-reloading Next.js child and a separately built worker child. Worker-source changes rebuild and restart only the worker runtime; storage capacity checks run in disposable probe processes.

## 4. Start a production build

```bash
npm run build
npm start -- -p 42021
```

The explicit port keeps the listener aligned with the default `APP_URL`. If you choose another port, update `APP_URL` to the origin users actually open.

`npm start` applies Drizzle migrations, then supervises separate web and worker processes plus disposable storage probes. Do not start a second worker beside this combined command.

Service managers that require one process per unit may instead run the supported split pair after `npm run build`:

```bash
npm run start:web -- -p 42021
npm run start:worker
```

Both units are required. `start:web` never executes background or media-filesystem work. `start:worker` supervises the durable job worker and the short-lived storage probes that populate cached capacity snapshots. Configure the service manager to restart both units after an upgrade or environment change.

For a durable installation, supervise `npm start -- -p 42021` with the service manager appropriate to the host and restart it after environment changes. Configure the service account with read/write access to the database directory, download workspace, and final library destinations.

## 5. Verify the process

```bash
curl http://localhost:42021/api/health
```

On Windows PowerShell:

```powershell
Invoke-RestMethod http://localhost:42021/api/health
```

Open the application, create the first administrator, then follow [First-time setup](First-Time-Setup). Remove `BOOTSTRAP_TOKEN` from `.env` and restart the supervised process after bootstrap completes.

## Native filesystem notes

- Relative paths are resolved from the process working directory. Absolute paths are safer for supervised deployments.
- `DATABASE_URL=file:./data/nooklet.db` creates the database beneath the repository working directory.
- `DOWNLOAD_ENGINE_WORK_DIR` holds incomplete, assembled, repaired, and extracted data; `DOWNLOAD_ENGINE_DIR` holds completed output awaiting import. Both filesystems are checked for built-in download capacity, and the tighter one limits admission.
- `APPROVED_MEDIA_ROOTS` fails closed when empty; engine completion paths are constrained by `DOWNLOAD_ENGINE_DIR` and the persisted engine item.
- Windows UNC, device, and raw filesystem paths are rejected as media roots. Mount network storage through the operating system or container host and expose a normal local path instead.
- Symlinks do not bypass the canonical approved-root checks.

## Updating a native installation

Create an off-host database backup first, then:

```bash
git pull --ff-only
npm ci
npm run build
```

Restart the supervised application process and recheck `/api/health`. Migrations are applied automatically when the new build starts.

## Development quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Generate a migration with `npm run db:generate` only after an intentional schema change.

## Implementation references

- [Node.js engine and scripts](https://github.com/TannerMidd/Nooklet/blob/main/package.json)
- [Environment validation](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/env.ts)
- [Database startup and migrations](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/database/client.ts)
- [Filesystem boundary enforcement](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/security/filesystem-policy.ts)
- [Web-only runtime instrumentation](https://github.com/TannerMidd/Nooklet/blob/main/src/instrumentation.ts)
- [Native worker supervisor](https://github.com/TannerMidd/Nooklet/blob/main/scripts/worker-supervisor.mjs)
- [Disposable storage-probe coordinator](https://github.com/TannerMidd/Nooklet/blob/main/scripts/lib/storage-probe-coordinator.mjs)

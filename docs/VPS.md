# Amigo-No-Visible en el VPS

| | |
|---|---|
| Compose | `/root/stack/amigo-invisible/docker-compose.yml` (copia de `deploy/docker-compose.yml`) |
| Container / imagen | `amigo-invisible` / `amigo-invisible:vps`. Bot de Slack (Socket Mode), sin dominio. |
| Secretos | `/root/stack/env/amigo-invisible.env` |
| Datos | SQLite en el volumen `amigo-invisible-data` |

Deploy: `./deploy/deploy.sh` (rsync del código, build en el server y `compose up -d`).

---

# VPS: cómo está armado y cómo deployar

> Fuente de verdad: `/root/stack/LEEME.md` en el server. Las copias en los repos
> (`docs/VPS.md`) pueden quedar viejas; ante la duda, leé la del server.
> Última actualización: 2026-11-20 (se sacó Coolify).

## El server

| | |
|---|---|
| Proveedor | Hetzner Cloud (Falkenstein, DE). Precio fijo mensual. |
| Acceso | `ssh root@2.31.72.16` (por clave, sin contraseña) |
| Hardware | **ARM64 (aarch64)**, 2 vCPU, 4 GB RAM, sin swap, 38 GB disco |
| SO | Ubuntu 26.04 LTS. El hostname es `coolify` por historia; no significa nada. |
| Dominios | `*.fcharbonnier.duckdns.org`: DuckDNS resuelve **cualquier** subdominio a esta IP, no hay que dar de alta DNS. |
| Panel | https://panel.fcharbonnier.duckdns.org (estado y control desde el celular) |

**No hay PaaS.** Coolify se desinstaló el 2026-11-20. Todo es `docker compose`
a mano + Traefik + timers de systemd. No reinstales Coolify ni otro panel: la RAM
es escasa y nada lo necesita.

## Layout

```
/root/stack/
  LEEME.md              ← esta guía
  proxy/                ← Traefik (80/443, certificados) + páginas de error
    docker-compose.yml
    traefik/acme.json   ← certificados Let's Encrypt. NO borrar ni editar.
    traefik/dynamic/    ← config por archivo (se recarga sola): panel, catch-all 503, middlewares
  base/                 ← braindown-db (Postgres 17 + pgvector)
  env/                  ← TODOS los secretos: <servicio>.env, modo 600. Nunca en git.
  <app>/docker-compose.yml   ← una carpeta por app
  panel/                ← panel de control (servicio systemd, no container)
/etc/systemd/system/<app>-<tarea>.{service,timer}   ← crons
/usr/local/bin/respaldo-db.sh, /root/respaldos/     ← backups de braindown_db
```

Apps actuales: `braindown` (MCP + timers de sync), `oym` (oym-semanal-web + cron
semanal), `telegram` (claude-telegram), `amigo-invisible` (bot de Slack),
`gym` y `truco` (sitios estáticos con nginx).

## Red y proxy

- Todos los containers que se publican están en la red Docker **`coolify`** (nombre
  heredado). **No la renombres ni la borres**: la usan todas las apps, los timers
  (`--network coolify`) y el panel, que escucha en su gateway `10.0.1.1:8099`.
- Traefik enruta por **labels de Docker** (`exposedbydefault=false`, así que hace
  falta `traefik.enable: "true"`) y saca el certificado solo en el primer request.
- **No publiques puertos** (`ports:`) en las apps. Solo Traefik expone 80/443; el
  único otro puerto abierto es el 22.
- Middleware compartido: `redirect-https@file` (definido en
  `proxy/traefik/dynamic/middlewares.yaml`). Desde labels se usa **con** `@file`.
- Algo que no es container (como el panel) se publica con un archivo en
  `proxy/traefik/dynamic/` (ver `panel.yaml`).

## Deployar una app nueva

1. **Imagen.** El server es ARM64. Se construye **en el server** (`docker build`)
   con el código subido por `rsync`, o en la Mac con `--platform linux/arm64`.
   Tag `<app>:vps`. Ejemplo completo: `Amigo-No-Visible/deploy/deploy.sh`:
   ```bash
   rsync -a --delete ./ root@2.31.72.16:/root/stack/<app>/src/   # (excluí .git, node_modules, .env)
   ssh root@2.31.72.16 'cd /root/stack/<app> && docker build -t <app>:vps src && docker compose up -d'
   ```
   Un sitio estático se compila en la Mac y se sube ya armado a
   `/root/stack/<app>/sitio`, servido con `nginx:alpine` (ver `gym/` y `truco/`).
2. **Secretos** en `/root/stack/env/<app>.env` (`chmod 600`), referenciados con `env_file:`.
3. **Compose** en `/root/stack/<app>/docker-compose.yml`:
   ```yaml
   services:
     <app>:
       image: <app>:vps
       container_name: <app>
       restart: unless-stopped
       env_file: /root/stack/env/<app>.env
       networks: [coolify]
       labels:
         traefik.enable: "true"
         traefik.docker.network: coolify
         traefik.http.routers.<app>.rule: Host(`<app>.fcharbonnier.duckdns.org`)
         traefik.http.routers.<app>.entrypoints: https
         traefik.http.routers.<app>.tls: "true"
         traefik.http.routers.<app>.tls.certresolver: letsencrypt
         traefik.http.services.<app>.loadbalancer.server.port: "8000"   # puerto interno de la app
         traefik.http.routers.<app>-http.rule: Host(`<app>.fcharbonnier.duckdns.org`)
         traefik.http.routers.<app>-http.entrypoints: http
         traefik.http.routers.<app>-http.middlewares: redirect-https@file
   networks:
     coolify:
       external: true
   ```
   Un bot sin web (Slack, Telegram): igual pero sin `labels`.
4. `cd /root/stack/<app> && docker compose up -d`, y verificá con
   `curl -I https://<app>.fcharbonnier.duckdns.org` y `docker logs <app>`.
5. **Panel:** aparece solo. Opcional: nombre lindo en
   `/root/stack/panel/config.json` → `"proyectos": {"<app>": {"nombre": "...", "orden": 70}}`.

### Base de datos

- App chica: **SQLite** en un volumen con nombre (como `amigo-invisible`).
- Postgres propio: un servicio más en el mismo compose, en una red interna, con
  volumen con nombre. Ojo con la RAM (cada Postgres usa entre 30 y 200 MB).
- `braindown-db` (host `braindown-db:5432`, db `braindown_db`) es de braindown y
  oym. El alias viejo `bny98m6fbxpfhh2zdyvma3ce` sigue funcionando.

### Tareas programadas (cron)

Timers de systemd en `/etc/systemd/system/`. **El panel los descubre por estar ahí**
y los agrupa por prefijo del nombre (`<app>-...`). Patrón:

```ini
# /etc/systemd/system/<app>-<tarea>.service
[Unit]
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
ExecStart=/usr/bin/docker run --rm --name <app>-<tarea>-run --network coolify \
  --env-file /root/stack/env/<app>-<tarea>.env <app>:vps python -m app.tarea

# /etc/systemd/system/<app>-<tarea>.timer
[Timer]
OnCalendar=Mon *-*-* 11:00:00      # UTC
Persistent=true
[Install]
WantedBy=timers.target
```
`systemctl daemon-reload && systemctl enable --now <app>-<tarea>.timer`

## Dar de baja una app

```bash
systemctl disable --now <app>-*.timer; rm /etc/systemd/system/<app>-*; systemctl daemon-reload
cd /root/stack/<app> && docker compose down -v --rmi all   # -v borra los datos
rm -rf /root/stack/<app> /root/stack/env/<app>*.env
# y sacar su entrada de /root/stack/panel/config.json
```

## Backups

`respaldo-db.timer` (03:30 UTC) hace dump de `braindown_db`, **verifica que
restaura**, guarda 7 copias en `/root/respaldos` y sube a Backblaze B2 (30 días).
Las demás apps **no tienen backup**.

## Recursos y límites

- RAM: ~2,6 GB disponibles con todo corriendo (medido 2026-11-20). Sin swap: si
  se llena, el kernel mata procesos. Antes de sumar algo pesado, `free -h`.
- Las sesiones de Claude Code que corren en el server (claude-telegram, oym,
  Orca) usan esa misma RAM.
- Logs de Docker rotados (3 × 10 MB por container, `/etc/docker/daemon.json`).
- Limpieza: `docker image prune -af` (las imágenes viejas se acumulan con cada build).

## No hacer

- Renombrar o borrar la red `coolify`, o tocar `proxy/traefik/acme.json`.
- Publicar puertos de apps o bindear algo a `0.0.0.0` fuera de Traefik.
- Commitear `.env` o copiar secretos a los repos.
- Parar `traefik` sin un motivo: se caen todos los dominios y el panel.

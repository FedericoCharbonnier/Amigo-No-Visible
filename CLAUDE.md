# Amigo-No-Visible

## Deploy (VPS)

Esta app corre en el VPS de Hetzner (`ssh root@2.31.72.16`, ARM64) con `docker compose`
+ Traefik, sin PaaS (Coolify se sacó el 2026-11-20). **Antes de deployar o tocar
infraestructura, leé `docs/VPS.md`**: tiene cómo está armado el server, cómo deployar
esta app y cualquier otra, y qué no hacer. La versión maestra está en el server en
`/root/stack/LEEME.md`.

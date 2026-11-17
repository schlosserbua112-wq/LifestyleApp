# Bummel

Persönliche Web-App fürs iPhone: To-Dos, Projektideen und Ausgaben mit Belegscanner.
Läuft komplett offline, alle Daten liegen auf dem iPhone (IndexedDB).

## Aufbau

- `public/` – die App (HTML, CSS, JavaScript ohne Build-Schritt)
  - `sw.js` – Service Worker: speichert die App offline, holt Updates, wenn online
  - `js/ocr.js` – Texterkennung auf dem Gerät (Tesseract, deutsches Sprachpaket in `vendor/`)
  - `js/parse.js` – liest Händler, Datum, Betrag und Kategorie aus dem Bon-Text
- `server/` – kleiner Node-Server ohne Abhängigkeiten
  - liefert `public/` aus
  - `/api/backup` – Backups (Bearer `BACKUP_TOKEN`)
  - `/api/sync` – Abgleich von To-Dos und Ideen mit dem iPhone (Bearer `BACKUP_TOKEN`)
  - `/mcp/<MCP_TOKEN>` – Claude-Connector (MCP): Ideen suchen, lesen, anlegen, aktualisieren; Aufgaben auflisten, anlegen, abhaken
- `Dockerfile` – für Coolify

## Lokal starten

```bash
BACKUP_TOKEN=geheim DATA_DIR=./data node server/server.js
# http://localhost:3000
```

## Neue Version ausrollen

`VERSION` in `public/sw.js` hochzählen, sonst bekommen installierte Apps das Update nicht.

## Server-Einstellungen

| Variable | Bedeutung | Standard |
|---|---|---|
| `BACKUP_TOKEN` | Schlüssel für Backup und Abgleich (ohne: beides aus) | – |
| `MCP_TOKEN` | Geheimnis für den Claude-Connector (ohne: Connector aus) | – |
| `DATA_DIR` | Ordner für Backups (als Volume einhängen) | `/data` |
| `BACKUP_KEEP` | Wie viele Backups aufbewahrt werden | `30` |
| `PORT` | Port im Container | `3000` |

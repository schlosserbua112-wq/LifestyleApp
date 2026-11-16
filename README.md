# Lifestyle

Persönliche Web-App fürs iPhone: To-Dos, Projektideen und Ausgaben mit Belegscanner.
Läuft komplett offline, alle Daten liegen auf dem iPhone (IndexedDB).

## Aufbau

- `public/` – die App (HTML, CSS, JavaScript ohne Build-Schritt)
  - `sw.js` – Service Worker: speichert die App offline, holt Updates, wenn online
  - `js/ocr.js` – Texterkennung auf dem Gerät (Tesseract, deutsches Sprachpaket in `vendor/`)
  - `js/parse.js` – liest Händler, Datum, Betrag und Kategorie aus dem Bon-Text
- `server/` – kleiner Node-Server ohne Abhängigkeiten: liefert `public/` aus, `/api/backup` für Backups
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
| `BACKUP_TOKEN` | Geheimer Schlüssel für Backups (ohne: Backup aus) | – |
| `DATA_DIR` | Ordner für Backups (als Volume einhängen) | `/data` |
| `BACKUP_KEEP` | Wie viele Backups aufbewahrt werden | `30` |
| `PORT` | Port im Container | `3000` |

# Lifestyle auf dem VPS (Coolify) und dem iPhone

## 1. DNS bei netcup
Im netcup CCP unter Domains → seashard.de → DNS einen neuen Eintrag anlegen:

| Host | Typ | Ziel |
|---|---|---|
| `lifestyle` | `A` | IP deines VPS (dieselbe wie bei seashard.de) |

Speichern. Das dauert meist ein paar Minuten bis zu einer Stunde.

## 2. Coolify
1. **Projects → + New** → Name `Lifestyle` (eigenes Projekt, getrennt von Seashard).
2. **+ New Resource → Private Repository (with GitHub App)** → Repo `LifestyleApp` wählen, Branch `main` (zum Testen vor dem Merge: `feature/app-mvp`).
3. **Build Pack:** `Dockerfile`. **Ports Exposes:** `3000`.
4. **Domains:** `https://lifestyle.seashard.de` (Coolify holt das Let's-Encrypt-Zertifikat selbst).
5. **Environment Variables:** `BACKUP_TOKEN` = ein langes zufälliges Passwort (z. B. aus deinem Passwort-Manager). Merken, das brauchst du gleich in der App.
6. **Persistent Storage:** + Add → Volume, Destination Path `/data`.
7. **Deploy**. Unter "Logs" sollte `Lifestyle läuft auf Port 3000` stehen.

Optional: "Auto Deploy" anlassen, dann wird jede Änderung auf `main` automatisch ausgerollt.

## 3. iPhone
1. In **Safari** `https://lifestyle.seashard.de` öffnen (muss Safari sein).
2. **Teilen** (Quadrat mit Pfeil) → **Zum Home-Bildschirm** → Hinzufügen.
3. App vom Home-Bildschirm starten, einmal kurz warten (lädt die Texterkennung, ca. 10 MB).
4. Tab **Mehr** → Backup-Schlüssel = dein `BACKUP_TOKEN` eintragen → **Jetzt sichern**.

Ab jetzt läuft alles offline. Ist das iPhone online, holt sich die App Updates und sichert automatisch.

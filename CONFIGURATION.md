<<<<<<< codex/configure-supabase-settings
# Konfiguration (Cloud + Test + Lokal)

## Ziel
- In **Prod** mit echten Daten arbeiten.
- In **Test** mit eigenen Test-Daten arbeiten (getrennte Supabase-Instanz möglich).

## 1) Cloud-Konfiguration (empfohlen)
Lege `config.json` neben `index.html` ab:

```bash
cp config.json.example config.json
```

Beispielstruktur:
- `environments.production` → Prod Supabase
- `environments.test` → Test Supabase

Die App wählt Umgebung über:
1. URL-Parameter `?ps_env=test|production`
2. gespeicherte Auswahl in `localStorage` (`ps_runtime_env`)
3. `defaultEnvironment` aus `config.json`
4. Hostname-Heuristik (`test/staging/dev/localhost` -> `test`, sonst `production`)

## 2) Test-Login mit eigenen Daten
Für Testen mit eigenen Daten:
- Nutze `?ps_env=test` in der URL (z. B. `https://app.example.com/login.html?ps_env=test`)
- Registriere/verwende einen Test-User in der **Test-Supabase**.
- Daten bleiben getrennt von Prod.

Zusätzlich wird der lokale Storage-Key pro Umgebung getrennt (`...__production` / `...__test`).

## 3) Lokal (optional)
```bash
cp config.local.example.js config.local.js
```
Dann `SUPABASE_URL` und `SUPABASE_ANON_KEY` eintragen.

## Kompatible Schlüssel
=======
# Konfiguration (Cloud + Lokal)

## Ziel
Die App soll **cloud-fähig** sein und überall auf dieselben Supabase-Daten zugreifen.

## Empfohlene Reihenfolge

### 1) Produktion / Cloud (empfohlen)
Lege eine `config.json` neben den HTML-Dateien aus (gleiches Verzeichnis wie `index.html`).

1. Vorlage kopieren:
   ```bash
   cp config.json.example config.json
   ```
2. In `config.json` setzen:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Deployen.

Die App lädt `config.json` beim Start automatisch und nutzt diese Werte global.

### 2) Lokal (nur Entwicklergerät)
Wenn du lokal testen willst:

```bash
cp config.local.example.js config.local.js
```

Dann in `config.local.js` `SUPABASE_URL` + `SUPABASE_ANON_KEY` setzen.

`config.local.js` bleibt lokal und ist in `.gitignore`.

## Variablen-Kompatibilität
Unterstützte Schlüsselnamen:
>>>>>>> Snapshot-0001
- `PS_SUPABASE_URL` / `PS_SUPABASE_ANON_KEY`
- `SUPABASE_URL` / `SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
<<<<<<< codex/configure-supabase-settings
=======

## Auflösung / Priorität
1. Bereits gesetzte Werte in `window.PS_CONFIG` (z. B. `config.local.js`)
2. `assets/js/config.js` (ENV/Cloudflare/Window-Fallbacks)
3. `config.json` (Runtime-Fallback für Cloud Static Hosting)

Damit kannst du dieselbe App lokal und in Cloud-Hosts (statisch) robust betreiben.
>>>>>>> Snapshot-0001

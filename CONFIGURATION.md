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
- `PS_SUPABASE_URL` / `PS_SUPABASE_ANON_KEY`
- `SUPABASE_URL` / `SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`

## Auflösung / Priorität
1. Bereits gesetzte Werte in `window.PS_CONFIG` (z. B. `config.local.js`)
2. `assets/js/config.js` (ENV/Cloudflare/Window-Fallbacks)
3. `config.json` (Runtime-Fallback für Cloud Static Hosting)

Damit kannst du dieselbe App lokal und in Cloud-Hosts (statisch) robust betreiben.

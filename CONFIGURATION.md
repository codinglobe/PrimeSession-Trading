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
- `PS_SUPABASE_URL` / `PS_SUPABASE_ANON_KEY`
- `SUPABASE_URL` / `SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`

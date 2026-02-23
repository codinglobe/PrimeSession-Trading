# Supabase Tabellen & Datenmigration

Diese SQL-Dateien erstellen ein sauberes, normalisiertes Schema und migrieren vorhandene Daten aus der bisherigen `app_data` JSON-Struktur.

## Reihenfolge
1. `supabase/schema.sql` ausführen (Tabellen, Trigger, RLS Policies).
2. `supabase/migrate_from_app_data.sql` ausführen (bestehende Daten übernehmen).
3. Optional: `supabase/seed.sql` ausführen (Demo-Daten hinzufügen).

## Enthaltene Tabellen
- `user_profiles` (inkl. `username`, `display_name`, `email`)
- `user_settings`
- `calculator_trades`, `calculator_trade_orders`, `calculator_trade_fills`
- `journal_trades`, `journal_trade_exits`
- `support_tickets`, `support_ticket_messages`, `support_ticket_attachments`

Alle Kern-Tabellen enthalten relevante Titel-/Namensspalten, z. B. `title` (Trades/Tickets) und `username`/`display_name` (Profile).

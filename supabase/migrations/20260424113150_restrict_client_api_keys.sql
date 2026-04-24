-- Restrict client_api_keys SELECT to admins only.
--
-- Previously: `cdp_read_client_api_keys USING (true)` let every CDP read
-- every tenant's encrypted API key. Even encrypted, this violated least
-- privilege and combined with the (now removed) plaintext fallback it
-- could expose raw Eduvia keys across tenants.
--
-- Eduvia sync runs via the service role client and does not need RLS read
-- access, so CDPs do not need to see these rows.

DROP POLICY IF EXISTS cdp_read_client_api_keys ON client_api_keys;

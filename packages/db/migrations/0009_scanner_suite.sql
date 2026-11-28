-- OSV-Scanner takes over dependency scanning from Trivy, and zizmor, poutine
-- and Spectral are new. Repositories that had Trivy on get OSV-Scanner; every
-- repository gets the new ones. Data only: the column's default stays in code (DEFAULT_SCANNERS),
-- since changing it here would rebuild the table.
UPDATE `repository`
SET `scanners` = json_insert(`scanners`, '$[#]', 'osv')
WHERE EXISTS (SELECT 1 FROM json_each(`repository`.`scanners`) WHERE value = 'trivy')
  AND NOT EXISTS (SELECT 1 FROM json_each(`repository`.`scanners`) WHERE value = 'osv');
--> statement-breakpoint
UPDATE `repository`
SET `scanners` = json_insert(`scanners`, '$[#]', 'zizmor')
WHERE NOT EXISTS (SELECT 1 FROM json_each(`repository`.`scanners`) WHERE value = 'zizmor');
--> statement-breakpoint
UPDATE `repository`
SET `scanners` = json_insert(`scanners`, '$[#]', 'poutine')
WHERE NOT EXISTS (SELECT 1 FROM json_each(`repository`.`scanners`) WHERE value = 'poutine');
--> statement-breakpoint
UPDATE `repository`
SET `scanners` = json_insert(`scanners`, '$[#]', 'spectral')
WHERE NOT EXISTS (SELECT 1 FROM json_each(`repository`.`scanners`) WHERE value = 'spectral');

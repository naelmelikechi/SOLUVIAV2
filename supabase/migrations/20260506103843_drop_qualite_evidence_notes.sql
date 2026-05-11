-- L'API Eduvia est en lecture seule cote SOLUVIA. La table qualite_evidence_notes
-- (motifs de rejet d'evidence cote SOLUVIA) n'est plus utilisee : la validation
-- des preuves se fait directement dans Eduvia. On laisse tomber.

DROP TABLE IF EXISTS qualite_evidence_notes CASCADE;

-- Fix missing accents on French bank holiday labels (2026)
UPDATE jours_feries SET libelle = 'Lundi de Pâques' WHERE date = '2026-04-06' AND libelle = 'Lundi de Paques';
UPDATE jours_feries SET libelle = 'Fête du Travail' WHERE date = '2026-05-01' AND libelle = 'Fete du Travail';
UPDATE jours_feries SET libelle = 'Lundi de Pentecôte' WHERE date = '2026-05-25' AND libelle = 'Lundi de Pentecote';
UPDATE jours_feries SET libelle = 'Fête Nationale' WHERE date = '2026-07-14' AND libelle = 'Fete Nationale';
UPDATE jours_feries SET libelle = 'Noël' WHERE date = '2026-12-25' AND libelle = 'Noel';

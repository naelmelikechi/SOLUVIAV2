# Easter egg : l'enigme du robot (deverrouillage avatar)

Date : 2026-06-10

## Contexte

L'app a un easter egg : on peut figer son avatar-robot "a vie", et pour le
liberer il faut saisir une cle secrete (`AVATAR_UNLOCK_SECRET`, comparee en
timing-safe cote serveur). Le panneau gele affiche deja le texte
_"Un indice est cache quelque part dans l'application"_ - mais aucun indice
n'existait reellement, et le secret etait une chaine aleatoire indevinables.

Objectif : rendre le secret reellement trouvable par n'importe quel
utilisateur, via UNE enigme cachee dans l'UI.

## Decisions

- **Type** : enigme a 1 indice (le secret devient un mot/phrase devinable).
- **Public** : n'importe quel utilisateur, dans l'UI (pas reserve aux devs).
- **Mecanique** : cliquer 5 fois (clics rapproches, fenetre ~1.5s) sur le gros
  robot 128px de la page `/parametres-compte` fait apparaitre une bulle ou le
  robot "chuchote" son enigme. Avant 5 clics, rien (c'est un secret).
- **Nouveau secret** : `fideleavie`.
- **Tolerance de saisie** : la tentative ET le secret attendu sont normalises
  avant comparaison (minuscules, accents retires, tout non-alphanumerique
  supprime). Donc `Fidele a vie`, `fidele-a-vie`, `FIDELE A VIE!` matchent tous.
  La comparaison reste `timingSafeEqual` sur les formes normalisees.
- **L'enigme** renvoie au texte deja affiche sous le robot gele
  (_"Fidele... fige a vie"_) -> reponse "fidele a vie".

## Fichiers

- `lib/utils/avatar.ts` : nouvelle fonction pure `normalizeUnlockAttempt`.
- `lib/actions/settings.ts` : `attemptUnlockFrozenAvatar` normalise les 2 cotes.
- `components/settings/settings-page-client.tsx` : compteur de clics sur le
  robot + composant local `RobotRiddleBubble`.
- `.env.example` + `README.md` + `lib/env.ts` (commentaire) : doc du nouveau
  secret.
- `__tests__/avatar-unlock.test.ts` : tests de `normalizeUnlockAttempt`.

## Ops

Changer la var Vercel `AVATAR_UNLOCK_SECRET` (Production) de
`AGjEvImuVsZBIutiuLu5` -> `fideleavie`, puis redeploy. Grace a la normalisation
des deux cotes, n'importe quelle casse/ponctuation de la valeur stockee marche.

## Tests

- Unitaire : `normalizeUnlockAttempt` (variantes accents/casse/ponctuation ->
  meme forme ; chaine differente -> forme differente).
- Manuel : 5 clics sur le robot -> bulle ; saisir "Fidele a vie" -> deverrouille.

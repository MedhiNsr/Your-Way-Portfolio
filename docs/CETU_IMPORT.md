# Référentiel CETU

Your Way possède une couche locale, versionnable et non bloquante pour l'Atlas des
tunnels routiers français du CETU. Aucun scraping du site n'est effectué. Au moment
de cette intégration, aucune API ni distribution structurée assortie de conditions de
réutilisation explicites n'a été identifiée dans le dépôt ou sur les pages publiques
de l'Atlas. Le fichier livré reste donc volontairement vide.

## Alimenter le référentiel

1. Obtenir du CETU une extraction officielle et une autorisation/licence de réutilisation.
2. Convertir chaque ouvrage vers `src/data/cetu-tunnels.json`, sans recopier une page HTML.
3. Conserver la version/date et l'URL ou le titre exact de l'extraction dans chaque entrée.
4. Valider coordonnées, unités (mètres) et doublons avant revue et commit.

Une entrée contient `id`, `officialName`, `latitude`, `longitude`, `lengthM`, `route`,
`manager`, `tubeCount`, `structureType`, `officialSource` et `referenceVersion`. Les
champs inconnus sont `null`, jamais inventés. Le moteur rapproche uniquement ces
entrées d'un ouvrage déjà détecté sur l'itinéraire : le référentiel ne crée pas à lui
seul une traversée.

# Référentiel local des ouvrages couverts OSM

## Architecture et format

Le calcul GraphHopper reste inchangé. Une fois sa géométrie obtenue, le serveur interroge le
snapshot JSON versionné, associe précisément les candidats à la route, fusionne les observations
GraphHopper, puis applique CETU et Wikidata comme enrichissements. Overpass n'est appelé que si
le snapshot est indisponible **et** si `ENABLE_OVERPASS_FALLBACK=true`.
Un déploiement peut simuler/forcer cette absence avec `LOCAL_OSM_ENABLED=false` (audit ou reprise
temporaire); le comportement normal laisse cette variable non définie.

Le format `schemaVersion: 1` contient les métadonnées (`snapshotId`, date, source, licence), une
emprise de couverture et des records. Chaque record conserve `osmId`, géométrie `[lat, lon]`, bbox,
longueur géodésique et les tags utiles (`name`, `official_name`, `alt_name`, `ref`, `highway`,
`tunnel`, `covered`, `layer`, `lanes`, `maxheight`, etc.). Le fichier livré est explicitement une
petite **fixture synthétique lyonnaise**, pas un extrait exhaustif ni un snapshot de production.

À l'exécution, les bbox sont rangées dans une grille déterministe de 0,05°. La bbox de la route,
élargie de 75 m, ne visite que les cellules croisées; l'association ON_ROUTE / UNCERTAIN /
OFF_ROUTE existante est ensuite appliquée sans modifier ses seuils.

## Génération depuis Geofabrik

Installer l'outil CLI `osmium-tool`, puis télécharger hors du dépôt l'extrait adapté (France ou
région) depuis Geofabrik. Aucun PBF volumineux ne doit être commité.

```bash
export OSM_SOURCE_URL=https://download.geofabrik.de/europe/france/rhone-alpes-latest.osm.pbf
curl -L "$OSM_SOURCE_URL" -o /tmp/region.osm.pbf
node scripts/build-osm-tunnel-snapshot.mjs /tmp/region.osm.pbf src/data/osm-tunnels.snapshot.json
```

Le script appelle `osmium tags-filter` pour les ways portant `tunnel=*` ou `covered=*`, exporte
leur géométrie, conserve uniquement `highway=*`, calcule les longueurs et écrit un JSON stable.
Cela couvre notamment `tunnel=yes`, `tunnel=building_passage`, `covered=yes` et les autres valeurs
qui restent classées `INCERTAIN` par le moteur. Vérifier le diff et renseigner/conserver l'URL et la
date du PBF avant publication.

## Attribution et maintenance

Les données OpenStreetMap sont disponibles sous ODbL 1.0; afficher/conserver l'attribution
« © les contributeurs OpenStreetMap ». Geofabrik est le distributeur de l'extrait et doit être
mentionné lorsque son téléchargement est utilisé. Conserver avec chaque snapshot l'URL source,
la date, l'identifiant de version et la licence, ainsi que la possibilité de régénérer les données.
Cette note décrit le traitement technique et l'attribution, sans constituer un avis juridique.

CETU reste dans `cetu-tunnels.json`: il confirme fortement un ouvrage déjà cartographié mais ne
crée jamais seul une traversée. Wikidata conserve un budget court et ne crée pas davantage de
traversée. Leur indisponibilité ne transforme donc pas un audit local valide en échec.

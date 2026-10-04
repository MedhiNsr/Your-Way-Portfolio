# Référentiel OSM France – intégration production

Cette branche remplace le fixture Lyon par un snapshot national produit depuis l’extrait Geofabrik France du 28 août 2026.

Principes de sécurité :
- le snapshot local devient la source géographique primaire pour les tunnels / passages couverts ;
- les identifiants OSM réels sont conservés (`-u type_id`) ;
- les objets explicitement `tunnel=no` ou `covered=no` sont exclus ;
- un segment OSM n’est pas compté comme un tunnel physique distinct ;
- la couverture rectangulaire seule ne doit jamais suffire à déclarer une route `VERIFIED`, car elle englobe des zones hors France (Belgique, Luxembourg, Suisse, Italie, mer). Tant qu’un polygone de couverture exact n’est pas embarqué, la vérification locale reste `PARTIAL`.

Source : Geofabrik France / OpenStreetMap, ODbL 1.0. Horodatage du PBF : 2026-08-28T20:20:46Z.

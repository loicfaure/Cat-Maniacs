# Cat Dispenser

Application Electron/TypeScript locale pour gérer le parcours des chats de Cha'Mania : enregistrement, familles d'accueil temporaires, refuge, adoptants définitifs, événements d'adoption, retours et import des anciens fichiers.

## Fonctionnalités du MVP

- registre paginé des chats avec UUID interne, recherche, filtres de statut/stérilisation et tris par date ;
- familles d'accueil et accueils réunis sur une page, adoptants et adoptions réunis sur une autre ;
- capacité, profils acceptés et vacances des familles, avec alertes et dérogations tracées ;
- placements temporaires avec début, fin et vue des chats groupés par famille ;
- refuge découpé en zones isolées et transferts directs après une fin d'accueil ou un retour d'adoption ;
- événements d'adoption de plusieurs jours, lieux partenaires réutilisables, réservations, validations, suggestions par lieu et ajout d'un cheptel complet ;
- adoption groupée, nouvel adoptant ou reprise du contact d'une famille d'accueil ;
- fiche chat avec historique des familles, zones du refuge, adoptants et retours ;
- adoptabilité, alertes de stérilisation/santé et recherche des chats ayant partagé un lieu ;
- statut courant calculé à partir des placements, séjours au refuge, adoptions et événements ;
- import d'un format historique à 25 colonnes ;
- diagnostic des dates, e-mails, ICAD dupliqués, catégories d'âge et contradictions de stérilisation ;
- stockage dans plusieurs CSV avec manifeste versionné, journal de transaction et 20 sauvegardes ;
- renderer Electron isolé, sandboxé et sans accès direct à Node.js.

## Installation sûre

Le fichier `.npmrc` contient `ignore-scripts=true`. Les scripts de cycle de vie des dépendances, dont les `postinstall`, ne sont donc jamais exécutés par `npm install`.

```bash
npm install --ignore-scripts
npm run check
```

Electron distribue normalement son exécutable via son script d'installation. Comme ce script est désactivé, `npm run dev` cherche :

1. le chemin défini par `ELECTRON_BINARY` ;
2. un binaire déjà présent dans `node_modules/electron/dist`.

Exemple avec un Electron déjà installé :

```bash
ELECTRON_BINARY=/chemin/vers/electron npm run dev
```

## Données

Par défaut, l'application crée un dossier `dataset` sous le dossier de données utilisateur d'Electron. Le bouton **Changer de dossier** permet d'ouvrir ou de créer un autre registre.

```text
dataset/
  dataset.json
  cats.csv
  families.csv
  adopters.csv
  foster_family_holidays.csv
  foster_placements.csv
  refuge_zones.csv
  refuge_stays.csv
  adoptions.csv
  adoption_days.csv
  adoption_day_cats.csv
  partner_places.csv
  health_alerts.csv
  cat_events.csv
  tasks.csv
  follow_ups.csv
  backups/
```

Les dates sont enregistrées en `AAAA-MM-JJ`. Les numéros ICAD restent des chaînes de caractères. Pendant l'import historique, un numéro invalide ou présent sur plusieurs lignes est conservé dans les notes mais n'est pas utilisé comme identifiant canonique.

Les fichiers de données et exports (`CSV`, tableurs et dossier `dataset`) sont ignorés par Git car ils peuvent contenir des coordonnées personnelles. Les tests d'import génèrent uniquement des données fictives en mémoire ; aucun registre réel n'est distribué avec l'application.

## Commandes

```bash
npm run dev        # build puis lancement Electron
npm run demo       # jeu isolé réinitialisé avec 64 chats de démonstration
npm run privacy    # contrôle les fichiers publiables et l'identité des commits
npm run typecheck
npm test
npm run build
npm run check      # confidentialité + typecheck + tests + build
npm run dist:linux # AppImage Linux x64
npm run dist:win   # installateur Windows x64 (à lancer sous Windows)
```

## Publier une version

Le workflow GitHub Actions `Build and release desktop apps` vérifie le projet puis construit un installateur Windows (`.exe`) et une application Linux (`.AppImage`). Ce sont les deux seuls fichiers applicatifs ajoutés à la release ; GitHub affiche également ses archives automatiques du code source.

- **Dry run** (activé par défaut) : un lancement manuel produit les paquets et les conserve comme artefacts pendant 14 jours, sans créer de tag ni de release.
- **Publication** : mettre à jour la version de `package.json`, lancer manuellement le workflow, désactiver `dry_run`, puis choisir `stable`, `prerelease` ou `draft`. Après la réussite des builds Windows et Linux, le job de publication crée lui-même le tag `v<version>` puis la GitHub Release du type demandé.

Un tag `v*` poussé manuellement reste également pris en charge. Le workflow vérifie alors qu'il correspond exactement à la version de `package.json`.

Les exécutables ne sont pas encore signés : Windows peut donc afficher un avertissement SmartScreen jusqu'à l'ajout d'un certificat de signature.

### Mode démonstration

Au premier lancement, l'application ouvre automatiquement un registre de démonstration distinct des vraies données et explique son fonctionnement. La fenêtre de bienvenue permet aussi de choisir immédiatement **Utiliser mon registre** sans activer durablement la démonstration. Le mode choisi reste actif entre les lancements ; le bouton en bas à gauche permet ensuite de changer de mode sans mélanger les deux registres.

Le registre de démonstration contient 64 chats, des familles d'accueil, des adoptants distincts, trois zones de refuge, des placements, des adoptions et retours, deux événements, des vacances et une alerte sanitaire. La famille « Maison des cinq chats » permet de tester immédiatement l'ajout d'un cheptel complet à une journée d'adoption. `npm run demo` force ce mode et réinitialise ses données pour les tests manuels.

## Prochaine intégration

Le modèle de domaine, les règles métier et l'import legacy sont indépendants du renderer. Une prochaine étape possible est d'implémenter un adaptateur Google Sheets derrière la même interface que le dépôt CSV. Les onglets Google reprendront les fichiers CSV actuels, les UUID resteront les clés stables et une colonne de révision permettra de détecter un conflit avant écriture. L'authentification OAuth, les écritures par lots et un cache local hors-ligne pourront ainsi être ajoutés sans modifier les écrans ni les règles métier.

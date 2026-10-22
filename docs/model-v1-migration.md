# Modèle animal v1 et migration

Ce guide décrit le modèle enregistré et la conversion des registres historiques. Le plan détaillé et les critères de mise en œuvre sont dans [multi-species-model-v1-plan.md](multi-species-model-v1-plan.md).

## Versions et espèces

Un registre actuel porte `modelVersion: 1` et `schemaVersion: 8` dans `dataset.json`. Ces nombres ont des rôles distincts : `modelVersion` identifie la forme métier des données, `schemaVersion` suit le format de stockage, et la version du logiciel installé reste dans `package.json`. Une nouvelle version de l'application n'implique donc pas à elle seule une nouvelle version du modèle ou du schéma.

Le modèle v1 prend en charge quatre espèces : `cat`, `dog`, `rabbit` et `snake`. Chaque registre réel possède sa liste `settings.enabledSpecies`. Les nouveaux registres et les registres convertis activent les chats seuls. La page **Paramètres** permet d'activer d'autres espèces ; au moins une doit rester active. Chaque espèce affiche son nombre d'animaux enregistrés. Une espèce ne peut pas être désactivée si un animal de cette espèce figure encore au registre, y compris s'il est adopté, perdu ou décédé : sa case est grisée. Cette règle s'applique aussi au registre de démonstration. L'espèce d'un animal ne peut pas être changée dans le modèle v1.

Quand une seule espèce est active, les formulaires lui attribuent automatiquement les nouveaux animaux et masquent les choix ou filtres d'espèce dans les parcours courants. Avec plusieurs espèces actives, les formulaires demandent une espèce et les listes ou contextes mixtes montrent l'espèce et proposent des filtres.

Les définitions du registre décrivent les libellés, profils, identifiants, champs de détail, catégories de soins et données de démonstration. Les chats conservent le calcul existant de profil par âge. Les profils des chiens, lapins et serpents sont manuels ; aucun âge de maturité n'est déduit. Les capacités de soins ne définissent pas de calendrier vétérinaire. Le typage central limite actuellement les identifiants persistables aux quatre espèces ci-dessus : une cinquième espèce nécessite aussi une mise à jour des types et validations core, du stockage et des règles spécifiques, et ne peut pas être ajoutée uniquement par une définition de renderer.

## Formats historiques acceptés

Le moteur détecte le format d'après le manifeste. Il prend en charge :

- les registres de la version `v0.1.0`, au schéma 3 ;
- les registres de développement au schéma 7 de ce workspace.

Les schémas plus anciens sans adaptateur, les manifestes mal formés et les versions futures non reconnues sont refusés avant conversion. Un manifeste déjà au modèle 1 et schéma 8 est reconnu comme actuel ; relancer le CLI ne le modifie pas.

Les animaux et relations migrent vers les tables génériques : `animals.csv`, `animal_events.csv`, `adoption_day_animals.csv` et les clés `animalId`. Les chats historiques deviennent des animaux `cat`; les champs détaillés et parrainages présents dans le schéma 7 sont conservés. Les anciennes préférences d'activation de l'espèce n'existent pas dans ces formats : le registre converti active les chats seuls. Les lignes ou valeurs incohérentes qui empêchent une conversion doivent être corrigées dans une copie puis inspectées à nouveau ; le moteur ne les remplace pas silencieusement.

## Migration depuis l'application

À l'ouverture d'un vrai registre pris en charge, l'application inspecte son manifeste avant de l'ouvrir. Elle affiche un avertissement indiquant la conversion vers le modèle v1, la version source, le dossier, les comptes disponibles, l'emplacement de sauvegarde prévu et le fait que l'ancien logiciel ne pourra pas ouvrir le format converti. La conversion ne démarre qu'après le choix **Sauvegarder et migrer**. **Annuler** laisse le registre intact et propose la démo, un autre dossier ou la fermeture.

Le mode démo ouvre son registre distinct et le remplace par un nouveau jeu de démonstration ; cette ouverture ne convertit pas un registre réel en arrière-plan. La liste des espèces de démo est conservée séparément des paramètres du registre réel et survit à la réinitialisation de la démo.

Après accord, le moteur crée dans le dossier parent une sauvegarde complète nommée comme le registre source et suffixée par `.legacy-backup-<identifiant>`. Il copie récursivement les fichiers présents, y compris les fichiers legacy, journaux et temporaires, puis vérifie les tailles et empreintes SHA-256 et ajoute l'inventaire à la sauvegarde. Il récupère ensuite, si besoin, la transaction historique inachevée conservée dans cette sauvegarde, valide le mappage en mémoire et les tables staged, puis publie les fichiers cible avec le manifeste en dernier. Les anciens noms de tables chat sont retirés dans cette transaction. Un reçu de conversion enregistre l'identifiant, les versions source et cible, les comptes, le chemin de sauvegarde et la date de fin.

## CLI

Construisez le projet avant le premier appel ; le build produit l'entrée Node bundlée qui partage le moteur de l'application :

```sh
npm run build
npm run migrate:model -- --dataset "path/to/register" --dry-run
npm run migrate:model -- --dataset "path/to/register"
npm run migrate:model -- --dataset "path/to/register" --yes
```

`--dry-run` inspecte et valide les fichiers pris en charge sans créer, modifier ou verrouiller de fichier et sans créer de sauvegarde. Il affiche les comptes et problèmes. Si un journal de migration précédemment autorisée exige une récupération, le mode simulation le signale sans écrire.

Sans `--dry-run`, le CLI affiche un rapport puis demande une confirmation. En mode non interactif, la conversion exige `--yes`. Cet argument accepte la conversion après le rapport. Un registre déjà actuel est un succès sans changement ; l'annulation retourne le code 2 ; les formats ou données non pris en charge retournent le code 3 ; les erreurs d'accès ou d'écriture retournent le code 4.

Si une migration s'est interrompue après son consentement, le moteur termine la transaction journalisée avant l'ouverture normale du registre. Un verrou resté seul sans journal nécessite une inspection humaine. Fermez d'abord l'application qui le détenait, puis vérifiez le PID affiché. La récupération explicite est :

```sh
npm run migrate:model -- --dataset "path/to/register" --recover-lock
# En exécution non interactive, seulement après avoir vérifié que le PID est arrêté :
npm run migrate:model -- --dataset "path/to/register" --recover-lock --yes
```

Le CLI refuse de libérer un verrou dont le PID est encore actif. S'il y a un journal de migration, la récupération termine cette transaction ; sans journal, elle retire uniquement le verrou après confirmation. La récupération ne remplace pas une sauvegarde et ne doit pas être utilisée pour interrompre une migration en cours.

## Retour à l'ancien logiciel

La conversion remplace les fichiers dans le dossier source après avoir vérifié une sauvegarde complète dans son dossier parent. Les modifications réalisées ensuite au modèle v1 n'ont pas de migration inverse sûre.

Pour reprendre le travail avec l'ancienne application, fermez les deux versions du logiciel. Restaurez la sauvegarde vérifiée dans un nouveau dossier séparé, puis ouvrez ce nouveau dossier avec l'ancienne version. Ne restaurez jamais la sauvegarde par-dessus le registre v1 actif et ne supprimez pas la sauvegarde avant d'avoir vérifié le registre restauré. Le registre v1 d'origine et toutes ses modifications restent ainsi disponibles séparément.

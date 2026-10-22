import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { registeredSpecies } from "../domain/species/registry";
import type {
  Adoption,
  AdoptionDaySuggestionGroup,
  AdoptionEligibility,
  AnimalEventType,
  AnimalProfile,
  AnimalStatus,
  AppSnapshot,
  EmailTemplates,
  HealthExposure,
  LegacyImportPreview,
  Sex,
  SpeciesData,
  SpeciesId,
  SterilizationStatus,
} from "../shared/types";
import { searchAdoptionAnimals } from "./animalSearch";
import { type AnimalSortField, buildAnimalTable, type SortDirection } from "./animalTable";
import {
  AdoptabilityFields,
  SpeciesDetailsFields,
  SpeciesFilter,
  SpeciesSelector,
  SpeciesTableCell,
  SpeciesTableHeader,
} from "./speciesPresentation";

import {
  Badge,
  Button,
  Callout,
  Checkbox,
  DateInput,
  Empty,
  Field,
  FieldGroup,
  FilterBar,
  FormActions,
  type Notice,
  Notification,
  PageHeader,
  Panel,
  RecordLink,
  SearchField,
} from "./ui";

type Page =
  | "dashboard"
  | "animals"
  | "families"
  | "adoptions"
  | "adoptionDays"
  | "refuge"
  | "import"
  | "care"
  | "email"
  | "sponsorships"
  | "settings";

interface PageProps {
  snapshot: AppSnapshot;
  run: (operation: () => Promise<AppSnapshot>, message: string) => Promise<void>;
}

const PAGE_META: Array<{ id: Page; label: string; icon: string }> = [
  { id: "dashboard", label: "Vue d'ensemble", icon: "⌂" },
  { id: "animals", label: "Animaux", icon: "◉" },
  { id: "refuge", label: "Le refuge", icon: "⌂" },
  { id: "families", label: "Familles d'accueil", icon: "⌁" },
  { id: "adoptions", label: "Adoptions", icon: "♡" },
  { id: "adoptionDays", label: "Journées adoption", icon: "☀" },
  { id: "sponsorships", label: "Parrainages", icon: "💰" },
  { id: "care", label: "Rappels", icon: "◷" },
  { id: "email", label: "E-mails", icon: "✉" },
  { id: "import", label: "Importer", icon: "⇥" },
  { id: "settings", label: "Paramètres", icon: "⚙" },
];

const STATUS_LABEL: Record<AnimalStatus, string> = {
  FOSTERED: "En accueil",
  AT_REFUGE: "Au refuge",
  ADOPTED: "Adopté",
  LOST: "Perdu",
  DECEASED: "Décédé",
};
function profileLabel(speciesId: SpeciesId, profile: AnimalProfile): string {
  return (
    registeredSpecies
      .find((species) => species.id === speciesId)
      ?.profiles.find((candidate) => candidate.id === profile)?.label ?? profile
  );
}
const SEX_OPTIONS: readonly Sex[] = ["F", "M", "UNKNOWN"];
const STERILIZATION_OPTIONS: readonly SterilizationStatus[] = ["DONE", "TODO", "UNKNOWN"];
const STERILIZATION_FILTERS: readonly (SterilizationStatus | "ALL")[] = [
  "ALL",
  ...STERILIZATION_OPTIONS,
];
const STATUS_OPTIONS: readonly (AnimalStatus | "ALL")[] = [
  "ALL",
  "FOSTERED",
  "AT_REFUGE",
  "ADOPTED",
  "LOST",
  "DECEASED",
];
const SORT_OPTIONS: readonly AnimalSortField[] = ["name", "birthDate", "intakeDate", "updatedAt"];
const ADOPTION_SORT_MODES: readonly ("date" | "animal")[] = ["date", "animal"];

function optionValue<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

function formOption<T extends string>(
  data: FormData,
  key: string,
  options: readonly T[],
  fallback: T,
): T {
  const value = data.get(key);
  return typeof value === "string" ? optionValue(value, options, fallback) : fallback;
}

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function formatDate(value: string): string {
  if (!value) {
    return "—";
  }
  if (value.includes("T")) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "")
    : String(error);
}
function animalWarnings(animal: AppSnapshot["animals"][number]): string[] {
  const warnings: string[] = [];
  if (
    registeredSpecies
      .find((species) => species.id === animal.speciesId)
      ?.careCategories.includes("STERILISATION") &&
    animal.sterilizationStatus !== "DONE"
  ) {
    warnings.push("Stérilisation non confirmée");
  }
  if (animal.healthStatus === "SICK") {
    warnings.push("Malade / surveillance sanitaire");
  }
  if (animal.adoptionEligibility !== "ELIGIBLE") {
    warnings.push(animal.adoptionBlockedReason || "Adoption non autorisée");
  }
  return warnings;
}
function careTypeLabel(type: string): string {
  if (type === "VERMIFUGE") {
    return "Vermifuge";
  }
  if (type === "ANTI_PUCE" || type.toLowerCase().includes("anti-puce")) {
    return "Anti-puce";
  }
  if (type === "VACCIN" || type === "VACCINATION") {
    return "Vaccin / injection";
  }
  if (
    type
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes("sterilis") ||
    ["neutering", "spay", "castration"].some((word) => type.toLowerCase().includes(word))
  ) {
    return "Stérilisation";
  }
  return type;
}

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [page, setPage] = useState<Page>("dashboard");
  const [notice, setNotice] = useState<Notice | null>(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  const [emailAnimalId, setEmailAnimalId] = useState("");
  const [healthAnimalId, setHealthAnimalId] = useState<string | null>(null);
  const [switchingDemo, setSwitchingDemo] = useState(false);
  useEffect(() => {
    window.catApp
      .bootstrap()
      .then(setSnapshot)
      .catch((error) => setNotice({ kind: "error", text: errorMessage(error) }));
  }, []);
  useEffect(() => {
    const timer = window.setInterval(
      () => {
        window.catApp
          .bootstrap()
          .then(setSnapshot)
          .catch(() => undefined);
      },
      60 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const showAnimal = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") {
        setSelectedAnimalId(event.detail);
      }
    };
    const showFamily = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "string") {
        return;
      }
      const familyId = event.detail;
      setPage("families");
      window.setTimeout(
        () =>
          document
            .getElementById(`family-${familyId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        50,
      );
    };
    window.addEventListener("cat:open", showAnimal);
    window.addEventListener("family:open", showFamily);
    const showRefuge = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "string") {
        return;
      }
      const zoneId = event.detail;
      setSelectedAnimalId(null);
      setHealthAnimalId(null);
      setPage("refuge");
      window.setTimeout(
        () =>
          document
            .getElementById(`refuge-zone-${zoneId}`)
            ?.scrollIntoView?.({ behavior: "smooth", block: "center" }),
        50,
      );
    };
    window.addEventListener("refuge:open", showRefuge);
    return () => {
      window.removeEventListener("cat:open", showAnimal);
      window.removeEventListener("family:open", showFamily);
      window.removeEventListener("refuge:open", showRefuge);
    };
  }, []);
  const run = async (operation: () => Promise<AppSnapshot>, message: string) => {
    try {
      setSnapshot(await operation());
      setNotice({ kind: "success", text: message });
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    }
  };
  const switchDemoMode = async (enabled = !snapshot?.demoMode) => {
    if (!snapshot) {
      return;
    }
    try {
      setSwitchingDemo(true);
      const resetting = snapshot.demoMode && enabled;
      setSnapshot(await window.catApp.setDemoMode(enabled));
      setSelectedAnimalId(null);
      setHealthAnimalId(null);
      setEmailAnimalId("");
      setPage("dashboard");
      setNotice({
        kind: "success",
        text: resetting
          ? "Démonstration réinitialisée avec les dates d'aujourd'hui."
          : enabled
            ? "Mode démo activé avec les dates d'aujourd'hui. Vos données réelles restent isolées."
            : "Mode démo quitté. Votre registre réel est ouvert.",
      });
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    } finally {
      setSwitchingDemo(false);
    }
  };
  const dismissDemoWelcome = async () => {
    try {
      setSnapshot(await window.catApp.dismissDemoWelcome());
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    }
  };
  if (!snapshot) {
    return (
      <div className="loading">
        <div className="cat-mark">C</div>
        <p>Ouverture du registre…</p>
      </div>
    );
  }
  const pageTitle =
    page === "animals" && snapshot.settings.enabledSpecies.length === 1
      ? (registeredSpecies.find((species) => species.id === snapshot.settings.enabledSpecies[0])
          ?.label.plural ?? "Animaux")
      : (PAGE_META.find((item) => item.id === page)?.label ?? "");
  return (
    <div
      className={`shell ${snapshot.settings.enabledSpecies.length > 1 ? "multi-species" : "single-species"}`}
    >
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <strong>Cha'Mania</strong>
            <span>Registre animalier</span>
          </div>
        </div>
        {snapshot.demoMode && (
          <div className="demo-badge">Mode démo · {snapshot.animals.length} animaux</div>
        )}
        <nav>
          {PAGE_META.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => {
                setHealthAnimalId(null);
                setPage(item.id);
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.id === "animals" && snapshot.settings.enabledSpecies.length === 1
                ? registeredSpecies.find(
                    (species) => species.id === snapshot.settings.enabledSpecies[0],
                  )?.label.plural
                : item.label}
              {item.id === "animals" && <small>{snapshot.animals.length}</small>}
              {item.id === "email" &&
                snapshot.generatedEmails.filter((email) => !email.acknowledgedAt).length > 0 && (
                  <small
                    aria-label={`${snapshot.generatedEmails.filter((email) => !email.acknowledgedAt).length} e-mails à envoyer`}
                  >
                    {snapshot.generatedEmails.filter((email) => !email.acknowledgedAt).length}
                  </small>
                )}
            </button>
          ))}
        </nav>
        <div className="dataset-card">
          <span>Jeu de données</span>
          <strong title={snapshot.datasetPath}>{snapshot.name}</strong>
          <button
            disabled={snapshot.demoMode}
            onClick={async () => {
              const selected = await window.catApp.chooseDatasetDirectory();
              if (selected) {
                setSnapshot(selected);
                setNotice({ kind: "success", text: "Jeu de données ouvert." });
              }
            }}
          >
            {snapshot.demoMode ? "Dossier de démonstration isolé" : "Changer de dossier"}
          </button>
          {snapshot.demoMode && (
            <button
              disabled={switchingDemo}
              title="Remplacer les modifications de la démo par de nouvelles données datées d'aujourd'hui"
              onClick={() => void switchDemoMode(true)}
            >
              Réinitialiser la démo
            </button>
          )}
        </div>
        <button
          className={`demo-switch ${snapshot.demoMode ? "active" : ""}`}
          disabled={switchingDemo}
          onClick={() => void switchDemoMode()}
        >
          <span>{snapshot.demoMode ? "←" : "✦"}</span>
          {switchingDemo
            ? "Changement en cours…"
            : snapshot.demoMode
              ? "Quitter le mode démo"
              : "Essayer le mode démo"}
        </button>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <span className="eyebrow">Gestion associative</span>
            <h1>{pageTitle}</h1>
          </div>
          <div className="save-state">
            <span className="save-dot" />
            {snapshot.demoMode ? "Données de démonstration isolées" : "Sauvegarde locale active"}
          </div>
        </header>
        {notice && <Notification notice={notice} onDismiss={dismissNotice} />}
        <div className="content">
          {page === "dashboard" && <Dashboard snapshot={snapshot} navigate={setPage} run={run} />}
          {page === "animals" && <AnimalsPage snapshot={snapshot} run={run} />}
          {page === "families" && <FamiliesPage snapshot={snapshot} run={run} />}
          {page === "adoptions" && <AdoptionsPage snapshot={snapshot} run={run} />}
          {page === "adoptionDays" && (
            <AdoptionDaysPage snapshot={snapshot} run={run} setNotice={setNotice} />
          )}
          {page === "refuge" && <RefugePage snapshot={snapshot} run={run} />}
          {page === "import" && (
            <ImportPage snapshot={snapshot} setSnapshot={setSnapshot} setNotice={setNotice} />
          )}
          {page === "care" &&
            (healthAnimalId ? (
              <HealthIssuePage
                animalId={healthAnimalId}
                snapshot={snapshot}
                run={run}
                setSnapshot={setSnapshot}
                setNotice={setNotice}
                back={() => setHealthAnimalId(null)}
              />
            ) : (
              <CarePage snapshot={snapshot} run={run} />
            ))}
          {page === "email" && (
            <EmailPage
              snapshot={snapshot}
              initialAnimalId={emailAnimalId}
              setSnapshot={setSnapshot}
              setNotice={setNotice}
            />
          )}
          {page === "sponsorships" && <SponsorshipsPage snapshot={snapshot} run={run} />}
          {page === "settings" && (
            <SettingsPage
              snapshot={snapshot}
              setSnapshot={(next) => {
                setSnapshot(next);
                setSelectedAnimalId(null);
                setHealthAnimalId(null);
                setEmailAnimalId("");
              }}
              setNotice={setNotice}
            />
          )}
        </div>
      </main>
      {snapshot.showDemoWelcome && (
        <div className="demo-welcome-backdrop">
          <section
            className="demo-welcome"
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-welcome-title"
          >
            <div className="demo-welcome-mark">C</div>
            <span className="eyebrow">Première visite</span>
            <h2 id="demo-welcome-title">Bienvenue dans le mode démo</h2>
            <p>
              Explorez l'application avec 64 animaux et des données entièrement fictives. Votre vrai
              registre reste séparé et ne sera jamais modifié pendant la démonstration.
            </p>
            <ul>
              <li>Testez les accueils, adoptions et journées d'adoption.</li>
              <li>Les changements restent dans le dossier de démonstration.</li>
              <li>
                Les données sont recréées à chaque ouverture du mode démo avec les dates du jour.
              </li>
              <li>Le mode démo restera actif entre les lancements.</li>
            </ul>
            <div className="demo-welcome-actions">
              <Button
                variant="primary"
                disabled={switchingDemo}
                onClick={() => void dismissDemoWelcome()}
              >
                Explorer la démonstration
              </Button>
              <Button
                variant="secondary"
                disabled={switchingDemo}
                onClick={() => void switchDemoMode()}
              >
                Utiliser mon registre
              </Button>
            </div>
            <small>
              Vous pourrez changer de mode à tout moment avec le bouton en bas à gauche.
            </small>
          </section>
        </div>
      )}
      {selectedAnimalId && (
        <AnimalDetail
          key={selectedAnimalId}
          animalId={selectedAnimalId}
          snapshot={snapshot}
          close={() => setSelectedAnimalId(null)}
          goHealth={() => {
            setHealthAnimalId(selectedAnimalId);
            setSelectedAnimalId(null);
            setPage("care");
          }}
          run={run}
          setSnapshot={setSnapshot}
          setNotice={setNotice}
          setEmailAnimalId={setEmailAnimalId}
          setPage={setPage}
        />
      )}
    </div>
  );
}

function Dashboard({
  snapshot,
  navigate,
  run,
}: {
  snapshot: AppSnapshot;
  navigate: (page: Page) => void;
  run: PageProps["run"];
}) {
  const count = (status: AnimalStatus) =>
    snapshot.animalViews.filter((cat) => cat.status === status).length;
  const latestEvents = [...snapshot.animalEvents]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  const familyCapacity = snapshot.families
    .map((family) => ({
      family,
      animals: snapshot.animalViews.filter((cat) => cat.currentFamilyId === family.id),
      remaining: Math.max(
        0,
        family.maxCapacity -
          snapshot.animalViews.filter((cat) => cat.currentFamilyId === family.id).length,
      ),
    }))
    .filter((group) => group.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const openAlerts = snapshot.healthAlerts.filter((alert) => alert.status === "OPEN");
  const associationAnimalIds = new Set(
    snapshot.animalViews
      .filter((cat) => ["FOSTERED", "AT_REFUGE"].includes(cat.status))
      .map((cat) => cat.id),
  );
  const upcomingCare = snapshot.tasks
    .filter((task) => task.status === "OPEN" && associationAnimalIds.has(task.animalId))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <span className="eyebrow light">Aujourd'hui</span>
          <h2>Chaque parcours, au bon endroit.</h2>
        </div>
        <div className="hero-actions">
          <Button variant="light" onClick={() => navigate("animals")}>
            + Enregistrer un animal
          </Button>
          <Button variant="ghost-light" onClick={() => navigate("families")}>
            + Ajouter une famille
          </Button>
          <Button variant="ghost-light" onClick={() => navigate("adoptions")}>
            Préparer une adoption
          </Button>
          <Button variant="ghost-light" onClick={() => navigate("adoptionDays")}>
            Préparer une journée
          </Button>
        </div>
      </section>
      <section className="metrics">
        <Metric label="Animaux enregistrés" value={snapshot.animals.length} tone="ink" />
        <Metric label="En famille" value={count("FOSTERED")} tone="amber" />
        <Metric label="Au refuge" value={count("AT_REFUGE")} tone="sage" />
        <Metric label="Adoptés" value={count("ADOPTED")} tone="rose" />
      </section>
      <Panel
        title="Places restantes"
        action={
          <Button variant="text" onClick={() => navigate("families")}>
            Gérer les accueils →
          </Button>
        }
      >
        <div className="location-grid">
          {familyCapacity.slice(0, 6).map(({ family, animals, remaining }) => (
            <article className="location-card" key={family.id}>
              <div>
                <FamilyLink family={family} />
                <span>
                  {remaining} place{remaining > 1 ? "s" : ""}
                </span>
              </div>
              <p>
                {animals.length}/{family.maxCapacity} occupées
              </p>
            </article>
          ))}
          {!familyCapacity.length && <Empty text="Aucune place disponible actuellement." />}
        </div>
      </Panel>
      <div className="dashboard-grid">
        <Panel
          title="Rappels à venir"
          action={
            <Button variant="text" onClick={() => navigate("care")}>
              Voir les rappels →
            </Button>
          }
        >
          <div className="timeline">
            {upcomingCare.slice(0, 5).map((task) => (
              <div className="timeline-row" key={task.id}>
                <span className="timeline-dot" />
                <div>
                  <AnimalIdentity cat={snapshot.animals.find((cat) => cat.id === task.animalId)!} />
                  <span>
                    {careTypeLabel(task.type)}
                    {task.notes ? ` · ${task.notes}` : ""}
                  </span>
                </div>
                <time>{formatDate(task.dueDate)}</time>
              </div>
            ))}
            {!upcomingCare.length && <Empty text="Aucun rappel à venir." />}
          </div>
        </Panel>
        <Panel title="Mouvements récents">
          {latestEvents.length ? (
            <div className="timeline">
              {latestEvents.map((event) => {
                const cat = snapshot.animals.find((candidate) => candidate.id === event.animalId);
                return (
                  <div className="timeline-row" key={event.id}>
                    <span className="timeline-dot" />
                    <div>
                      {cat ? <AnimalIdentity cat={cat} /> : <strong>Animal inconnu</strong>}
                      <span>
                        {eventLabel(event.type, event.label)}
                        {event.notes ? ` · ${event.notes}` : ""}
                      </span>
                    </div>
                    <time>{formatDate(event.date)}</time>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty text="Aucun mouvement enregistré." />
          )}
        </Panel>
        <Panel
          title="Alertes"
          action={
            <Button variant="text" onClick={() => setAlertsOpen(!alertsOpen)}>
              {alertsOpen ? "Réduire" : "Ouvrir le menu →"}
            </Button>
          }
        >
          <button className="alert-summary" onClick={() => setAlertsOpen(!alertsOpen)}>
            <strong>{openAlerts.length}</strong>
            <span>alertes sanitaires actives</span>
          </button>
          {alertsOpen && (
            <div className="alert-menu">
              {openAlerts.map((alert) => {
                const cat = snapshot.animals.find((candidate) => candidate.id === alert.animalId)!;
                return (
                  <article key={alert.id}>
                    <AnimalIdentity cat={cat} />
                    <span>
                      {alert.disease} · depuis le {formatDate(alert.declaredAt)}
                    </span>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() =>
                        void run(
                          () =>
                            window.catApp.resolveHealthAlert({
                              alertId: alert.id,
                              resolvedAt: localToday(),
                            }),
                          "Alerte sanitaire terminée.",
                        )
                      }
                    >
                      Terminer l'alerte
                    </Button>
                  </article>
                );
              })}
              {!openAlerts.length && <Empty text="Aucune alerte sanitaire active." />}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function CarePage({ snapshot, run }: PageProps) {
  const associationAnimalIds = new Set(
    snapshot.animalViews
      .filter((cat) => ["FOSTERED", "AT_REFUGE"].includes(cat.status))
      .map((cat) => cat.id),
  );
  const tasks = snapshot.tasks
    .filter((task) => task.status === "OPEN" && associationAnimalIds.has(task.animalId))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdue = tasks.filter((task) => task.dueDate <= localToday()).length;
  return (
    <div className="page-stack">
      <PageHeader>
        <p>Les prochaines actions à faire pour les animaux.</p>
        <span className="care-count">
          {tasks.length} rappel(s) · {overdue} à faire ou en retard
        </span>
      </PageHeader>
      <Panel title={`Rappels à faire · ${tasks.length}`}>
        <div className="table-wrap">
          <table className="adoption-table care-table">
            <thead>
              <tr>
                <th>Échéance</th>
                <th>Animal</th>
                <SpeciesTableHeader enabledSpecies={snapshot.settings.enabledSpecies} />
                <th>Rappel</th>
                <th>Détail</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const due = task.dueDate <= localToday();
                return (
                  <tr key={task.id}>
                    <td>
                      <Badge className={`care-status ${due ? "overdue" : "open"}`}>
                        {due
                          ? task.dueDate < localToday()
                            ? "En retard"
                            : "À faire aujourd’hui"
                          : "À venir"}
                      </Badge>
                      <span className="reminder-date">{formatDate(task.dueDate)}</span>
                    </td>
                    <td>
                      <AnimalIdentity
                        cat={snapshot.animals.find((cat) => cat.id === task.animalId)!}
                      />
                    </td>
                    <SpeciesTableCell
                      enabledSpecies={snapshot.settings.enabledSpecies}
                      speciesId={
                        snapshot.animals.find((animal) => animal.id === task.animalId)?.speciesId
                      }
                    />
                    <td>
                      <strong>{careTypeLabel(task.type)}</strong>
                    </td>
                    <td>{task.notes || "—"}</td>
                    <td>
                      <CareTaskAction task={task} run={run} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!tasks.length && <Empty text="Aucun rappel en attente." />}
      </Panel>
    </div>
  );
}

function CareTaskAction({
  task,
  run,
}: {
  task: AppSnapshot["tasks"][number];
  run: PageProps["run"];
}) {
  const [editing, setEditing] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextDueDate = String(data.get("nextDueDate"));
    void run(
      () =>
        window.catApp.completeTask({
          id: task.id,
          completedAt: String(data.get("completedAt")),
          nextDueDate: nextDueDate || undefined,
        }),
      "Soin enregistré dans l'historique.",
    ).then(() => setEditing(false));
  };
  if (!editing) {
    return (
      <Button
        variant="secondary"
        size="small"
        className="care-done-button"
        onClick={() => setEditing(true)}
      >
        Enregistrer le soin
      </Button>
    );
  }
  return (
    <form className="care-complete-form" data-density="compact" onSubmit={submit}>
      <Field label={<>Fait le</>}>
        <DateInput name="completedAt" defaultValue={localToday()} required />
      </Field>
      <Field label={<>Prochaine date</>}>
        <DateInput name="nextDueDate" />
      </Field>
      <Button variant="secondary" size="small" className="care-done-button">
        Valider
      </Button>
      <Button type="button" variant="text" onClick={() => setEditing(false)}>
        Annuler
      </Button>
    </form>
  );
}

function EmailPage({
  snapshot,
  initialAnimalId,
  setSnapshot,
  setNotice,
}: {
  snapshot: AppSnapshot;
  initialAnimalId: string;
  setSnapshot: (snapshot: AppSnapshot) => void;
  setNotice: (notice: Notice | null) => void;
}) {
  const [exporting, setExporting] = useState(false);
  const hasSterilization = snapshot.settings.enabledSpecies.some((speciesId) =>
    registeredSpecies
      .find((species) => species.id === speciesId)
      ?.careCategories.includes("STERILISATION"),
  );
  const icadAnimals = snapshot.animals.filter((animal) =>
    registeredSpecies
      .find((species) => species.id === animal.speciesId)
      ?.identificationSchemes.some((scheme) => scheme.id === "ICAD"),
  );
  const [kind, setKind] = useState(
    initialAnimalId ? "sponsorNews" : hasSterilization ? "sterilisation" : "association",
  );
  const [animalId, setAnimalId] = useState(initialAnimalId);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [photoLinks, setPhotoLinks] = useState("");
  const templates: Record<string, { subject: string; body: string }> = {
    sterilisation: {
      subject: "Rappel de stérilisation",
      body: "Bonjour,\\n\\nNous vous rappelons que la stérilisation de {animal} est à prévoir. Merci de nous tenir informés de la date du rendez-vous.\\n\\nL'association Cha'Mania",
    },
    icad: {
      subject: "Informations concernant ICAD",
      body: "Bonjour,\\n\\nNous vous contactons au sujet de l'identification ICAD de {animal}.\\n\\nL'association Cha'Mania",
    },
    association: {
      subject: "Les nouvelles de l'association",
      body: "Bonjour,\\n\\nVoici les dernières nouvelles de l'association Cha'Mania…",
    },
    sponsorNews: {
      subject: "Des nouvelles de {animal}",
      body: "Bonjour,\\n\\nVoici des nouvelles de {animal} :\\n\\n",
    },
  };
  const chosen = snapshot.animals.find((cat) => cat.id === animalId);
  const fill = (value: string) => value.replaceAll("{animal}", chosen?.name ?? "votre animal");
  const selectTemplate = (value: string) => {
    setKind(value);
    setSubject(templates[value].subject);
    setBody(templates[value].body);
  };
  useEffect(() => {
    selectTemplate(kind);
  }, [animalId]);
  const recipients =
    kind === "association"
      ? [...snapshot.families, ...snapshot.adopters]
          .map((contact) => contact.email)
          .filter(Boolean)
          .join(",")
      : kind === "sponsorNews"
        ? snapshot.sponsorships
            .filter((sponsor) => sponsor.animalId === animalId && !sponsor.endDate)
            .map((sponsor) => sponsor.email)
            .filter(Boolean)
            .join(",")
        : chosen
          ? [
              snapshot.families.find(
                (family) =>
                  family.id ===
                  snapshot.animalViews.find((cat) => cat.id === chosen.id)?.currentFamilyId,
              )?.email,
              ...snapshot.adopters
                .filter((a) =>
                  snapshot.adoptions.some(
                    (ad) => ad.animalId === chosen.id && ad.adopterId === a.id,
                  ),
                )
                .map((a) => a.email),
            ]
              .filter((email): email is string => Boolean(email))
              .join(",")
          : "";
  const photos = photoLinks
    .split(/\n|,/)
    .map((link) => link.trim())
    .filter(Boolean)
    .join("\n");
  const message = `${fill(body)}${kind === "sponsorNews" && photos ? `\n\nPhotos de ${chosen?.name ?? "votre animal"} :\n${photos}` : ""}`;
  const mailto = `mailto:${recipients}?subject=${encodeURIComponent(fill(subject))}&body=${encodeURIComponent(message)}`;
  return (
    <div className="page-stack">
      <PageHeader>
        <p>Rappels prêts à envoyer et messages liés aux animaux</p>
      </PageHeader>
      <Panel
        title={`Rappels prêts à envoyer (${snapshot.generatedEmails.filter((email) => !email.acknowledgedAt).length})`}
        action={
          <Button
            disabled={exporting || !snapshot.generatedEmails.some((email) => !email.acknowledgedAt)}
            onClick={async () => {
              try {
                setExporting(true);
                let current = snapshot;
                if (!current.emailOutputDirectory) {
                  const directory = await window.catApp.chooseEmailOutputDirectory();
                  if (!directory) {
                    return;
                  }
                  current = await window.catApp.setEmailOutputDirectory(directory);
                  setSnapshot(current);
                }
                const result = await window.catApp.exportReadyEmails();
                setSnapshot(result.snapshot);
                setNotice({
                  kind: "success",
                  text: `${result.exportedCount} e-mail(s) exporté(s) dans ${result.directory}.`,
                });
              } catch (error) {
                setNotice({ kind: "error", text: errorMessage(error) });
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? "Export…" : "Exporter les .eml"}
          </Button>
        }
      >
        <div className="email-output-setting">
          <span>Dossier : {snapshot.emailOutputDirectory || "à choisir"}</span>
          <Button
            variant="text"
            onClick={async () => {
              const directory = await window.catApp.chooseEmailOutputDirectory();
              if (directory) {
                setSnapshot(await window.catApp.setEmailOutputDirectory(directory));
              }
            }}
          >
            Choisir un dossier
          </Button>
        </div>
        {snapshot.generatedEmails.filter((email) => !email.acknowledgedAt).length === 0 ? (
          <Empty text="Aucun rappel prêt à envoyer." />
        ) : (
          <div className="email-queue">
            {snapshot.generatedEmails
              .filter((email) => !email.acknowledgedAt)
              .map((email) => (
                <article className="email-queue-item" key={email.id}>
                  <div>
                    <strong>{email.subject}</strong>
                    <span>
                      À {email.recipientName} · {email.recipient} ·{" "}
                      {snapshot.animals.find((animal) => animal.id === email.animalId)?.name}
                    </span>
                    <p>{email.body}</p>
                  </div>
                  <Button
                    size="small"
                    onClick={async () => {
                      try {
                        setSnapshot(await window.catApp.acknowledgeEmail(email.id));
                      } catch (error) {
                        setNotice({ kind: "error", text: errorMessage(error) });
                      }
                    }}
                  >
                    Marquer comme traité
                  </Button>
                </article>
              ))}
          </div>
        )}
      </Panel>
      <Panel title="Préparer un e-mail">
        <div className="form-grid">
          <Field label="Type de message">
            <select value={kind} onChange={(e) => selectTemplate(e.target.value)}>
              {hasSterilization && <option value="sterilisation">Rappel stérilisation</option>}
              {icadAnimals.length > 0 && (
                <option
                  value="icad"
                  disabled={Boolean(
                    chosen && !icadAnimals.some((animal) => animal.id === chosen.id),
                  )}
                >
                  Message ICAD
                </option>
              )}
              <option value="association">Newsletter association</option>
              <option value="sponsorNews">Nouvelles aux parrains</option>
            </select>
          </Field>
          <Field label="Animal concerné">
            <select value={animalId} onChange={(e) => setAnimalId(e.target.value)}>
              <option value="">Choisir</option>
              {snapshot.animals.map((cat) => (
                <option value={cat.id} key={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Objet">
            <input value={fill(subject)} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Destinataires">
            <input
              readOnly
              value={recipients}
              placeholder="À saisir dans votre logiciel de messagerie"
            />
          </Field>
          <Field label="Message" wide>
            <textarea rows={10} value={fill(body)} onChange={(e) => setBody(e.target.value)} />
          </Field>
          {kind === "sponsorNews" && (
            <Field label="Liens vers les photos" wide>
              <textarea
                rows={2}
                value={photoLinks}
                onChange={(e) => setPhotoLinks(e.target.value)}
                placeholder="Un lien par ligne ou ajoutez les photos dans votre e-mail"
              />
            </Field>
          )}
        </div>
        <p>
          Les messages s'ouvrent dans votre logiciel de messagerie. Relisez le texte et ajoutez les
          destinataires avant l'envoi.
        </p>
        <a className="button primary" href={mailto}>
          Ouvrir l'e-mail
        </a>
      </Panel>
    </div>
  );
}

function SponsorshipsPage({ snapshot, run }: PageProps) {
  const [showForm, setShowForm] = useState(false);
  const [contactRef, setContactRef] = useState("manual");
  const [confirmStopId, setConfirmStopId] = useState<string | null>(null);
  const contacts = [
    ...snapshot.families.map((person) => ({
      ref: `family:${person.id}`,
      label: `Famille · ${person.label}`,
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
    })),
    ...snapshot.adopters.map((person) => ({
      ref: `adopter:${person.id}`,
      label: `Adoptant · ${person.label}`,
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
    })),
  ];
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const existing = contacts.find((contact) => contact.ref === contactRef);
    void run(
      () =>
        window.catApp.createSponsorship({
          animalId: String(data.get("animalId")),
          firstName: existing?.firstName ?? String(data.get("firstName")),
          lastName: existing?.lastName ?? String(data.get("lastName")),
          email: existing?.email ?? String(data.get("email")),
          monthlyAmount: Number(data.get("monthlyAmount")),
          startDate: String(data.get("startDate")),
        }),
      "Parrainage enregistré.",
    ).then(() => setShowForm(false));
  };
  const active = snapshot.sponsorships.filter((item) => !item.endDate);
  const total = active.reduce((sum, item) => sum + item.monthlyAmount, 0);
  const stop = (item: AppSnapshot["sponsorships"][number]) =>
    void run(
      () => window.catApp.updateSponsorship({ ...item, endDate: localToday() }),
      "Parrainage arrêté.",
    ).then(() => setConfirmStopId(null));
  return (
    <div className="page-stack">
      <PageHeader>
        <div>
          <p>
            {active.length} parrainages actifs · {total.toFixed(2)} € par mois
          </p>
          <small className="sponsorship-subtitle">
            Suivi des parrains et des animaux parrainés
          </small>
        </div>
        <Button variant="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Fermer" : "+ Nouveau parrainage"}
        </Button>
      </PageHeader>
      {showForm && (
        <Panel title="Ajouter un parrainage">
          <form className="form-grid" onSubmit={submit}>
            <Field label="Animal *">
              <select name="animalId" required>
                <option value="">Choisir</option>
                {snapshot.animals
                  .filter(
                    (cat) =>
                      snapshot.animalViews.find((view) => view.id === cat.id)?.status !==
                      "DECEASED",
                  )
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Montant mensuel (€) *">
              <input type="number" step="0.01" min="0.01" name="monthlyAmount" required />
            </Field>
            <Field label="Parrain ou marraine déjà enregistré(e)">
              <select
                name="contactRef"
                value={contactRef}
                onChange={(event) => setContactRef(event.target.value)}
              >
                <option value="manual">Saisir une nouvelle personne</option>
                {contacts.map((contact) => (
                  <option key={contact.ref} value={contact.ref}>
                    {contact.label}
                  </option>
                ))}
              </select>
            </Field>
            {contactRef === "manual" && (
              <>
                <Field label="Prénom *">
                  <input name="firstName" required />
                </Field>
                <Field label="Nom *">
                  <input name="lastName" required />
                </Field>
                <Field label="E-mail">
                  <input type="email" name="email" />
                </Field>
              </>
            )}
            <Field label="Début *">
              <DateInput name="startDate" defaultValue={localToday()} required />
            </Field>
            <FormActions>
              <Button variant="primary">Enregistrer le parrainage</Button>
            </FormActions>
          </form>
        </Panel>
      )}
      <Panel title={`Parrainages · ${snapshot.sponsorships.length}`}>
        <div className="table-wrap">
          <table className="adoption-table sponsorship-table">
            <thead>
              <tr>
                <th>Animal</th>
                <SpeciesTableHeader enabledSpecies={snapshot.settings.enabledSpecies} />
                <th>Parrain / marraine</th>
                <th>Contact</th>
                <th>Mensuel</th>
                <th>Période</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.sponsorships.map((item) => {
                const cat = snapshot.animals.find((candidate) => candidate.id === item.animalId);
                return (
                  <tr key={item.id}>
                    <td>{cat ? <AnimalIdentity cat={cat} /> : "Animal inconnu"}</td>
                    <SpeciesTableCell
                      enabledSpecies={snapshot.settings.enabledSpecies}
                      speciesId={cat?.speciesId}
                    />
                    <td>
                      <strong>
                        {item.firstName} {item.lastName}
                      </strong>
                    </td>
                    <td>{item.email || "—"}</td>
                    <td>{item.monthlyAmount.toFixed(2)} €</td>
                    <td>
                      {formatDate(item.startDate)}
                      {item.endDate ? ` → ${formatDate(item.endDate)}` : " · actif"}
                    </td>
                    <td>
                      {item.endDate ? (
                        <Badge className="care-status">Arrêté</Badge>
                      ) : confirmStopId === item.id ? (
                        <div className="sponsorship-stop-confirm">
                          <Button variant="secondary" size="small" onClick={() => stop(item)}>
                            Confirmer
                          </Button>
                          <Button variant="text" onClick={() => setConfirmStopId(null)}>
                            Annuler
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="danger"
                          size="small"
                          className="sponsorship-stop"
                          onClick={() => setConfirmStopId(item.id)}
                        >
                          Arrêter le parrainage
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!snapshot.sponsorships.length && <Empty text="Aucun parrainage enregistré." />}
      </Panel>
    </div>
  );
}

function AnimalsPage({ snapshot, run }: PageProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AnimalStatus | "ALL">("ALL");
  const [sterilization, setSterilization] = useState<SterilizationStatus | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<AnimalSortField>("intakeDate");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [speciesFilter, setSpeciesFilter] = useState<SpeciesId | "ALL">("ALL");
  const [showForm, setShowForm] = useState(false);
  const showSterilization = snapshot.settings.enabledSpecies.some((speciesId) =>
    registeredSpecies
      .find((species) => species.id === speciesId)
      ?.careCategories.includes("STERILISATION"),
  );
  useEffect(
    () => setPage(1),
    [query, status, sterilization, sortBy, direction, pageSize, speciesFilter],
  );
  const filteredAnimals =
    speciesFilter === "ALL"
      ? snapshot.animalViews
      : snapshot.animalViews.filter((animal) => animal.speciesId === speciesFilter);
  const table = buildAnimalTable(filteredAnimals, snapshot.families, {
    query,
    status,
    sterilization,
    sortBy,
    direction,
    page,
    pageSize,
  });
  return (
    <div className="page-stack">
      <div className="registry-toolbar">
        <SearchField
          label="Rechercher un animal"
          placeholder={`${snapshot.animals.some((animal) => registeredSpecies.find((species) => species.id === animal.speciesId)?.identificationSchemes.some((scheme) => scheme.id === "ICAD")) ? "Nom, ICAD, " : "Nom, "}famille ou notes…`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button variant="primary" onClick={() => setShowForm(!showForm)}>
          {showForm
            ? "Fermer"
            : `+ Nouveau ${snapshot.settings.enabledSpecies.length === 1 ? registeredSpecies.find((species) => species.id === snapshot.settings.enabledSpecies[0])?.label.singular : "animal"}`}
        </Button>
      </div>
      <FilterBar label="Filtres du registre">
        <SpeciesFilter
          enabledSpecies={snapshot.settings.enabledSpecies}
          value={speciesFilter}
          onChange={setSpeciesFilter}
        />
        <Field label="Statut">
          <select
            value={status}
            onChange={(event) => setStatus(optionValue(event.target.value, STATUS_OPTIONS, "ALL"))}
          >
            <option value="ALL">Tous les statuts</option>
            {Object.entries(STATUS_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {showSterilization && (
          <Field label="Stérilisation">
            <select
              value={sterilization}
              onChange={(event) =>
                setSterilization(optionValue(event.target.value, STERILIZATION_FILTERS, "ALL"))
              }
            >
              <option value="ALL">Toute stérilisation</option>
              <option value="DONE">Stérilisé</option>
              <option value="TODO">À stériliser</option>
              <option value="UNKNOWN">Non renseigné</option>
            </select>
          </Field>
        )}
      </FilterBar>
      <div className="sort-toolbar" data-density="compact">
        <strong>
          {table.total} {table.total === 1 ? "animal" : "animaux"}
        </strong>
        <span>sur {snapshot.animals.length}</span>
        <Field label={<>Trier par </>}>
          <select
            value={sortBy}
            onChange={(event) =>
              setSortBy(optionValue(event.target.value, SORT_OPTIONS, "intakeDate"))
            }
          >
            <option value="intakeDate">Date d'arrivée</option>
            <option value="birthDate">Date de naissance</option>
            <option value="updatedAt">Dernière modification</option>
            <option value="name">Nom</option>
          </select>
        </Field>
        <Button
          variant="secondary"
          size="small"
          className="sort-direction"
          onClick={() => setDirection(direction === "asc" ? "desc" : "asc")}
        >
          {direction === "asc" ? "↑ Croissant" : "↓ Décroissant"}
        </Button>
      </div>
      {showForm && <AnimalForm snapshot={snapshot} run={run} done={() => setShowForm(false)} />}
      <section className="registry-table-panel">
        <div className="table-wrap">
          <table className="registry-table">
            <thead>
              <tr>
                <th>
                  {snapshot.settings.enabledSpecies.length > 1
                    ? "Animal"
                    : registeredSpecies.find(
                        (species) => species.id === snapshot.settings.enabledSpecies[0],
                      )?.label.singular}
                </th>
                <SpeciesTableHeader enabledSpecies={snapshot.settings.enabledSpecies} />
                <th>Statut</th>
                <th>Profil</th>
                {showSterilization && <th>Stérilisation</th>}
                <th>Adoptable</th>
                <th>Arrivée</th>
                <th>Lieu actuel</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((cat) => (
                <tr key={cat.id} className="clickable-row" onClick={() => openAnimal(cat.id)}>
                  <td>
                    <div className="cat-cell">
                      <div className="table-avatar">{cat.name.slice(0, 1).toUpperCase()}</div>
                      <AnimalIdentity cat={cat} />
                    </div>
                  </td>
                  <SpeciesTableCell
                    enabledSpecies={snapshot.settings.enabledSpecies}
                    speciesId={cat.speciesId}
                  />
                  <td>
                    <Badge className={`status ${cat.status.toLowerCase()}`}>
                      {STATUS_LABEL[cat.status]}
                    </Badge>
                  </td>
                  <td>{profileLabel(cat.speciesId, cat.profile)}</td>
                  {showSterilization && (
                    <td>
                      <Badge className={`sterilization ${cat.sterilizationStatus.toLowerCase()}`}>
                        {cat.sterilizationStatus === "DONE"
                          ? "Oui"
                          : cat.sterilizationStatus === "TODO"
                            ? "À faire"
                            : "Inconnu"}
                      </Badge>
                    </td>
                  )}
                  <td>
                    <Adoptability cat={cat} />
                  </td>
                  <td>{formatDate(cat.intakeDate)}</td>
                  <td>
                    <CurrentLocation cat={cat} snapshot={snapshot} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!table.rows.length && <Empty text="Aucun animal ne correspond à ces filtres." />}
        <div className="pagination" data-density="compact">
          <Field label={<>Afficher </>}>
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </Field>
          <span>
            Page {table.page} sur {table.pageCount}
          </span>
          <div>
            <Button
              variant="secondary"
              size="small"
              disabled={table.page <= 1}
              onClick={() => setPage(table.page - 1)}
            >
              ← Précédent
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={table.page >= table.pageCount}
              onClick={() => setPage(table.page + 1)}
            >
              Suivant →
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function HealthIssuePage({
  animalId,
  snapshot,
  run,
  setSnapshot,
  setNotice,
  back,
}: PageProps & {
  animalId: string;
  setSnapshot: (snapshot: AppSnapshot) => void;
  setNotice: (notice: Notice | null) => void;
  back: () => void;
}) {
  const cat = snapshot.animalViews.find((candidate) => candidate.id === animalId)!;
  const [exposures, setExposures] = useState<HealthExposure[]>([]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await window.catApp.declareSickness({
        animalId,
        disease: String(data.get("disease")),
        declaredAt: String(data.get("declaredAt")),
        lookbackDays: Number(data.get("lookbackDays")),
        notes: String(data.get("notes")),
      });
      setSnapshot(result.snapshot);
      setExposures(result.exposures);
      setNotice({
        kind: "success",
        text: `${result.exposures.length} contact(s) potentiel(s) retrouvé(s).`,
      });
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    }
  };
  return (
    <div className="page-stack health-issue-page">
      <PageHeader>
        <div>
          <p>Suivi sanitaire de {cat.name} et recherche des animaux potentiellement exposés.</p>
        </div>
        <Button variant="secondary" onClick={back}>
          ← Retour aux rappels
        </Button>
      </PageHeader>
      <Panel title={`Déclarer un problème de santé · ${cat.name}`}>
        <form className="form-grid" onSubmit={submit}>
          <Field label="Maladie ou suspicion">
            <input name="disease" required autoFocus />
          </Field>
          <Field label="Date">
            <DateInput name="declaredAt" required defaultValue={localToday()} />
          </Field>
          <Field label="Recherche de contacts (jours)">
            <input name="lookbackDays" type="number" min="0" max="365" defaultValue="14" />
          </Field>
          <Field label="Notes" wide>
            <input name="notes" />
          </Field>
          <FormActions>
            <Button variant="primary">Déclarer et rechercher les contacts</Button>
          </FormActions>
        </form>
        <p className="panel-intro">
          La recherche utilise les lieux et périodes de présence enregistrés pour cet animal.
        </p>
      </Panel>
      {exposures.length > 0 && (
        <Panel title="Animaux ayant partagé le même lieu">
          <div className="exposure-box">
            {exposures.map((item, index) => (
              <div key={`${item.animalId}-${index}`}>
                <b>{snapshot.animals.find((candidate) => candidate.id === item.animalId)?.name}</b>
                <span>
                  {item.locationLabel} · {formatDate(item.overlapStart)}–
                  {formatDate(item.overlapEnd)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function AnimalDetail({
  animalId,
  snapshot,
  close,
  goHealth,
  run,
  setSnapshot,
  setNotice,
  setEmailAnimalId,
  setPage,
}: PageProps & {
  animalId: string;
  close: () => void;
  goHealth: () => void;
  setSnapshot: (snapshot: AppSnapshot) => void;
  setNotice: (notice: Notice | null) => void;
  setEmailAnimalId: (animalId: string) => void;
  setPage: (page: Page) => void;
}) {
  const cat = snapshot.animalViews.find((candidate) => candidate.id === animalId)!;
  const speciesDefinition = registeredSpecies.find((species) => species.id === cat.speciesId)!;
  const [photo, setPhoto] = useState(cat.photo ?? "");
  const [speciesData, setSpeciesData] = useState<SpeciesData>(cat.speciesData);
  const [adoptionEligibility, setAdoptionEligibility] = useState(cat.adoptionEligibility);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);
  const [cropScale, setCropScale] = useState(75);
  const [cropOpen, setCropOpen] = useState(false);
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [historyWidth, setHistoryWidth] = useState(33);
  const events = snapshot.animalEvents
    .filter((event) => event.animalId === animalId && !["ADOPTED", "RETURNED"].includes(event.type))
    .map((event) => ({
      id: event.id,
      deletable: event.type === "NOTE_ADDED",
      date: event.date,
      title: event.type === "NOTE_ADDED" ? event.label || "Événement" : eventLabel(event.type),
      notes: event.notes,
    }));
  const placements = snapshot.fosterPlacements
    .filter((item) => item.animalId === animalId)
    .map((item) => ({
      id: undefined,
      deletable: false,
      date: item.startDate,
      title: `Accueil · ${snapshot.families.find((family) => family.id === item.familyId)?.label ?? "Famille"}`,
      notes: `${formatDate(item.startDate)} → ${formatDate(item.endDate)}${item.overrideReason ? ` · Dérogation: ${item.overrideReason}` : ""}`,
    }));
  const adoptions = snapshot.adoptions
    .filter((item) => item.animalId === animalId)
    .map((item) => ({
      id: undefined,
      deletable: false,
      date: item.adoptionDate,
      title: `Adoption · ${snapshot.adopters.find((adopter) => adopter.id === item.adopterId)?.label ?? "Adoptant"}`,
      notes: `${item.status === "ACTIVE" ? "Active" : `Retour le ${formatDate(item.endedAt)}`}${item.partner ? ` · ${item.partner}` : ""}`,
    }));
  const stays = snapshot.refugeStays
    .filter((item) => item.animalId === animalId)
    .map((item) => ({
      id: undefined,
      deletable: false,
      date: item.startDate,
      title: `Refuge · ${snapshot.refugeZones.find((zone) => zone.id === item.zoneId)?.name ?? "Zone"}`,
      notes: `${formatDate(item.startDate)} → ${formatDate(item.endDate)}${item.reason ? ` · ${item.reason}` : ""}`,
    }));
  const taskHistory = snapshot.tasks
    .filter((task) => task.animalId === animalId && task.status !== "CANCELLED")
    .map((task) => ({
      id: undefined,
      deletable: false,
      date: task.status === "DONE" ? task.completedAt || task.dueDate : task.dueDate,
      title:
        task.status === "DONE"
          ? `${careTypeLabel(task.type)} · effectué`
          : careTypeLabel(task.type),
      notes: task.notes,
    }));
  const history = [...events, ...placements, ...adoptions, ...stays, ...taskHistory].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const reminderDateFor = (kind: "vaccin" | "vermifuge" | "anti-puce" | "médicament") =>
    snapshot.tasks
      .filter(
        (task) =>
          task.animalId === animalId &&
          task.status === "OPEN" &&
          (kind === "anti-puce"
            ? task.type === "ANTI_PUCE" || task.type.toLowerCase().includes(kind)
            : task.type.toLowerCase().includes(kind)),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.dueDate;
  const saveAnimalProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const yesNo = (key: string) =>
      String(data.get(key)) === "unknown" ? null : String(data.get(key)) === "yes";
    void cropPhotoToSquare(photo, cropX, cropY, cropScale).then((savedPhoto) =>
      run(
        () =>
          window.catApp.updateAnimal({
            id: animalId,
            description: String(data.get("description")),
            photo: savedPhoto,
            compatibilityBySpecies: {
              ...cat.compatibilityBySpecies,
              ...Object.fromEntries(
                snapshot.settings.enabledSpecies.map((speciesId) => [speciesId, yesNo(speciesId)]),
              ),
            },
            speciesData,
            okWithChildren: yesNo("children"),
            medications: String(data.get("medications")),
            vaccines: String(data.get("vaccines")),
            deworming: String(data.get("deworming")),
            antiFlea: String(data.get("antiFlea")),
            adoptionEligibility,
            adoptionBlockedReason:
              adoptionEligibility === "INELIGIBLE"
                ? String(data.get("reason") ?? "")
                : adoptionEligibility === "ON_HOLD"
                  ? cat.adoptionBlockedReason
                  : "",
          }),
        "Fiche de l’animal mise à jour.",
      ),
    );
  };
  const readPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setNotice({ kind: "error", text: "Choisissez un fichier image." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotice({ kind: "error", text: "La photo doit faire moins de 5 Mo." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPendingPhoto(reader.result);
        setCropX(50);
        setCropY(50);
        setCropOpen(true);
      }
    };
    reader.onerror = () => setNotice({ kind: "error", text: "La photo n'a pas pu être lue." });
    reader.readAsDataURL(file);
  };
  const recordHistory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextDate = String(data.get("nextDate"));
    void run(
      () =>
        window.catApp.recordAnimalHistory({
          animalId,
          date: String(data.get("date")),
          title: String(data.get("title")),
          notes: String(data.get("notes")),
          nextDate: nextDate || undefined,
        }),
      "Événement ajouté.",
    ).then(() => setShowHistoryForm(false));
  };
  const hasActiveSupporter = snapshot.sponsorships.some(
    (item) => item.animalId === animalId && !item.endDate,
  );
  const openHealthPage = () => goHealth();
  return (
    <div className="drawer-backdrop" onMouseDown={close}>
      <aside className="drawer cat-detail-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <header className="cat-detail-header">
          <div className="detail-title">
            <div className="table-avatar large cat-detail-avatar">
              {photo ? (
                <img
                  src={photo}
                  alt={`Photo de ${cat.name}`}
                  style={{ "--photo-position": `${cropX}% ${cropY}%` } as CSSProperties}
                />
              ) : (
                cat.name.slice(0, 1)
              )}
            </div>
            <div>
              <Badge className={`status ${cat.status.toLowerCase()}`}>
                {STATUS_LABEL[cat.status]}
              </Badge>
              <h2 className="cat-name-icad">
                {cat.name}
                {cat.identificationNumber && (
                  <>
                    - {cat.identificationNumber}
                    <Button
                      variant="secondary"
                      size="icon"
                      type="button"
                      className="copy-icad"
                      title={
                        cat.identificationScheme === "ICAD"
                          ? "Copier le numéro ICAD"
                          : "Copier le numéro d'identification"
                      }
                      aria-label={
                        cat.identificationScheme === "ICAD"
                          ? "Copier le numéro ICAD"
                          : "Copier le numéro d'identification"
                      }
                      onClick={() => void navigator.clipboard.writeText(cat.identificationNumber)}
                    >
                      ▢
                    </Button>
                  </>
                )}
              </h2>
              <p>
                {cat.currentLocationLabel || "Sans lieu actuel"} ·{" "}
                {profileLabel(cat.speciesId, cat.profile)}
              </p>
            </div>
          </div>
          <div className="detail-header-actions">
            <Button variant="secondary" onClick={() => setShowHistoryForm(!showHistoryForm)}>
              {showHistoryForm ? "Fermer les événements" : "+ Événement"}
            </Button>
            <Button
              variant="primary"
              disabled={!hasActiveSupporter}
              title={!hasActiveSupporter ? "Cet animal n’a pas de parrain actif" : undefined}
              onClick={() => {
                setEmailAnimalId(animalId);
                close();
                setPage("email");
              }}
            >
              ✉ Donner des nouvelles
            </Button>
            <div className="cat-action-menu-wrap">
              <Button
                variant="secondary"
                aria-expanded={showActionMenu}
                onClick={() => setShowActionMenu(!showActionMenu)}
              >
                Actions ▾
              </Button>
              {showActionMenu && (
                <div className="cat-action-menu">
                  <button
                    onClick={() => {
                      setShowActionMenu(false);
                      openHealthPage();
                    }}
                  >
                    Déclarer un problème de santé
                  </button>
                  {cat.status !== "DECEASED" && (
                    <AnimalDeathAction
                      animalId={animalId}
                      catName={cat.name}
                      setSnapshot={setSnapshot}
                      onStart={() => setShowActionMenu(false)}
                    />
                  )}
                </div>
              )}
            </div>
            <Button
              variant="secondary"
              size="icon"
              className="drawer-close"
              onClick={close}
              aria-label="Fermer"
            >
              ×
            </Button>
          </div>
        </header>
        <p className="cat-birth-date">Né(e) le {formatDate(cat.birthDate)}</p>
        <div
          className="cat-detail-columns"
          style={
            {
              "--detail-main-width": `${100 - historyWidth}fr`,
              "--detail-history-width": `${historyWidth}fr`,
            } as CSSProperties
          }
        >
          <div className="cat-detail-main">
            <Panel title="Profil et besoins">
              <form className="form-grid cat-detail-form" onSubmit={saveAnimalProfile}>
                <SpeciesDetailsFields
                  speciesId={cat.speciesId}
                  value={speciesData}
                  onChange={setSpeciesData}
                  catalog={snapshot.settings.appearanceCatalog?.[cat.speciesId]}
                  animals={snapshot.animals}
                />
                <Field label="Description" wide>
                  <textarea
                    name="description"
                    rows={2}
                    defaultValue={cat.description}
                    placeholder="Caractère, habitudes, conseils"
                  />
                </Field>
                <Field label="Photo depuis votre ordinateur" wide>
                  <input type="file" accept="image/*" onChange={readPhoto} />
                  {photo && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="crop-open-button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setCropOpen(true);
                      }}
                    >
                      Recadrer la photo
                    </Button>
                  )}
                </Field>
                <AdoptabilityFields
                  value={adoptionEligibility}
                  onChange={setAdoptionEligibility}
                  reasonName="reason"
                  reason={cat.adoptionBlockedReason}
                />
                {snapshot.settings.enabledSpecies.length > 1 &&
                  snapshot.settings.enabledSpecies.map((speciesId) => {
                    const species = registeredSpecies.find((item) => item.id === speciesId)!;
                    return (
                      <CompatibilityChoices
                        key={speciesId}
                        name={speciesId}
                        label={`Avec les ${species.label.plural.toLocaleLowerCase("fr-FR")}`}
                        value={cat.compatibilityBySpecies[speciesId]}
                      />
                    );
                  })}
                <CompatibilityChoices
                  name="children"
                  label="Avec les enfants"
                  value={cat.okWithChildren}
                />
                <input type="hidden" name="medications" value={cat.medications || ""} />
                <input type="hidden" name="vaccines" value={cat.vaccines || ""} />
                <input type="hidden" name="deworming" value={cat.deworming || ""} />
                <input type="hidden" name="antiFlea" value={cat.antiFlea || ""} />
                <FormActions>
                  <Button variant="primary">Enregistrer la fiche</Button>
                </FormActions>
              </form>
            </Panel>
            <Panel
              title="Santé et soins"
              action={<HealthAction animalId={animalId} status={cat.healthStatus} run={run} />}
            >
              <div className="health-care-grid">
                <TreatmentAction
                  label="Médicaments"
                  field="medications"
                  value={cat.medications || ""}
                  schedule={cat.medicationSchedule || ""}
                  endDate={cat.medicationEndDate || ""}
                  reminderDate={reminderDateFor("médicament")}
                  animalId={animalId}
                  setSnapshot={setSnapshot}
                />
                {speciesDefinition.careCategories.includes("VACCIN") && (
                  <TreatmentAction
                    label="Vaccins"
                    field="vaccines"
                    value={cat.vaccines || ""}
                    reminderDate={
                      reminderDateFor("vaccin") || dateFromHealthMessage(cat.vaccines || "")
                    }
                    animalId={animalId}
                    setSnapshot={setSnapshot}
                  />
                )}
                {speciesDefinition.careCategories.includes("VERMIFUGE") && (
                  <TreatmentAction
                    label="Vermifuge"
                    field="deworming"
                    value={cat.deworming || ""}
                    reminderDate={
                      reminderDateFor("vermifuge") || dateFromHealthMessage(cat.deworming || "")
                    }
                    animalId={animalId}
                    setSnapshot={setSnapshot}
                  />
                )}
                {speciesDefinition.careCategories.includes("ANTI_PUCE") && (
                  <TreatmentAction
                    label="Anti-puce"
                    field="antiFlea"
                    value={cat.antiFlea || ""}
                    reminderDate={
                      reminderDateFor("anti-puce") || dateFromHealthMessage(cat.antiFlea || "")
                    }
                    animalId={animalId}
                    setSnapshot={setSnapshot}
                  />
                )}
              </div>
            </Panel>
          </div>
          <div
            className="column-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionner les événements"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (event.buttons !== 1) {
                return;
              }
              const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
              setHistoryWidth(
                Math.max(
                  25,
                  Math.min(50, Math.round(((bounds.right - event.clientX) / bounds.width) * 100)),
                ),
              );
            }}
          />
          <aside className="cat-history-sidebar">
            <div
              className={
                showHistoryForm ? "cat-history-content with-event-form" : "cat-history-content"
              }
            >
              {showHistoryForm && (
                <Panel title="Ajouter un événement">
                  <form className="form-grid" onSubmit={recordHistory}>
                    <Field label="Date">
                      <DateInput name="date" defaultValue={localToday()} required />
                    </Field>
                    <Field label="Événement / action">
                      <input
                        name="title"
                        required
                        placeholder="Visite vétérinaire, comportement…"
                      />
                    </Field>
                    <Field label="Prochaine échéance (facultatif)">
                      <DateInput name="nextDate" />
                    </Field>
                    <Field label="Notes" wide>
                      <textarea
                        name="notes"
                        rows={2}
                        placeholder="Ce qui s’est passé, résultat, détails utiles…"
                      />
                    </Field>
                    <FormActions>
                      <Button variant="secondary">Ajouter l’événement</Button>
                    </FormActions>
                  </form>
                  <p className="panel-intro">
                    Une prochaine échéance créera aussi un rappel dans les événements.
                  </p>
                </Panel>
              )}
              <Panel title="Événements">
                <div className="detail-history">
                  {history.map((item, index) => (
                    <div key={`${item.date}-${item.title}-${index}`}>
                      <time>{formatDate(item.date)}</time>
                      <span />
                      <p>
                        <strong>{item.title}</strong>
                        <small>{item.notes || "—"}</small>
                      </p>
                      {item.deletable && item.id && (
                        <Button
                          variant="danger"
                          size="icon"
                          title="Supprimer cet événement"
                          aria-label="Supprimer cet événement"
                          onClick={() => {
                            if (window.confirm("Supprimer cet événement ?")) {
                              void run(
                                () => window.catApp.deleteAnimalEvent(item.id!),
                                "Événement supprimé.",
                              );
                            }
                          }}
                        >
                          ×
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </aside>
        </div>
        {cropOpen && (
          <PhotoCropDialog
            photo={pendingPhoto ?? photo}
            initialX={cropX}
            initialY={cropY}
            initialScale={cropScale}
            cancel={() => {
              setCropOpen(false);
              setPendingPhoto(null);
            }}
            apply={(x, y, scale) => {
              if (pendingPhoto) {
                setPhoto(pendingPhoto);
              }
              setPendingPhoto(null);
              setCropX(x);
              setCropY(y);
              setCropScale(scale);
              setCropOpen(false);
            }}
          />
        )}
      </aside>
    </div>
  );
}

function dateFromHealthMessage(value: string): string | undefined {
  if (!/(rappel|prochain|prévu|prévue|renouveler|à faire)/i.test(value)) {
    return undefined;
  }
  const match = value.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (!match) {
    return undefined;
  }
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function AnimalDeathAction({
  animalId,
  catName,
  setSnapshot,
  onStart,
}: {
  animalId: string;
  catName: string;
  setSnapshot: (snapshot: AppSnapshot) => void;
  onStart?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const snapshot = await window.catApp.declareAnimalDeceased({
        animalId,
        date: String(data.get("date")),
        notes: String(data.get("notes")),
      });
      setSnapshot(snapshot);
      setOpen(false);
      onStart?.();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <>
      <button
        className="cat-action-menu-item danger"
        type="button"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Déclarer le décès
      </button>
      {open && (
        <div
          className="small-action-backdrop"
          onMouseDown={() => {
            setOpen(false);
            onStart?.();
          }}
        >
          <section className="small-action-panel" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Déclarer le décès de {catName}</h2>
            <p>Les parrainages actifs seront arrêtés à cette date.</p>
            <form className="stack-form" onSubmit={(event) => void submit(event)}>
              <Field label={<>Date du décès</>}>
                <DateInput name="date" defaultValue={localToday()} required />
              </Field>
              <Field label={<>Note (facultatif)</>}>
                <input name="notes" />
              </Field>
              {error && (
                <Callout tone="danger" role="alert">
                  {error}
                </Callout>
              )}
              <FormActions>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setOpen(false);
                    onStart?.();
                  }}
                >
                  Annuler
                </Button>
                <Button variant="danger">Confirmer le décès</Button>
              </FormActions>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function TreatmentAction({
  label,
  field,
  value,
  schedule = "",
  endDate = "",
  reminderDate,
  animalId,
  setSnapshot,
}: {
  label: string;
  field: "medications" | "vaccines" | "deworming" | "antiFlea";
  value: string;
  schedule?: string;
  endDate?: string;
  reminderDate?: string;
  animalId: string;
  setSnapshot: (snapshot: AppSnapshot) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [hours, setHours] = useState(schedule);
  const [until, setUntil] = useState(endDate);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [localError, setLocalError] = useState("");
  useEffect(() => {
    setText(value);
    setHours(schedule);
    setUntil(endDate);
  }, [value, schedule, endDate]);
  const activeMedication =
    field === "medications" &&
    Boolean(value.trim()) &&
    !/^(aucun|pas de) (médicament|traitement)/i.test(value.trim());
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const date = String(data.get("date") ?? "");
    const nextDate = String(data.get("nextDate") ?? "");
    if (nextDate && nextDate < date) {
      setLocalError("La prochaine date doit être égale ou postérieure à la date de l’action.");
      return;
    }
    setLocalError("");
    try {
      const update =
        field === "medications"
          ? { medications: text, medicationSchedule: hours, medicationEndDate: until }
          : { [field]: text };
      await window.catApp.updateAnimal({ id: animalId, ...update });
      const snapshot = await window.catApp.recordAnimalHistory({
        animalId,
        date,
        title: `${label} · ${text || "mise à jour"}`,
        notes:
          field === "medications"
            ? [hours && `Horaires : ${hours}`, until && `Jusqu'au ${formatDate(until)}`]
                .filter(Boolean)
                .join(" · ") || "Suivi de santé"
            : "Suivi de santé",
        nextDate: nextDate || undefined,
      });
      setSnapshot(snapshot);
      setOpen(false);
    } catch (error) {
      setLocalError(errorMessage(error));
    }
  };
  const dismissMedication = async () => {
    setLocalError("");
    try {
      await window.catApp.updateAnimal({
        id: animalId,
        medications: "",
        medicationSchedule: "",
        medicationEndDate: "",
      });
      const snapshot = await window.catApp.recordAnimalHistory({
        animalId,
        date: localToday(),
        title: "Médicament arrêté",
        notes: `${value} · le traitement n'est plus nécessaire.`,
      });
      setSnapshot(snapshot);
      setConfirmDismiss(false);
    } catch (error) {
      setLocalError(errorMessage(error));
    }
  };
  const isDue = Boolean(
    (reminderDate && reminderDate <= localToday()) ||
      (field === "medications" && endDate && endDate <= localToday()),
  );
  return (
    <>
      <div className="health-care-action">
        <button
          type="button"
          className={`health-care-card ${activeMedication ? "active-medication" : ""} ${isDue ? "due" : ""}`}
          onClick={() => {
            setLocalError("");
            setOpen(true);
          }}
        >
          <strong>{label}</strong>
          <span>
            {value ||
              (field === "medications"
                ? "Aucun traitement en cours"
                : "Aucune information renseignée")}
          </span>
          {field === "medications" && activeMedication && (
            <>
              {schedule && <small>Horaires : {schedule}</small>}
              {endDate && <small>Fin du traitement : {formatDate(endDate)}</small>}
              {reminderDate && <small>Prochaine prise : {formatDate(reminderDate)}</small>}
            </>
          )}
          {(field === "vaccines" || field === "deworming" || field === "antiFlea") &&
            reminderDate && <small>Prochaine date : {formatDate(reminderDate)}</small>}
        </button>
        {activeMedication && (
          <button
            type="button"
            className="medication-dismiss"
            aria-label="Arrêter ce médicament"
            title="Arrêter le médicament"
            onClick={() => {
              setLocalError("");
              setConfirmDismiss(true);
            }}
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <div className="small-action-backdrop" onMouseDown={() => setOpen(false)}>
          <section className="small-action-panel" onMouseDown={(event) => event.stopPropagation()}>
            <h2>{label} · suivi de santé</h2>
            <form className="stack-form" onSubmit={(event) => void save(event)}>
              <Field
                label={<>{field === "medications" ? "Médicament et dose" : "Message / état"}</>}
              >
                <input
                  autoFocus
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={
                    field === "medications"
                      ? "Ex. antibiotique · 1 comprimé"
                      : "Ajouter le message ou l'état"
                  }
                />
              </Field>
              {field === "medications" && (
                <>
                  <Field label={<>Heures et fréquence</>}>
                    <input
                      value={hours}
                      onChange={(event) => setHours(event.target.value)}
                      placeholder="Ex. 08:00 et 20:00"
                    />
                  </Field>
                  <Field label={<>Fin du traitement</>}>
                    <DateInput name="until" value={until} onChange={setUntil} />
                  </Field>
                </>
              )}
              <Field label={<>Date de l’action</>}>
                <DateInput name="date" defaultValue={localToday()} required />
              </Field>
              <Field
                label={
                  <>
                    {field === "medications"
                      ? "Prochaine prise (facultatif)"
                      : "Prochaine échéance (facultatif)"}
                  </>
                }
              >
                <DateInput name="nextDate" defaultValue={reminderDate} />
              </Field>
              {localError && (
                <Callout tone="danger" role="alert">
                  {localError}
                </Callout>
              )}
              <FormActions>
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button variant="primary">Enregistrer</Button>
              </FormActions>
            </form>
          </section>
        </div>
      )}
      {confirmDismiss && (
        <div className="small-action-backdrop" onMouseDown={() => setConfirmDismiss(false)}>
          <section
            className="small-action-panel medication-confirm"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2>Arrêter le médicament ?</h2>
            <p>
              Confirmer que « {value} » n’est plus nécessaire ? Le traitement sera retiré de la
              fiche et cette décision ajoutée à l’historique.
            </p>
            {localError && (
              <Callout tone="danger" role="alert">
                {localError}
              </Callout>
            )}
            <FormActions>
              <Button variant="secondary" onClick={() => setConfirmDismiss(false)}>
                Annuler
              </Button>
              <Button variant="primary" onClick={() => void dismissMedication()}>
                Confirmer l’arrêt
              </Button>
            </FormActions>
          </section>
        </div>
      )}
    </>
  );
}

function PhotoCropDialog({
  photo,
  initialX,
  initialY,
  initialScale,
  cancel,
  apply,
}: {
  photo: string;
  initialX: number;
  initialY: number;
  initialScale: number;
  cancel: () => void;
  apply: (x: number, y: number, scale: number) => void;
}) {
  const [x, setX] = useState(initialX);
  const [y, setY] = useState(initialY);
  const [scale, setScale] = useState(initialScale);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.buttons !== 1) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    setX(
      Math.max(
        0,
        Math.min(
          100,
          Math.round((((event.clientX - bounds.left) / bounds.width - 0.2) / 0.6) * 100),
        ),
      ),
    );
    setY(
      Math.max(
        0,
        Math.min(
          100,
          Math.round((((event.clientY - bounds.top) / bounds.height - 0.2) / 0.6) * 100),
        ),
      ),
    );
  };
  const circleSize = Math.round(scale * 0.64);
  const center = (value: number) => `${circleSize / 2 + (value * (100 - circleSize)) / 100}%`;
  return (
    <div className="photo-crop-backdrop" onMouseDown={cancel}>
      <section className="photo-crop-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <h2>Positionner la photo</h2>
        <p>Déplacez le cercle sur la partie de la photo à afficher, puis ajustez sa taille.</p>
        <div
          className="photo-crop-stage"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            move(event);
          }}
          onPointerMove={move}
        >
          <img src={photo} alt="Photo à recadrer" />
          <div
            className="photo-crop-circle"
            style={
              {
                "--crop-x": center(x),
                "--crop-y": center(y),
                "--crop-size": `${circleSize}%`,
              } as CSSProperties
            }
          />
        </div>
        <div className="crop-size-control">
          <span>Taille du cercle</span>
          <Button
            variant="secondary"
            aria-label="Réduire le cercle"
            disabled={scale <= 55}
            onClick={() => setScale(Math.max(55, scale - 5))}
          >
            −
          </Button>
          <output>{scale}%</output>
          <Button
            variant="secondary"
            aria-label="Agrandir le cercle"
            disabled={scale >= 100}
            onClick={() => setScale(Math.min(100, scale + 5))}
          >
            +
          </Button>
        </div>
        <FormActions>
          <Button variant="secondary" onClick={cancel}>
            Annuler
          </Button>
          <Button variant="primary" onClick={() => apply(x, y, scale)}>
            OK
          </Button>
        </FormActions>
      </section>
    </div>
  );
}

function HealthAction({
  animalId,
  status,
  run,
}: {
  animalId: string;
  status: "HEALTHY" | "SICK" | "RECOVERED";
  run: PageProps["run"];
}) {
  const [open, setOpen] = useState(false);
  const label = status === "SICK" ? "Malade" : status === "RECOVERED" ? "Rétabli" : "Sain";
  const update = (healthStatus: "HEALTHY" | "SICK" | "RECOVERED") => {
    void run(
      () => window.catApp.updateAnimal({ id: animalId, healthStatus }),
      "État de santé mis à jour.",
    ).then(() => setOpen(false));
  };
  return (
    <span className="health-fact-wrap">
      <button
        type="button"
        className="health-fact"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>État de santé</span>
        <strong>{label} ▾</strong>
      </button>
      {open && (
        <div className="health-action-popover">
          <strong>État de santé</strong>
          <button onClick={() => update("HEALTHY")}>Marquer sain</button>
          <button onClick={() => update("RECOVERED")}>Marquer rétabli</button>
          <button className="health-popover-close" onClick={() => setOpen(false)}>
            Fermer
          </button>
        </div>
      )}
    </span>
  );
}

async function cropPhotoToSquare(photo: string, x: number, y: number, scale = 75): Promise<string> {
  if (!photo.startsWith("data:image/")) {
    return photo;
  }
  const image = new Image();
  image.src = photo;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("La photo n'a pas pu être chargée."));
  });
  const side = (Math.min(image.naturalWidth, image.naturalHeight) * scale) / 100;
  const sourceX = ((image.naturalWidth - side) * x) / 100;
  const sourceY = ((image.naturalHeight - side) * y) / 100;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) {
    return photo;
  }
  context.drawImage(image, sourceX, sourceY, side, side, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

function CompatibilityChoices({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: boolean | null | undefined;
}) {
  const [choice, setChoice] = useState(value == null ? "unknown" : value ? "yes" : "no");
  const states = [
    { value: "yes", label: "✅ Oui" },
    { value: "no", label: "❌ Non" },
    { value: "unknown", label: "🤔 À tester" },
  ];
  const current = states.findIndex((state) => state.value === choice);
  return (
    <FieldGroup label={label} className="compatibility-field">
      <Button
        type="button"
        variant="secondary"
        className={`compatibility-cycle ${choice}`}
        aria-label={`${label} : ${states[current].label}. Cliquer pour changer`}
        onClick={() => setChoice(states[(current + 1) % states.length].value)}
      >
        {states[current].label} <small>↻</small>
      </Button>
      <input type="hidden" name={name} value={choice} />
    </FieldGroup>
  );
}

function AnimalForm({
  snapshot,
  run,
  done,
}: {
  snapshot: AppSnapshot;
  run: PageProps["run"];
  done: () => void;
}) {
  const [birthDate, setBirthDate] = useState("");
  const [speciesId, setSpeciesId] = useState<SpeciesId>(
    snapshot.settings.enabledSpecies[0] ?? "cat",
  );
  const [speciesData, setSpeciesData] = useState<SpeciesData>({});
  const [adoptionEligibility, setAdoptionEligibility] = useState<AdoptionEligibility>("UNKNOWN");
  const definition = registeredSpecies.find((species) => species.id === speciesId)!;
  const [profileChoice, setProfileChoice] = useState(() =>
    definition.deriveProfile ? "AUTO" : definition.defaultProfile,
  );
  const automaticProfile =
    definition.deriveProfile?.(birthDate, new Date()) ?? definition.defaultProfile;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(
      () =>
        window.catApp.createAnimal({
          name: String(data.get("name")),
          speciesId,
          speciesData,
          identificationNumber: String(data.get("identificationNumber")),
          birthDate: String(data.get("birthDate")),
          sex: formOption(data, "sex", SEX_OPTIONS, "UNKNOWN"),
          profile:
            profileChoice === "AUTO" && definition.deriveProfile
              ? automaticProfile
              : (profileChoice as AnimalProfile),
          sterilizationStatus: formOption(
            data,
            "sterilizationStatus",
            STERILIZATION_OPTIONS,
            "UNKNOWN",
          ),
          adoptionEligibility,
          adoptionBlockedReason:
            adoptionEligibility === "INELIGIBLE"
              ? String(data.get("adoptionBlockedReason") ?? "")
              : "",
          intakeDate: String(data.get("intakeDate")),
          notes: String(data.get("notes")),
        }),
      `Fiche de ${definition.label.singular} créée.`,
    ).then(done);
  };
  return (
    <Panel title={`Enregistrer ${definition.label.definiteSingular}`}>
      <form className="form-grid" onSubmit={submit}>
        <SpeciesSelector
          enabledSpecies={snapshot.settings.enabledSpecies}
          value={speciesId}
          onChange={(id) => {
            setSpeciesId(id);
            setSpeciesData({});
            const next = registeredSpecies.find((item) => item.id === id)!;
            setProfileChoice(next.deriveProfile ? "AUTO" : next.defaultProfile);
          }}
        />
        <SpeciesDetailsFields
          speciesId={speciesId}
          value={speciesData}
          onChange={setSpeciesData}
          catalog={snapshot.settings.appearanceCatalog?.[speciesId]}
          animals={snapshot.animals}
        />
        <Field label="Nom *">
          <input name="name" required />
        </Field>
        <Field
          label={
            definition.identificationSchemes.some((scheme) => scheme.id === "ICAD")
              ? "Numéro ICAD"
              : "Identifiant"
          }
        >
          <input name="identificationNumber" />
        </Field>
        <Field label="Date de naissance">
          <DateInput name="birthDate" onChange={setBirthDate} />
        </Field>
        <Field label="Sexe">
          <select name="sex">
            <option value="UNKNOWN">Inconnu</option>
            <option value="F">Femelle</option>
            <option value="M">Mâle</option>
          </select>
        </Field>
        <Field label="Catégorie d’âge">
          <select value={profileChoice} onChange={(event) => setProfileChoice(event.target.value)}>
            {definition.deriveProfile && (
              <option value="AUTO">
                Selon l’âge ·{" "}
                {definition.profiles.find((profile) => profile.id === automaticProfile)?.label}
              </option>
            )}
            {definition.profiles
              .filter((profile) => profile.id !== "SPECIAL_NEEDS")
              .map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
          </select>
        </Field>
        {definition.careCategories.includes("STERILISATION") && (
          <Field label="Stérilisation">
            <select name="sterilizationStatus">
              <option value="UNKNOWN">Non renseignée</option>
              <option value="TODO">À faire</option>
              <option value="DONE">Faite</option>
            </select>
          </Field>
        )}
        <AdoptabilityFields value={adoptionEligibility} onChange={setAdoptionEligibility} />
        <Field label="Date d'arrivée *">
          <DateInput name="intakeDate" defaultValue={localToday()} required />
        </Field>
        <Field label="Notes" wide>
          <textarea name="notes" rows={2} />
        </Field>
        <FormActions>
          <Button variant="primary">Enregistrer</Button>
        </FormActions>
      </form>
    </Panel>
  );
}

function FamiliesPage({ snapshot, run }: PageProps) {
  const [showForm, setShowForm] = useState(false);
  const [showPlacement, setShowPlacement] = useState(false);
  const [holidayFamilyId, setHolidayFamilyId] = useState("");
  const [holidayEditor, setHolidayEditor] = useState("");
  return (
    <div className="page-stack">
      <PageHeader>
        <p>{snapshot.families.length} familles d'accueil</p>
        <div className="heading-actions">
          <Button variant="secondary" onClick={() => setShowPlacement(!showPlacement)}>
            {showPlacement ? "Fermer l'accueil" : "+ Ajouter un animal à une famille"}
          </Button>
          <Button variant="primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Fermer" : "+ Nouvelle famille"}
          </Button>
        </div>
      </PageHeader>
      {showForm && <FamilyForm snapshot={snapshot} run={run} done={() => setShowForm(false)} />}{" "}
      {showPlacement && <PlacementsPage snapshot={snapshot} run={run} />}
      {holidayFamilyId && (
        <HolidayTransfers
          snapshot={snapshot}
          run={run}
          familyId={holidayFamilyId}
          close={() => setHolidayFamilyId("")}
        />
      )}
      <div className="family-grid">
        {snapshot.families.map((family) => {
          const animals = snapshot.animalViews.filter((cat) => cat.currentFamilyId === family.id);
          const holidays = snapshot.fosterFamilyHolidays.filter(
            (holiday) => holiday.familyId === family.id,
          );
          return (
            <article className="family-card" id={`family-${family.id}`} key={family.id}>
              <div className="family-card-head">
                <div>
                  <FamilyLink family={family} />
                  <span>
                    {family.firstName} {family.lastName}
                  </span>
                </div>
                <b className={animals.length >= family.maxCapacity ? "capacity-full" : ""}>
                  {animals.length}/{family.maxCapacity}
                </b>
              </div>
              <p>
                {family.email || "Pas d'e-mail"} · {family.phone || "Pas de téléphone"}
              </p>
              <div className="tag-row">
                {Object.entries(family.acceptanceRules ?? {}).flatMap(([speciesId, rule]) => {
                  const species = registeredSpecies.find((item) => item.id === speciesId);
                  if (!species || !rule) {
                    return [];
                  }
                  return rule.profiles.map((profile) => (
                    <Badge className="tag" key={`${speciesId}:${profile}`}>
                      {snapshot.settings.enabledSpecies.length > 1
                        ? `${species.label.plural} · `
                        : ""}
                      {species.profiles.find((item) => item.id === profile)?.label ?? profile}
                    </Badge>
                  ));
                })}
              </div>
              <div className="resident-list">
                <small>
                  {snapshot.settings.enabledSpecies.length > 1
                    ? "Animaux actuels"
                    : `${registeredSpecies.find((species) => species.id === snapshot.settings.enabledSpecies[0])?.label.plural} actuels`}
                </small>
                {animals.map((cat) => (
                  <AnimalIdentity key={cat.id} cat={cat} />
                ))}
                {!animals.length && <strong>Aucun</strong>}
              </div>
              {holidays.map((holiday) => (
                <div className="holiday" key={holiday.id}>
                  <span>
                    Indisponible {formatDate(holiday.startDate)}–{formatDate(holiday.endDate)}
                  </span>
                  {animals.length > 0 && (
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => setHolidayFamilyId(family.id)}
                    >
                      Déplacer les animaux
                    </Button>
                  )}
                  {holiday.endDate <= localToday() && (
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => setHolidayFamilyId(family.id)}
                    >
                      Animaux à faire revenir
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="text"
                onClick={() => setHolidayEditor(holidayEditor === family.id ? "" : family.id)}
              >
                + Ajouter une indisponibilité
              </Button>
              {holidayEditor === family.id && (
                <form
                  className="stack-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void run(
                      () =>
                        window.catApp.addFamilyHoliday({
                          familyId: family.id,
                          startDate: String(data.get("startDate")),
                          endDate: String(data.get("endDate")),
                        }),
                      "Indisponibilité ajoutée.",
                    ).then(() => setHolidayEditor(""));
                  }}
                >
                  <Field label="Début des vacances *">
                    <DateInput name="startDate" defaultValue={localToday()} required />
                  </Field>
                  <Field label="Fin des vacances *">
                    <DateInput name="endDate" defaultValue={localToday()} required />
                  </Field>
                  <FormActions>
                    <Button type="button" onClick={() => setHolidayEditor("")}>
                      Annuler
                    </Button>
                    <Button type="submit" variant="primary">
                      Enregistrer
                    </Button>
                  </FormActions>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function HolidayTransfers({
  snapshot,
  run,
  familyId,
  close,
}: PageProps & { familyId: string; close: () => void }) {
  const family = snapshot.families.find((candidate) => candidate.id === familyId)!;
  const holidays = snapshot.fosterFamilyHolidays.filter((holiday) => holiday.familyId === familyId);
  const current = snapshot.animalViews.filter((cat) => cat.currentFamilyId === familyId);
  const returningIds = new Set(
    snapshot.fosterPlacements
      .filter(
        (placement) =>
          placement.familyId === familyId &&
          placement.endDate &&
          holidays.some(
            (holiday) =>
              placement.endDate >= holiday.startDate && placement.endDate <= holiday.endDate,
          ),
      )
      .map((placement) => placement.animalId),
  );
  const returning = snapshot.animalViews.filter(
    (cat) =>
      returningIds.has(cat.id) &&
      cat.currentFamilyId !== familyId &&
      !["ADOPTED", "LOST", "DECEASED"].includes(cat.status),
  );
  const move = async (animalId: string, targetId: string, date: string) => {
    if (!targetId) {
      return;
    }
    const input = {
      animalId,
      familyId: targetId,
      startDate: date,
      notes: `Déplacement lié à l'indisponibilité de ${family.label}`,
    };
    const assessment = await window.catApp.assessPlacement(input);
    let overrideReason = "";
    if (assessment.warnings.length) {
      if (!window.confirm(`${assessment.warnings.join("\n")}\n\nContinuer ?`)) {
        return;
      }
      overrideReason = "Déplacement nécessaire pendant une indisponibilité";
    }
    await run(
      () =>
        window.catApp.startPlacement({
          ...input,
          overrideWarnings: assessment.warnings.length > 0,
          overrideReason,
        }),
      "Animal déplacé vers sa nouvelle famille.",
    );
  };
  return (
    <Panel
      title={`Organiser les mouvements · ${family.label}`}
      action={
        <Button variant="text" onClick={close}>
          Fermer
        </Button>
      }
    >
      <p className="panel-intro">
        Déplacez les animaux avant l'indisponibilité, puis affichez ceux qui peuvent revenir lorsque
        la période est terminée.
      </p>
      <div className="transfer-list">
        {current.map((cat) => (
          <TransferRow
            key={cat.id}
            cat={cat}
            families={snapshot.families.filter((candidate) => candidate.id !== familyId)}
            date={holidays.at(-1)?.startDate || localToday()}
            action="Déplacer"
            onMove={move}
          />
        ))}
        {returning.map((cat) => (
          <TransferRow
            key={`return-${cat.id}`}
            cat={cat}
            families={[family]}
            date={holidays.at(-1)?.endDate || localToday()}
            action="Faire revenir"
            onMove={move}
          />
        ))}
        {!current.length && !returning.length && (
          <Empty text="Aucun animal à déplacer ou à faire revenir." />
        )}
      </div>
    </Panel>
  );
}

function TransferRow({
  cat,
  families,
  date,
  action,
  onMove,
}: {
  cat: AppSnapshot["animalViews"][number];
  families: AppSnapshot["families"];
  date: string;
  action: string;
  onMove: (animalId: string, familyId: string, date: string) => Promise<void>;
}) {
  const [familyId, setFamilyId] = useState(families[0]?.id ?? "");
  return (
    <div className="transfer-row">
      <AnimalIdentity cat={cat} />
      <select value={familyId} onChange={(event) => setFamilyId(event.target.value)}>
        {families.map((family) => (
          <option value={family.id} key={family.id}>
            {family.label}
          </option>
        ))}
      </select>
      <Button variant="secondary" size="small" onClick={() => void onMove(cat.id, familyId, date)}>
        {action}
      </Button>
    </div>
  );
}

function FamilyForm({
  snapshot,
  run,
  done,
}: {
  snapshot: AppSnapshot;
  run: PageProps["run"];
  done: () => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(
      () =>
        window.catApp.createFamily({
          label: String(data.get("label")),
          courtesyTitle: String(data.get("courtesyTitle")),
          firstName: String(data.get("firstName")),
          lastName: String(data.get("lastName")),
          email: String(data.get("email")),
          phone: String(data.get("phone")),
          address: String(data.get("address")),
          maxCapacity: Number(data.get("maxCapacity")),
          acceptanceRules: Object.fromEntries(
            snapshot.settings.enabledSpecies.map((speciesId) => [
              speciesId,
              {
                profiles: data.getAll("profiles").flatMap((entry) => {
                  if (typeof entry !== "string") {
                    return [];
                  }
                  const [species, profile] = entry.split(":");
                  const supported = registeredSpecies
                    .find((item) => item.id === speciesId)
                    ?.profiles.some((item) => item.id === profile);
                  return species === speciesId && supported ? [profile as AnimalProfile] : [];
                }),
              },
            ]),
          ),
          notes: String(data.get("notes")),
        }),
      "Famille d'accueil enregistrée.",
    ).then(done);
  };
  return (
    <Panel title="Nouvelle famille d'accueil">
      <form className="form-grid" onSubmit={submit}>
        <Field label="Nom d'usage">
          <input name="label" placeholder="Ex. Famille des jeunes animaux" />
        </Field>
        <Field label="Prénom">
          <input name="firstName" />
        </Field>
        <Field label="Nom *">
          <input name="lastName" required />
        </Field>
        <Field label="E-mail">
          <input name="email" type="email" />
        </Field>
        <Field label="Téléphone">
          <input name="phone" />
        </Field>
        <Field label="Capacité maximale *">
          <input name="maxCapacity" type="number" min="1" defaultValue="3" required />
        </Field>
        <Field label="Adresse" wide>
          <input name="address" />
        </Field>
        <FieldGroup
          label={
            snapshot.settings.enabledSpecies.length > 1
              ? "Espèces et profils acceptés *"
              : "Profils acceptés *"
          }
          wide
        >
          <div className="checks profile-checks">
            {snapshot.settings.enabledSpecies.flatMap((speciesId) => {
              const species = registeredSpecies.find((item) => item.id === speciesId)!;
              return species.profiles.map((profile) => (
                <Checkbox
                  key={`${speciesId}:${profile.id}`}
                  name="profiles"
                  value={`${speciesId}:${profile.id}`}
                  defaultChecked={profile.id !== "BOTTLE_KITTEN"}
                >
                  {snapshot.settings.enabledSpecies.length > 1 ? `${species.label.plural} · ` : ""}
                  {profile.label}
                </Checkbox>
              ));
            })}
          </div>
        </FieldGroup>
        <Field label="Notes" wide>
          <textarea name="notes" rows={2} />
        </Field>
        <FormActions>
          <Button variant="primary">Enregistrer</Button>
        </FormActions>
      </form>
    </Panel>
  );
}

function PlacementsPage({ snapshot, run }: PageProps) {
  const candidates = snapshot.animalViews.filter((cat) =>
    ["FOSTERED", "AT_REFUGE"].includes(cat.status),
  );
  const [speciesFilter, setSpeciesFilter] = useState<SpeciesId | "ALL">("ALL");
  const visibleCandidates =
    speciesFilter === "ALL"
      ? candidates
      : candidates.filter((animal) => animal.speciesId === speciesFilter);
  const [animalId, setAnimalId] = useState("");
  const [showFull, setShowFull] = useState(false);
  const selectedAnimal = snapshot.animals.find((cat) => cat.id === animalId);
  const occupancy = (familyId: string) =>
    snapshot.fosterPlacements.filter(
      (placement) => placement.familyId === familyId && !placement.endDate,
    ).length;
  const visibleFamilies = snapshot.families.filter(
    (family) => showFull || occupancy(family.id) < family.maxCapacity,
  );
  const active = snapshot.fosterPlacements.filter((placement) => !placement.endDate);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = {
      animalId: String(data.get("animalId")),
      familyId: String(data.get("familyId")),
      startDate: String(data.get("startDate")),
      notes: String(data.get("notes")),
    };
    try {
      const assessment = await window.catApp.assessPlacement(input);
      if (!assessment.allowed) {
        throw new Error(assessment.warnings.join(" "));
      }
      let overrideReason = "";
      if (assessment.warnings.length) {
        if (
          !window.confirm(`${assessment.warnings.join("\n")}\n\nPlacer quand même cet animal ?`)
        ) {
          return;
        }
        overrideReason = window.prompt("Motif obligatoire de la dérogation") ?? "";
        if (!overrideReason.trim()) {
          return;
        }
      }
      await run(
        () =>
          window.catApp.startPlacement({
            ...input,
            overrideWarnings: assessment.warnings.length > 0,
            overrideReason,
          }),
        "Placement enregistré.",
      );
    } catch (error) {
      window.alert(errorMessage(error));
    }
  };
  const groups = snapshot.families
    .map((family) => ({ family, placements: active.filter((item) => item.familyId === family.id) }))
    .filter((group) => group.placements.length);
  return (
    <div className="page-stack">
      <div className="two-column">
        <Panel title="Ajouter un animal à une famille">
          <form className="stack-form" onSubmit={submit}>
            <Field label="Animal *">
              <select
                name="animalId"
                required
                value={animalId}
                onChange={(event) => setAnimalId(event.target.value)}
              >
                <option value="">Choisir un animal</option>
                {visibleCandidates.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </Field>
            {snapshot.settings.enabledSpecies.length > 1 && (
              <SpeciesFilter
                enabledSpecies={snapshot.settings.enabledSpecies}
                value={speciesFilter}
                onChange={setSpeciesFilter}
              />
            )}
            <Checkbox
              className="toggle-line"
              checked={showFull}
              onChange={(event) => setShowFull(event.target.checked)}
            >
              Afficher aussi les familles complètes
            </Checkbox>
            <Field label="Famille d'accueil *">
              <select name="familyId" required defaultValue="">
                <option value="">Choisir une famille</option>
                {visibleFamilies.map((family) => {
                  const rule = selectedAnimal && family.acceptanceRules?.[selectedAnimal.speciesId];
                  const mismatch =
                    selectedAnimal && (!rule || !rule.profiles.includes(selectedAnimal.profile));
                  return (
                    <option key={family.id} value={family.id}>
                      {family.label} · {occupancy(family.id)}/{family.maxCapacity}
                      {mismatch ? " · profil hors critères ⚠" : ""}
                    </option>
                  );
                })}
              </select>
            </Field>
            <Field label="Date *">
              <DateInput name="startDate" defaultValue={localToday()} required />
            </Field>
            <Field label="Notes">
              <textarea name="notes" rows={2} />
            </Field>
            <Button variant="primary" fullWidth>
              Commencer l'accueil
            </Button>
          </form>
        </Panel>
        <Panel title="Règles appliquées">
          <ul className="rule-list">
            <li>Les familles à capacité maximale sont masquées par défaut.</li>
            <li>Un profil non accepté déclenche une alerte.</li>
            <li>Les vacances à la date choisie déclenchent une alerte.</li>
            <li>Chaque dépassement reste possible avec un motif enregistré.</li>
          </ul>
        </Panel>
      </div>
      <Panel title={`Animaux par famille · ${active.length}`}>
        <div className="location-grid">
          {groups.map(({ family, placements }) => (
            <article className="location-card" key={family.id}>
              <div>
                <FamilyLink family={family} />
                <span>
                  {placements.length}/{family.maxCapacity}
                </span>
              </div>
              <div className="resident-records">
                {placements.map((placement) => {
                  const cat = snapshot.animals.find(
                    (candidate) => candidate.id === placement.animalId,
                  )!;
                  return (
                    <div key={placement.id}>
                      <AnimalIdentity cat={cat} />
                      <small>depuis {formatDate(placement.startDate)}</small>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() =>
                          void run(
                            () =>
                              window.catApp.endPlacement({
                                placementId: placement.id,
                                endDate: localToday(),
                                outcome: "Fin d'accueil",
                              }),
                            "Accueil terminé.",
                          )
                        }
                      >
                        Terminer
                      </Button>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function AdoptersPage({ snapshot, run }: PageProps) {
  const [showForm, setShowForm] = useState(false);
  return (
    <div className="page-stack">
      <PageHeader>
        <p>{snapshot.adopters.length} adoptants définitifs</p>
        <Button variant="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Fermer" : "+ Nouvel adoptant"}
        </Button>
      </PageHeader>
      {showForm && <AdopterForm run={run} done={() => setShowForm(false)} />}
      <Panel title="Répertoire des adoptants">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Adoptant</th>
                <th>Coordonnées</th>
                <th>Adresse</th>
                <th>Animaux adoptés</th>
                <th>Retours</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.adopters.map((adopter) => {
                const adoptions = snapshot.adoptions.filter(
                  (item) => item.adopterId === adopter.id,
                );
                return (
                  <tr key={adopter.id}>
                    <td>
                      <strong>{adopter.label}</strong>
                    </td>
                    <td>
                      {adopter.email || "—"}
                      <span>{adopter.phone}</span>
                    </td>
                    <td>{adopter.address || "—"}</td>
                    <td>
                      {adoptions
                        .map((item) => snapshot.animals.find((cat) => cat.id === item.animalId))
                        .filter((cat): cat is AppSnapshot["animals"][number] => Boolean(cat))
                        .map((cat) => (
                          <AnimalIdentity key={cat.id} cat={cat} />
                        ))}
                      {!adoptions.length && "—"}
                    </td>
                    <td>{adoptions.filter((item) => item.status === "RETURNED").length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function AdopterForm({ run, done }: { run: PageProps["run"]; done: () => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(
      () =>
        window.catApp.createAdopter({
          courtesyTitle: String(data.get("courtesyTitle")),
          firstName: String(data.get("firstName")),
          lastName: String(data.get("lastName")),
          email: String(data.get("email")),
          phone: String(data.get("phone")),
          address: String(data.get("address")),
          notes: String(data.get("notes")),
        }),
      "Adoptant enregistré.",
    ).then(done);
  };
  return (
    <Panel title="Nouvel adoptant définitif">
      <form className="form-grid" onSubmit={submit}>
        <Field label="Civilité">
          <select name="courtesyTitle">
            <option value="">—</option>
            <option>M</option>
            <option>Me</option>
          </select>
        </Field>
        <Field label="Prénom *">
          <input name="firstName" required />
        </Field>
        <Field label="Nom *">
          <input name="lastName" required />
        </Field>
        <Field label="E-mail">
          <input name="email" type="email" />
        </Field>
        <Field label="Téléphone">
          <input name="phone" />
        </Field>
        <Field label="Adresse" wide>
          <input name="address" />
        </Field>
        <Field label="Notes" wide>
          <textarea name="notes" rows={2} />
        </Field>
        <FormActions>
          <Button variant="primary">Enregistrer</Button>
        </FormActions>
      </form>
    </Panel>
  );
}

function AdoptionsPage({ snapshot, run }: PageProps) {
  const eligibleAnimals = snapshot.animalViews.filter((cat) =>
    ["FOSTERED", "AT_REFUGE"].includes(cat.status),
  );
  const [selectedAnimals, setSelectedAnimals] = useState<string[]>([]);
  const [catQuery, setAnimalQuery] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState<SpeciesId | "ALL">("ALL");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [showAdoptionForm, setShowAdoptionForm] = useState(false);
  const [sortMode, setSortMode] = useState<"date" | "animal">("date");
  const [showAdopters, setShowAdopters] = useState(false);
  const [fosterTemplateId, setFosterTemplateId] = useState("");
  const template = snapshot.families.find((family) => family.id === fosterTemplateId);
  const adoptionCandidates =
    speciesFilter === "ALL"
      ? eligibleAnimals
      : eligibleAnimals.filter((animal) => animal.speciesId === speciesFilter);
  const catSearch = searchAdoptionAnimals(adoptionCandidates, snapshot.families, catQuery, 10);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const selectedWarnings = selectedAnimals.flatMap((id) => {
      const cat = snapshot.animals.find((candidate) => candidate.id === id)!;
      return cat.adoptionEligibility === "ELIGIBLE"
        ? []
        : [`${cat.name}: ${cat.adoptionBlockedReason || "adoption non autorisée"}`];
    });
    if (
      selectedWarnings.length &&
      !window.confirm(
        `Attention :\n${selectedWarnings.join("\n")}\n\nEnregistrer quand même cette adoption ?`,
      )
    ) {
      return;
    }
    const adoption = {
      animalIds: selectedAnimals,
      adoptionDate: String(data.get("adoptionDate")),
      partner: String(data.get("partner")),
      adoptionDayId: String(data.get("adoptionDayId")),
      notes: String(data.get("notes")),
      overrideWarnings: selectedWarnings.length > 0,
    };
    const operation =
      mode === "new"
        ? () =>
            window.catApp.createAdoptionWithNewFamily({
              adoption,
              family: {
                firstName: String(data.get("firstName")),
                lastName: String(data.get("lastName")),
                email: String(data.get("email")),
                phone: String(data.get("phone")),
                address: String(data.get("address")),
                notes: fosterTemplateId
                  ? "Adoptant créé depuis une famille d'accueil."
                  : "Créé pendant l'adoption.",
              },
            })
        : () =>
            window.catApp.createAdoption({ ...adoption, adopterId: String(data.get("adopterId")) });
    void run(operation, "Adoption et contact définitif enregistrés.").then(() =>
      setSelectedAnimals([]),
    );
  };
  const all = [...snapshot.adoptions].sort((a, b) =>
    sortMode === "date"
      ? b.adoptionDate.localeCompare(a.adoptionDate)
      : (snapshot.animals.find((cat) => cat.id === a.animalId)?.name ?? "").localeCompare(
          snapshot.animals.find((cat) => cat.id === b.animalId)?.name ?? "",
          "fr",
        ) || b.adoptionDate.localeCompare(a.adoptionDate),
  );
  return (
    <div className="page-stack">
      <PageHeader>
        <p>Adoptions et contacts adoptants réunis</p>
        <div className="heading-actions">
          <Button variant="secondary" onClick={() => setShowAdopters(!showAdopters)}>
            {showAdopters ? "Masquer les adoptants" : `Adoptants (${snapshot.adopters.length})`}
          </Button>
          <Button variant="primary" onClick={() => setShowAdoptionForm(!showAdoptionForm)}>
            {showAdoptionForm ? "Fermer" : "+ Faire adopter un animal"}
          </Button>
        </div>
      </PageHeader>
      {showAdopters && <AdoptersPage snapshot={snapshot} run={run} />}{" "}
      {showAdoptionForm && (
        <Panel title="Enregistrer une adoption">
          <form className="adoption-form" onSubmit={submit}>
            <div className="stack-form">
              <FieldGroup label="Rechercher les animaux *">
                {snapshot.settings.enabledSpecies.length > 1 && (
                  <SpeciesFilter
                    enabledSpecies={snapshot.settings.enabledSpecies}
                    value={speciesFilter}
                    onChange={setSpeciesFilter}
                  />
                )}
                <div className="picker">
                  <div className="selected-items">
                    {selectedAnimals.map((id) => (
                      <Button
                        className="selection-chip"
                        variant="secondary"
                        size="small"
                        type="button"
                        key={id}
                        onClick={() =>
                          setSelectedAnimals(selectedAnimals.filter((value) => value !== id))
                        }
                      >
                        {snapshot.animals.find((cat) => cat.id === id)?.name} ×
                      </Button>
                    ))}
                  </div>
                  <SearchField
                    label="Rechercher un animal"
                    value={catQuery}
                    onChange={(event) => setAnimalQuery(event.target.value)}
                    placeholder={`${snapshot.animals.some((animal) => registeredSpecies.find((species) => species.id === animal.speciesId)?.identificationSchemes.some((scheme) => scheme.id === "ICAD")) ? "Nom, ICAD ou famille…" : "Nom ou famille…"}`}
                    trailing={<small>{catSearch.matches.length} résultat(s)</small>}
                  />
                  <div className="choice-list">
                    {catSearch.visible.map((cat) => (
                      <Checkbox
                        key={cat.id}
                        className={selectedAnimals.includes(cat.id) ? "chosen" : ""}
                        checked={selectedAnimals.includes(cat.id)}
                        onChange={(event) =>
                          setSelectedAnimals(
                            event.target.checked
                              ? [...selectedAnimals, cat.id]
                              : selectedAnimals.filter((id) => id !== cat.id),
                          )
                        }
                      >
                        <span className="mini-avatar">{cat.name[0]}</span>
                        <AnimalIdentity cat={cat} />
                        {animalWarnings(cat).length > 0 && (
                          <b title={animalWarnings(cat).join(" · ")}>⚠</b>
                        )}
                      </Checkbox>
                    ))}
                  </div>
                  {catSearch.matches.length > 10 && (
                    <small className="picker-hint">
                      10 résultats affichés; affinez la recherche pour les autres.
                    </small>
                  )}
                </div>
              </FieldGroup>
            </div>
            <div className="stack-form">
              <div className="adopter-tabs">
                <button
                  type="button"
                  className={mode === "existing" ? "active" : ""}
                  onClick={() => setMode("existing")}
                >
                  Adoptant connu
                </button>
                <button
                  type="button"
                  className={mode === "new" ? "active" : ""}
                  onClick={() => setMode("new")}
                >
                  Nouvel adoptant
                </button>
              </div>
              {mode === "existing" ? (
                <Field label="Adoptant définitif *">
                  <select name="adopterId" required defaultValue="">
                    <option value="">Choisir</option>
                    {snapshot.adopters.map((adopter) => (
                      <option key={adopter.id} value={adopter.id}>
                        {adopter.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <>
                  <Field label="Reprendre une famille d'accueil">
                    <select
                      value={fosterTemplateId}
                      onChange={(event) => setFosterTemplateId(event.target.value)}
                    >
                      <option value="">Saisie libre</option>
                      {snapshot.families.map((family) => (
                        <option value={family.id} key={family.id}>
                          {family.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="inline-fields">
                    <Field label="Prénom *">
                      <input
                        name="firstName"
                        required
                        defaultValue={template?.firstName}
                        key={`first-${template?.id}`}
                      />
                    </Field>
                    <Field label="Nom *">
                      <input
                        name="lastName"
                        required
                        defaultValue={template?.lastName}
                        key={`last-${template?.id}`}
                      />
                    </Field>
                  </div>
                  <Field label="E-mail">
                    <input
                      name="email"
                      type="email"
                      defaultValue={template?.email}
                      key={`email-${template?.id}`}
                    />
                  </Field>
                  <Field label="Téléphone">
                    <input
                      name="phone"
                      defaultValue={template?.phone}
                      key={`phone-${template?.id}`}
                    />
                  </Field>
                  <Field label="Adresse">
                    <input
                      name="address"
                      defaultValue={template?.address}
                      key={`address-${template?.id}`}
                    />
                  </Field>
                </>
              )}
              <div className="inline-fields">
                <Field label="Date *">
                  <DateInput name="adoptionDate" defaultValue={localToday()} required />
                </Field>
                <Field label="Journée associée">
                  <select name="adoptionDayId">
                    <option value="">Aucune</option>
                    {snapshot.adoptionDays.map((day) => (
                      <option value={day.id} key={day.id}>
                        {day.name} · {formatDate(day.startDate)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Lieu partenaire">
                <select name="partner">
                  <option value="">Aucun</option>
                  {snapshot.partnerPlaces.map((place) => (
                    <option key={place.id} value={place.name}>
                      {place.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Notes">
                <textarea name="notes" rows={2} />
              </Field>
              <Button variant="primary" fullWidth disabled={!selectedAnimals.length}>
                Confirmer l'adoption
              </Button>
            </div>
          </form>
        </Panel>
      )}
      <Panel
        title={`Suivi des adoptions · ${all.length}`}
        action={
          <label className="inline-control" data-density="compact">
            Lister par{" "}
            <select
              value={sortMode}
              onChange={(event) =>
                setSortMode(optionValue(event.target.value, ADOPTION_SORT_MODES, "date"))
              }
            >
              <option value="date">dernière date d'adoption</option>
              <option value="animal">animal</option>
            </select>
          </label>
        }
      >
        <AdoptionTable adoptions={all} snapshot={snapshot} run={run} />
      </Panel>
    </div>
  );
}

function AdoptionTable({
  adoptions,
  snapshot,
  run,
}: {
  adoptions: Adoption[];
  snapshot: AppSnapshot;
  run: PageProps["run"];
}) {
  return (
    <div className="table-wrap">
      <table className="adoption-table">
        <thead>
          <tr>
            <th>Animal</th>
            <SpeciesTableHeader enabledSpecies={snapshot.settings.enabledSpecies} />
            <th>État de l'animal</th>
            <th>Adoptant définitif</th>
            <th>Coordonnées</th>
            <th>Adoption</th>
            <th>Statut</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {adoptions.map((adoption) => {
            const cat = snapshot.animals.find((item) => item.id === adoption.animalId)!;
            const adopter = snapshot.adopters.find((item) => item.id === adoption.adopterId);
            const warnings = animalWarnings(cat);
            return (
              <tr key={adoption.id}>
                <td>
                  <AnimalIdentity cat={cat} />
                </td>
                <SpeciesTableCell
                  enabledSpecies={snapshot.settings.enabledSpecies}
                  speciesId={cat.speciesId}
                />
                <td>
                  {warnings.length ? (
                    <Badge className="warning-badge" title={warnings.join(" · ")}>
                      ⚠ {warnings.join(" · ")}
                    </Badge>
                  ) : (
                    <Badge className="ok-badge">Dossier OK</Badge>
                  )}
                </td>
                <td>
                  <strong>{adopter?.label ?? "Adoptant inconnu"}</strong>
                  <span>{adopter?.address}</span>
                </td>
                <td>
                  {adopter?.email || "—"}
                  <span>{adopter?.phone}</span>
                </td>
                <td>
                  {formatDate(adoption.adoptionDate)}
                  <span>{adoption.partner}</span>
                </td>
                <td>
                  <Badge
                    className={`status ${adoption.status === "ACTIVE" ? "adopted" : "returned"}`}
                  >
                    {adoption.status === "ACTIVE"
                      ? "Active"
                      : `Retour ${formatDate(adoption.endedAt)}`}
                  </Badge>
                </td>
                <td>
                  {adoption.status === "ACTIVE" && (
                    <Button
                      variant="danger"
                      size="small"
                      onClick={() => {
                        const notes = window.prompt("Motif du retour") ?? "";
                        const toRefuge = window.confirm(
                          "Envoyer directement ce animal au refuge ?",
                        );
                        void run(
                          () =>
                            window.catApp.returnAdoption({
                              adoptionId: adoption.id,
                              date: localToday(),
                              notes,
                              refugeZoneId: toRefuge ? snapshot.refugeZones[0]?.id : undefined,
                            }),
                          toRefuge
                            ? "Retour enregistré et animal envoyé au refuge."
                            : "Retour enregistré.",
                        );
                      }}
                    >
                      Retour
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AdoptionDaysPage({
  snapshot,
  run,
  setNotice,
}: PageProps & { setNotice: (notice: Notice | null) => void }) {
  const [selectedDayId, setSelectedDayId] = useState(snapshot.adoptionDays[0]?.id ?? "");
  const [suggestions, setSuggestions] = useState<AdoptionDaySuggestionGroup[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showPartners, setShowPartners] = useState(false);
  useEffect(() => {
    if (!selectedDayId) {
      setSuggestions([]);
      return;
    }
    window.catApp
      .getAdoptionDaySuggestions(selectedDayId)
      .then(setSuggestions)
      .catch((error) => setNotice({ kind: "error", text: errorMessage(error) }));
  }, [selectedDayId, snapshot.adoptionDayAnimals.length]);
  const add = (animalIds: string[]) =>
    void run(
      () => window.catApp.addAnimalsToAdoptionDay({ adoptionDayId: selectedDayId, animalIds }),
      `${animalIds.length} animal(aux) ajouté(s) à l'événement.`,
    );
  const selectedDay = snapshot.adoptionDays.find((day) => day.id === selectedDayId);
  const registered = snapshot.adoptionDayAnimals.filter(
    (item) => item.adoptionDayId === selectedDayId && item.status !== "WITHDRAWN",
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const partner = String(data.get("partner"));
    const startDate = String(data.get("startDate"));
    const endDate = String(data.get("endDate"));
    const name = `${partner || "Association"} · ${formatDate(startDate)}${endDate !== startDate ? `–${formatDate(endDate)}` : ""}`;
    void run(
      () =>
        window.catApp.createAdoptionDay({
          name,
          startDate,
          endDate,
          partner,
          location: String(data.get("location")),
          notes: String(data.get("notes")),
        }),
      "Événement d'adoption créé.",
    ).then(() => setShowForm(false));
  };
  return (
    <div className="page-stack">
      <PageHeader>
        <p>Événements, réservations et validations d'adoption</p>
        <div className="heading-actions">
          <Button variant="secondary" onClick={() => setShowPartners(!showPartners)}>
            Lieux partenaires
          </Button>
          <Button variant="primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Fermer" : "+ Créer un événement"}
          </Button>
        </div>
      </PageHeader>
      {showPartners && <PartnerPlaces snapshot={snapshot} run={run} />}{" "}
      {showForm && (
        <Panel title="Nouvelle journée / fête d'adoption">
          <form className="form-grid" onSubmit={submit}>
            <Field label="Lieu partenaire">
              <select name="partner">
                <option value="">Association</option>
                {snapshot.partnerPlaces.map((place) => (
                  <option value={place.name} key={place.id}>
                    {place.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Début *">
              <DateInput name="startDate" required />
            </Field>
            <Field label="Fin *">
              <DateInput name="endDate" required />
            </Field>
            <Field label="Emplacement précis">
              <input name="location" />
            </Field>
            <Field label="Notes">
              <input name="notes" />
            </Field>
            <FormActions>
              <Button variant="primary">Créer sous le nom « Partenaire · dates »</Button>
            </FormActions>
          </form>
        </Panel>
      )}
      <div className="event-tabs">
        {snapshot.adoptionDays.map((day) => (
          <button
            key={day.id}
            className={selectedDayId === day.id ? "active" : ""}
            onClick={() => setSelectedDayId(day.id)}
          >
            <strong>{day.name}</strong>
            <span>
              {formatDate(day.startDate)}
              {day.endDate !== day.startDate ? ` → ${formatDate(day.endDate)}` : ""}
            </span>
          </button>
        ))}
      </div>
      {selectedDay && (
        <>
          <section className="event-hero">
            <div>
              <span>{selectedDay.partner || "Événement association"}</span>
              <h2>{selectedDay.name}</h2>
              <p>
                {selectedDay.location} · {formatDate(selectedDay.startDate)} au{" "}
                {formatDate(selectedDay.endDate)}
              </p>
            </div>
            <strong>
              {registered.length}
              <small>animaux inscrits</small>
            </strong>
          </section>
          <div className="two-column event-columns">
            <Panel title="Suggestions par famille / zone">
              <div className="suggestion-groups">
                {suggestions.map((group) => (
                  <article key={`${group.locationType}-${group.locationId}`}>
                    <header>
                      <div>
                        <LocationHeading group={group} snapshot={snapshot} />
                        <span>{group.animals.length} animaux adoptables</span>
                      </div>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => add(group.animals.map((cat) => cat.animalId))}
                      >
                        + Tout le cheptel
                      </Button>
                    </header>
                    <div>
                      {group.animals.map((item) => {
                        const cat = snapshot.animalViews.find(
                          (candidate) => candidate.id === item.animalId,
                        )!;
                        return (
                          <button
                            className="suggested-cat"
                            key={item.animalId}
                            onClick={() => add([item.animalId])}
                          >
                            <AnimalIdentity cat={cat} />
                            {item.warnings.length > 0 && <b title={item.warnings.join(" · ")}>⚠</b>}
                            <i>+</i>
                          </button>
                        );
                      })}
                    </div>
                  </article>
                ))}
                {!suggestions.length && <Empty text="Aucune autre suggestion adoptable." />}
              </div>
            </Panel>
            <Panel title="Animaux prévus et réservations">
              <div className="registered-animals">
                {registered.map((item) => (
                  <AdoptionDayRegistration
                    key={item.id}
                    registration={item}
                    day={selectedDay}
                    snapshot={snapshot}
                    run={run}
                  />
                ))}
                {!registered.length && <Empty text="Ajoutez des animaux depuis les suggestions." />}
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function AdoptionDayRegistration({
  registration,
  day,
  snapshot,
  run,
}: {
  registration: AppSnapshot["adoptionDayAnimals"][number];
  day: AppSnapshot["adoptionDays"][number];
  snapshot: AppSnapshot;
  run: PageProps["run"];
}) {
  const cat = snapshot.animalViews.find((candidate) => candidate.id === registration.animalId)!;
  const [adopterId, setAdopterId] = useState(registration.adopterId || "");
  const bookedBy = snapshot.adopters.find((adopter) => adopter.id === registration.adopterId);
  const validatedAdopter =
    bookedBy ??
    snapshot.adopters.find(
      (adopter) =>
        adopter.id ===
        snapshot.adoptions.find(
          (adoption) => adoption.animalId === cat.id && adoption.adoptionDayId === day.id,
        )?.adopterId,
    );
  const reserve = () =>
    void run(
      () =>
        window.catApp.bookAnimalForAdoption({
          registrationId: registration.id,
          adopterId,
          bookedAt: localToday(),
        }),
      "Animal réservé pour cette famille.",
    );
  const validate = () =>
    registration.adopterId
      ? void run(
          () =>
            window.catApp.confirmAdoptionBooking({
              registrationId: registration.id,
              adoptionDate: localToday(),
            }),
          "Réservation confirmée : adoption validée.",
        )
      : void run(
          () =>
            window.catApp.createAdoption({
              animalIds: [cat.id],
              adopterId,
              adoptionDate: localToday(),
              adoptionDayId: day.id,
              partner: day.partner,
            }),
          "Adoption validée directement.",
        );
  if (registration.status === "ADOPTED") {
    return (
      <div className="registration-row">
        <span className="mini-avatar">{cat.name[0]}</span>
        <div>
          <AnimalIdentity cat={cat} />
          <b className="booking-badge">
            ✓ Adoption validée{validatedAdopter ? ` · ${validatedAdopter.label}` : ""}
          </b>
        </div>
      </div>
    );
  }
  return (
    <div className="registration-row">
      <span className="mini-avatar">{cat.name[0]}</span>
      <div>
        <AnimalIdentity cat={cat} />
        <small>{cat.currentLocationLabel || STATUS_LABEL[cat.status]}</small>
        {bookedBy && (
          <b className="booking-badge">
            Réservé par {bookedBy.label} le {formatDate(registration.bookedAt)}
          </b>
        )}
      </div>
      <div className="registration-actions" data-density="compact">
        <select value={adopterId} onChange={(event) => setAdopterId(event.target.value)}>
          <option value="">Choisir une famille adoptante</option>
          {snapshot.adopters.map((adopter) => (
            <option value={adopter.id} key={adopter.id}>
              {adopter.label}
            </option>
          ))}
        </select>
        {!registration.adopterId && (
          <Button variant="secondary" size="small" disabled={!adopterId} onClick={reserve}>
            Réserver
          </Button>
        )}
        <Button
          variant="primary"
          size="small"
          disabled={!adopterId && !registration.adopterId}
          onClick={validate}
        >
          {registration.adopterId ? "Confirmer la réservation" : "Valider l'adoption"}
        </Button>
        <Button
          variant="danger"
          size="icon"
          title="Retirer cet animal de la journée"
          onClick={() =>
            void run(
              () => window.catApp.withdrawAnimalFromAdoptionDay(registration.id),
              "Animal retiré de la journée d'adoption.",
            )
          }
        >
          ×
        </Button>
      </div>
    </div>
  );
}

function PartnerPlaces({ snapshot, run }: PageProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run(
      () =>
        window.catApp.createPartnerPlace({
          name: String(data.get("name")),
          address: String(data.get("address")),
          notes: String(data.get("notes")),
        }),
      "Lieu partenaire ajouté.",
    ).then(() => form.reset());
  };
  return (
    <Panel title="Lieux partenaires">
      <div className="partner-layout">
        <form className="stack-form" onSubmit={submit}>
          <Field label="Nom *">
            <input name="name" required />
          </Field>
          <Field label="Adresse">
            <input name="address" />
          </Field>
          <Field label="Notes">
            <input name="notes" />
          </Field>
          <Button variant="primary">+ Ajouter le lieu</Button>
        </form>
        <div className="partner-list">
          {snapshot.partnerPlaces.map((place) => (
            <article key={place.id}>
              <div>
                <strong>{place.name}</strong>
                <span>{place.address || "Adresse non renseignée"}</span>
              </div>
              <Button
                variant="danger"
                size="icon"
                title="Supprimer"
                onClick={() => {
                  if (window.confirm(`Supprimer ${place.name} de la liste ?`)) {
                    void run(
                      () => window.catApp.deletePartnerPlace(place.id),
                      "Lieu partenaire supprimé.",
                    );
                  }
                }}
              >
                ×
              </Button>
            </article>
          ))}
          {!snapshot.partnerPlaces.length && <Empty text="Aucun lieu partenaire enregistré." />}
        </div>
      </div>
    </Panel>
  );
}

function RefugePage({ snapshot, run }: PageProps) {
  const transferable = snapshot.animalViews.filter(
    (cat) => !["LOST", "DECEASED"].includes(cat.status),
  );
  const activeStays = snapshot.animalViews
    .filter((cat) => cat.status === "AT_REFUGE")
    .map(
      (cat) =>
        snapshot.refugeStays.find((stay) => stay.animalId === cat.id && !stay.endDate) ?? {
          id: `default-${cat.id}`,
          animalId: cat.id,
          zoneId: cat.currentRefugeZoneId || snapshot.refugeZones[0]?.id || "",
          startDate: cat.intakeDate,
          reason: "Présence au refuge",
        },
    );
  const [showMove, setShowMove] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [animalSpeciesFilter, setAnimalSpeciesFilter] = useState<SpeciesId | "ALL">("ALL");
  const [moveAnimalId, setMoveAnimalId] = useState("");
  const selectedMoveAnimal = snapshot.animals.find((animal) => animal.id === moveAnimalId);
  const visibleTransferable = transferable.filter(
    (animal) => animalSpeciesFilter === "ALL" || animal.speciesId === animalSpeciesFilter,
  );
  const compatibleZones = snapshot.refugeZones.filter(
    (zone) =>
      !selectedMoveAnimal ||
      zone.allowedSpecies === null ||
      zone.allowedSpecies.includes(selectedMoveAnimal.speciesId),
  );
  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(
      () =>
        window.catApp.sendToRefuge({
          animalId: String(data.get("animalId")),
          zoneId: String(data.get("zoneId")),
          date: String(data.get("date")),
          reason: String(data.get("reason")),
        }),
      "Animal envoyé au refuge.",
    );
  };
  return (
    <div className="page-stack">
      <section className="refuge-banner">
        <div>
          <span>Zones du refuge</span>
          <h2>Le refuge</h2>
          <p>Consultez directement chaque zone et les animaux présents.</p>
        </div>
        <div className="refuge-actions">
          <Button variant="light" onClick={() => setShowMove(!showMove)}>
            + Déplacer un animal
          </Button>
          <Button variant="ghost-light" onClick={() => setShowSettings(!showSettings)}>
            ⚙ Paramètres des zones
          </Button>
        </div>
        <strong>
          {activeStays.length}
          <small>animaux présents</small>
        </strong>
      </section>
      {showMove && (
        <Panel title="Envoyer ou changer de zone">
          <form className="move-form" onSubmit={send}>
            <Field label="Animal *">
              <select
                name="animalId"
                required
                value={moveAnimalId}
                onChange={(event) => setMoveAnimalId(event.target.value)}
              >
                <option value="">Choisir</option>
                {visibleTransferable.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                    {snapshot.settings.enabledSpecies.length > 1
                      ? ` · ${registeredSpecies.find((species) => species.id === cat.speciesId)?.label.singular}`
                      : ""}
                  </option>
                ))}
              </select>
            </Field>
            {snapshot.settings.enabledSpecies.length > 1 && (
              <SpeciesFilter
                enabledSpecies={snapshot.settings.enabledSpecies}
                value={animalSpeciesFilter}
                onChange={setAnimalSpeciesFilter}
              />
            )}
            <Field label="Zone *">
              <select name="zoneId" required>
                {compatibleZones.map((zone) => (
                  <option value={zone.id} key={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date *">
              <DateInput name="date" defaultValue={localToday()} required />
            </Field>
            <Field label="Motif">
              <input name="reason" placeholder="Retour, fin d'accueil, quarantaine…" />
            </Field>
            <Button variant="primary">Déplacer</Button>
          </form>
        </Panel>
      )}
      {showSettings && <RefugeSettings snapshot={snapshot} run={run} />}
      <div className="zone-grid">
        {snapshot.refugeZones.map((zone) => {
          const stays = activeStays.filter((stay) => stay.zoneId === zone.id);
          return (
            <article className="zone-card" key={zone.id} id={`refuge-zone-${zone.id}`}>
              <header>
                <div>
                  <strong>{zone.name}</strong>
                  <span>{zone.description}</span>
                </div>
                <b>{stays.length}</b>
              </header>
              <div>
                {stays.map((stay) => {
                  const cat = snapshot.animals.find((candidate) => candidate.id === stay.animalId)!;
                  return (
                    <p key={stay.id}>
                      <span className="mini-avatar">{cat.name[0]}</span>
                      <span>
                        <AnimalIdentity cat={cat} />
                        <small>
                          Depuis {formatDate(stay.startDate)} ·{" "}
                          {stay.reason || "Présence au refuge"}
                        </small>
                      </span>
                      {cat.healthStatus === "SICK" && <b className="warning-text">Malade</b>}
                    </p>
                  );
                })}
                {!stays.length && <Empty text="Zone vide." />}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function RefugeSettings({ snapshot, run }: PageProps) {
  const createZone = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run(
      () =>
        window.catApp.createRefugeZone({
          name: String(data.get("name")),
          description: String(data.get("description")),
          allowedSpecies:
            snapshot.settings.enabledSpecies.length > 1
              ? data
                  .getAll("allowedSpecies")
                  .filter(
                    (value): value is SpeciesId =>
                      typeof value === "string" &&
                      snapshot.settings.enabledSpecies.includes(value as SpeciesId),
                  )
              : undefined,
        }),
      "Zone créée.",
    ).then(() => form.reset());
  };
  return (
    <Panel title="Paramètres des zones">
      <div className="zone-settings">
        <form className="stack-form" onSubmit={createZone}>
          <Field label="Nouvelle zone *">
            <input name="name" required />
          </Field>
          <Field label="Description">
            <input name="description" />
          </Field>
          {snapshot.settings.enabledSpecies.length > 1 && (
            <FieldGroup label="Espèces acceptées *" wide>
              <div className="checks">
                {snapshot.settings.enabledSpecies.map((speciesId) => (
                  <Checkbox key={speciesId} name="allowedSpecies" value={speciesId} defaultChecked>
                    {registeredSpecies.find((species) => species.id === speciesId)?.label.plural}
                  </Checkbox>
                ))}
              </div>
            </FieldGroup>
          )}
          <Button variant="primary">+ Créer</Button>
        </form>
        <div>
          {snapshot.refugeZones.map((zone) => (
            <form
              key={zone.id}
              className="zone-setting-row"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void run(
                  () =>
                    window.catApp.updateRefugeZone({
                      id: zone.id,
                      name: String(data.get("name")),
                      description: String(data.get("description")),
                      allowedSpecies:
                        snapshot.settings.enabledSpecies.length > 1
                          ? data
                              .getAll("allowedSpecies")
                              .filter(
                                (value): value is SpeciesId =>
                                  typeof value === "string" &&
                                  snapshot.settings.enabledSpecies.includes(value as SpeciesId),
                              )
                          : undefined,
                    }),
                  "Zone modifiée.",
                );
              }}
            >
              <input name="name" defaultValue={zone.name} />
              <input name="description" defaultValue={zone.description} />
              {snapshot.settings.enabledSpecies.length > 1 && (
                <div className="checks">
                  {snapshot.settings.enabledSpecies.map((speciesId) => (
                    <Checkbox
                      key={speciesId}
                      name="allowedSpecies"
                      value={speciesId}
                      defaultChecked={
                        zone.allowedSpecies === null || zone.allowedSpecies.includes(speciesId)
                      }
                    >
                      {registeredSpecies.find((species) => species.id === speciesId)?.label.plural}
                    </Checkbox>
                  ))}
                </div>
              )}
              <Button variant="secondary" size="small">
                Modifier
              </Button>
              <Button
                type="button"
                variant="danger"
                size="icon"
                onClick={() => {
                  if (window.confirm(`Supprimer la zone ${zone.name} ?`)) {
                    void run(() => window.catApp.deleteRefugeZone(zone.id), "Zone supprimée.");
                  }
                }}
              >
                ×
              </Button>
            </form>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function ImportPage({
  snapshot,
  setSnapshot,
  setNotice,
}: {
  snapshot: AppSnapshot;
  setSnapshot: (snapshot: AppSnapshot) => void;
  setNotice: (notice: Notice | null) => void;
}) {
  const [preview, setPreview] = useState<LegacyImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      setBusy(true);
      setPreview(await window.catApp.chooseAndPreviewLegacyCsv());
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    if (!preview) {
      return;
    }
    try {
      setBusy(true);
      const outcome = await window.catApp.commitLegacyImport(preview);
      setSnapshot(outcome.snapshot);
      setNotice({
        kind: "success",
        text: `${outcome.result.importedAnimals} animaux, ${outcome.result.importedFamilies} familles et ${outcome.result.importedAdoptions} adoptions importés.`,
      });
      setPreview(null);
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };
  const issues = useMemo(() => preview?.rows.flatMap((row) => row.issues) ?? [], [preview]);
  return (
    <div className="page-stack">
      <section className="import-intro">
        <div className="import-icon">CSV</div>
        <div>
          <h2>Importer les anciennes adoptions</h2>
          <p>
            Les contacts du fichier deviennent des adoptants définitifs, séparés des familles
            d'accueil.
          </p>
        </div>
        <div className="import-actions">
          <Button variant="primary" disabled={busy} onClick={() => void load()}>
            Choisir un CSV
          </Button>
        </div>
      </section>
      {preview && (
        <>
          <section className="import-stats">
            <Metric label="Lignes" value={preview.rows.length} tone="ink" />
            <Metric
              label="Importables"
              value={preview.rows.filter((row) => row.importable).length}
              tone="sage"
            />
            <Metric label="Erreurs" value={preview.errorCount} tone="rose" />
            <Metric label="Avertissements" value={preview.warningCount} tone="amber" />
          </section>
          <Panel
            title="Diagnostic"
            action={
              <Button
                variant="primary"
                disabled={busy || !preview.rows.some((row) => row.importable)}
                onClick={() => void commit()}
              >
                Importer
              </Button>
            }
          >
            <p className="source-path">{preview.sourcePath}</p>
            <div className="issue-list">
              {issues.slice(0, 100).map((issue, index) => (
                <div
                  className={`issue ${issue.severity}`}
                  key={`${issue.rowNumber}-${issue.field}-${index}`}
                >
                  <span>{issue.severity === "error" ? "!" : "i"}</span>
                  <strong>Ligne {issue.rowNumber}</strong>
                  <code>{issue.field}</code>
                  <p>{issue.message}</p>
                </div>
              ))}
              {!issues.length && <Empty text="Aucun problème détecté." />}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <i />
    </article>
  );
}
function openAnimal(animalId: string) {
  window.dispatchEvent(new CustomEvent("cat:open", { detail: animalId }));
}
function openFamily(familyId: string) {
  window.dispatchEvent(new CustomEvent("family:open", { detail: familyId }));
}
function AnimalIdentity({
  cat,
}: {
  cat: Pick<AppSnapshot["animals"][number], "id" | "name" | "speciesId">;
}) {
  return (
    <RecordLink className="cat-identity cat-link" onActivate={() => openAnimal(cat.id)}>
      <strong>{cat.name}</strong>
    </RecordLink>
  );
}
function FamilyLink({ family }: { family: Pick<AppSnapshot["families"][number], "id" | "label"> }) {
  return (
    <RecordLink className="family-link" onActivate={() => openFamily(family.id)}>
      {family.label}
    </RecordLink>
  );
}
function RefugeLink({ zoneId = "", label = "Le refuge" }: { zoneId?: string; label?: string }) {
  return (
    <RecordLink
      className="family-link"
      onActivate={() => window.dispatchEvent(new CustomEvent("refuge:open", { detail: zoneId }))}
    >
      {label}
    </RecordLink>
  );
}
function LocationHeading({
  group,
  snapshot,
}: {
  group: AdoptionDaySuggestionGroup;
  snapshot: AppSnapshot;
}) {
  const family =
    group.locationType === "FAMILY"
      ? snapshot.families.find((candidate) => candidate.id === group.locationId)
      : undefined;
  return family ? <FamilyLink family={family} /> : <strong>{group.locationLabel}</strong>;
}
function CurrentLocation({
  cat,
  snapshot,
}: {
  cat: AppSnapshot["animalViews"][number];
  snapshot: AppSnapshot;
}) {
  const family = cat.currentFamilyId
    ? snapshot.families.find((candidate) => candidate.id === cat.currentFamilyId)
    : undefined;
  return family ? (
    <FamilyLink family={family} />
  ) : cat.status === "AT_REFUGE" ? (
    <RefugeLink zoneId={cat.currentRefugeZoneId} label={cat.currentLocationLabel || "Le refuge"} />
  ) : (
    <span>{cat.currentLocationLabel || "—"}</span>
  );
}
function Adoptability({
  cat,
}: {
  cat: Pick<AppSnapshot["animals"][number], "adoptionEligibility" | "adoptionBlockedReason">;
}) {
  const label =
    cat.adoptionEligibility === "ELIGIBLE"
      ? "Oui"
      : cat.adoptionEligibility === "INELIGIBLE"
        ? "Non"
        : "Inconnu";
  return (
    <span className="adoptability">
      <b className={cat.adoptionEligibility === "INELIGIBLE" ? "no" : ""}>{label}</b>
      {cat.adoptionBlockedReason && (
        <i
          className="info-tooltip"
          tabIndex={0}
          data-tooltip={cat.adoptionBlockedReason}
          aria-label={`Information : ${cat.adoptionBlockedReason}`}
        >
          i
        </i>
      )}
    </span>
  );
}
function SettingsPage({
  snapshot,
  setSnapshot,
  setNotice,
}: {
  snapshot: AppSnapshot;
  setSnapshot: (snapshot: AppSnapshot) => void;
  setNotice: (notice: Notice | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplates>(snapshot.emailTemplates);
  useEffect(() => setEmailTemplates(snapshot.emailTemplates), [snapshot.emailTemplates]);
  const update = async (speciesId: SpeciesId, checked: boolean) => {
    if (saving) {
      return;
    }
    const next = checked
      ? [...new Set([...snapshot.settings.enabledSpecies, speciesId])]
      : snapshot.settings.enabledSpecies.filter((species) => species !== speciesId);
    setSaving(true);
    try {
      setSnapshot(await window.catApp.setEnabledSpecies(next));
      setNotice({ kind: "success", text: "Espèces prises en charge mises à jour." });
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="page-stack settings-page">
      <PageHeader>
        <p>Personnalisez les espèces suivies dans ce registre.</p>
      </PageHeader>
      <Panel title="Espèces prises en charge">
        <p className="panel-intro" id="settings-species-description">
          Activez les espèces que votre association accueille. Avec une seule espèce, les listes et
          formulaires s'adaptent automatiquement.
        </p>
        {snapshot.demoMode && (
          <Callout tone="warning" id="settings-demo-description">
            En mode démo, chaque changement recrée les animaux de démonstration et remplace vos
            essais. Votre registre réel reste séparé.
          </Callout>
        )}
        <fieldset
          className="option-list"
          aria-label="Espèces prises en charge"
          aria-describedby={`settings-species-description${snapshot.demoMode ? " settings-demo-description" : ""}`}
          disabled={saving}
          aria-busy={saving}
        >
          {registeredSpecies.map((species) => {
            const enabled = snapshot.settings.enabledSpecies.includes(species.id);
            const count = snapshot.animals.filter(
              (animal) => animal.speciesId === species.id,
            ).length;
            const reason =
              enabled && count > 0
                ? `${count} ${count === 1 ? "animal enregistré" : "animaux enregistrés"}. Cette espèce reste active, même après adoption.`
                : enabled && snapshot.settings.enabledSpecies.length === 1
                  ? "Au moins une espèce doit rester active."
                  : "";
            return (
              <Checkbox
                key={species.id}
                layout="row"
                aria-label={species.label.plural}
                checked={enabled}
                disabled={Boolean(reason)}
                onChange={(event) => void update(species.id, event.target.checked)}
                description={
                  <span id={`settings-species-${species.id}-description`}>
                    {reason ||
                      (enabled
                        ? "Disponible dans les listes et formulaires du registre."
                        : "Activez cette espèce pour ajouter des animaux au registre.")}
                  </span>
                }
                trailing={
                  <Badge tone={enabled ? "success" : "neutral"}>
                    {count} {count === 1 ? "animal" : "animaux"}
                  </Badge>
                }
              >
                {species.label.plural}
              </Checkbox>
            );
          })}
        </fieldset>
        <p className="form-feedback" role="status">
          {saving
            ? "Enregistrement en cours…"
            : "Les modifications sont enregistrées automatiquement."}
        </p>
      </Panel>
      <Panel title="Modèles d’e-mails">
        <p className="panel-intro">
          Les messages sont créés automatiquement quand un soin approche. Variables disponibles :{" "}
          <code>{"{animal}"}</code>, <code>{"{contact}"}</code>, <code>{"{date}"}</code>.
        </p>
        <div className="form-grid">
          <Field label="Délai avant l’échéance (jours)">
            <input
              type="number"
              min={0}
              max={90}
              value={emailTemplates.leadDays}
              onChange={(event) =>
                setEmailTemplates({ ...emailTemplates, leadDays: Number(event.target.value) })
              }
            />
          </Field>
        </div>
        {(
          [
            ["sterilisation", "Stérilisation"],
            ["vaccination", "Vaccination"],
            ["antiFlea", "Antipuce"],
            ["deworming", "Vermifuge"],
            ["icad", "Changement ICAD après adoption"],
          ] as const
        ).map(([key, label]) => (
          <div className="email-template" key={key}>
            <h3>{label}</h3>
            <div className="form-grid">
              <Field label="Objet">
                <input
                  value={emailTemplates[key].subject}
                  onChange={(event) =>
                    setEmailTemplates({
                      ...emailTemplates,
                      [key]: { ...emailTemplates[key], subject: event.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Message" wide>
                <textarea
                  rows={5}
                  value={emailTemplates[key].body}
                  onChange={(event) =>
                    setEmailTemplates({
                      ...emailTemplates,
                      [key]: { ...emailTemplates[key], body: event.target.value },
                    })
                  }
                />
              </Field>
            </div>
          </div>
        ))}
        <FormActions>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                setSnapshot(await window.catApp.updateEmailTemplates(emailTemplates));
                setNotice({ kind: "success", text: "Modèles d’e-mails enregistrés." });
              } catch (error) {
                setNotice({ kind: "error", text: errorMessage(error) });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Enregistrement…" : "Enregistrer les modèles"}
          </Button>
        </FormActions>
      </Panel>
    </div>
  );
}

function eventLabel(type: AnimalEventType, label?: string): string {
  if (type === "NOTE_ADDED") {
    return label || "Note de suivi";
  }
  const labels: Record<Exclude<AnimalEventType, "NOTE_ADDED">, string> = {
    REGISTERED: "Enregistré",
    PLACED_IN_FOSTER: "Placé en famille d'accueil",
    FOSTER_ENDED: "Accueil terminé",
    SENT_TO_REFUGE: "Envoyé au refuge",
    REFUGE_ZONE_CHANGED: "Zone du refuge changée",
    LEFT_REFUGE: "Sortie du refuge",
    ADOPTED: "Adopté",
    RETURNED: "Retour d'adoption",
    LOST: "Déclaré perdu",
    DECEASED: "Déclaré décédé",
    TRANSFERRED: "Transféré",
    DECLARED_SICK: "Déclaré malade",
    RECOVERED: "Déclaré rétabli",
  };
  return labels[type];
}

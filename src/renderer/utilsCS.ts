import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { ensureSignedIn } from "../application/auth";
import {
  type Animal,
  type SpeciesId,
  AnimalInput,
  type AnimalUpdateInput,
  type LegacyAnimalCS,
 speciesCSEnum,
 type animalSpeciesCS,
 lookingForEnumCS,
 type LegacyDocExtrasCS,
 CS_COLLECTIONS,
 type SpeciesCS,
} from "../core/types";
import { db, storage } from "../firebase";
import { ref as sRef, uploadBytes } from "firebase/storage";


/**
 * Permet de récupérer le nom de la collection firebase à travers l'espece de l'animal
 * @param type  l'espece de l'animal
 * @returns le nom de la collection
 */
export const findFBCollectionName = (animalSpecies: SpeciesId): string => {
  return animalSpecies === "rabbit" ? "lapins" : `${animalSpecies}s`;
};

/**
 * Ajout ou modifie un document sur firebase
 * @param input les 'nouvelles' données à mettre à jour du 1er ou 2ème formulaire
 * @param animal les données non présente dans le 2ème formulaire
 * @returns 
 */
export const upsertAnimalToCS = async (
  input: AnimalInput | AnimalUpdateInput,
  animal : Animal | null = null,
): Promise<string | null> => {

  let mergedInput = input;
  if(animal){
    // Ajoute les infos manquantes du 2ème formulaire car sinon ça sera des valeurs par defaut
    mergedInput= {...animal, ...input }
  }
  if (!mergedInput.isAddedToCS || !mergedInput.speciesId) {
    return null
  };

   const collectionName = findFBCollectionName(mergedInput.speciesId);
   let animalRef = mergedInput.idCS
    ? doc(db, collectionName, mergedInput.idCS)
    : doc(collection(db, collectionName)); // créer ou récuprer l'id automatiquement, pas d'appel
  try {
    const user = await ensureSignedIn();
    const isCreation = !mergedInput.idCS;

    const images = await buildMedias({
      photos: mergedInput.photo ? [mergedInput.photo] : [],
      folderId: animalRef.id,
    });

  const data = toLegacy(toPublished(mergedInput), images, animalRef.id);

  await setDoc(
    animalRef,
    {
      ...data,
      ...(isCreation
        ? {
            ownerId: user.uid,
            // only on creation so the site's later statuses
            // (Reserve, Adopte...) are never overwritten
            type: [
              // todo : prendre plus de cas possible
              mergedInput.adoptionEligibility === "ELIGIBLE"
                ? lookingForEnumCS.Adopter
                : lookingForEnumCS.Reserve,
            ],
          }
        : {}),
    },
    { merge: true },
  );
}catch(error){
}

  return animalRef?.id;
};

type StoredAnimal = LegacyAnimalCS &
  Partial<Pick<LegacyDocExtrasCS, "birthdate" | "tookIn">>;

const LEGACY_TO_SPECIES: Record<animalSpeciesCS, SpeciesId> = {
  [speciesCSEnum.Chien]: "dog",
  [speciesCSEnum.Chat]: "cat",
  [speciesCSEnum.Lapin]: "rabbit",
  [speciesCSEnum.Serpent]: "snake",
};

/**
 * Map le doc firebase en un "Animal"
 * @param docId l'id du doc fb
 * @param data le doc fb
 * @returns Animal
 */
export const mapFirebaseToModel = (
  docId: string,
  data: StoredAnimal,
): Animal => {
  const sex =
    data.gender === "male" ? "M" : data.gender === "female" ? "F" : "UNKNOWN";

  const compatibilityBySpecies = {
    dog: data.compatibility?.chien ?? null,
    rabbit: data.compatibility?.lapin ?? null,
    cat: data.compatibility?.chat ?? null,
  };

  //todo: a changer
  const isEligible = data.type?.includes(lookingForEnumCS.Adopter) ?? false;

  return {
    id: "", // local id, filled by the caller when merging with the local record
    name: data.name ?? "",
    speciesId: LEGACY_TO_SPECIES[data.animal] ?? "dog",
    speciesData: {
      breed: data.race ?? "",
      specialNeeds: data.specificite ?? "",
    },

    identificationScheme: "NONE",
    identificationNumber: "",
    profile: "UNKNOWN",

    sex,
    // clean fields when present, otherwise empty (age / inShelter are free text)
    birthDate: firestoreTimestampToString(data.age) ?? "",
    intakeDate: firestoreTimestampToString(data.inShelter) ?? "",
    notes: data.specificite ?? "",
    description: data.description ?? "",
    photo: data.images?.[0] ?? "", // storage path, not a URL

    sterilizationStatus: "UNKNOWN",
    healthStatus: "HEALTHY",
    ///createdAt: new Date().toISOString(),
    //updatedAt: new Date().toISOString(),

    //todo: a changer
    adoptionEligibility: isEligible ? "ELIGIBLE" : "UNKNOWN",
    adoptionBlockedReason: "",

    compatibilityBySpecies,
    okWithChildren: data.compatibility?.enfant ?? null,

    isAddedToCS: true,
    idCS: docId, // the Firestore document ID, never a stored field
  };
};

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

function toDateString(date: Date): string | null {
  return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

export function firestoreTimestampToString(dateStr: string): string | null {
  if (!dateStr) {
    return null
  }

  // Already in YYYY-MM-DD format
  if (typeof dateStr === 'string') {
    if (DATE_ONLY_REGEX.test(dateStr)) {
      return dateStr
    }
    return toDateString(new Date(dateStr)) // e.g. a full ISO string
  }
  return null
}
/**
 * 
 * @param enabledSpecies  species that are enabled in settings
 * @returns animal list
 */
export const fetchAnimalsFromCS = async (enabledSpecies: readonly  SpeciesCS[] = CS_COLLECTIONS): Promise<Animal[]> => {
  const snaps = await Promise.all(
    enabledSpecies.map((name) => getDocs(collection(db, name))),
  );

  return snaps.flatMap((snap) =>
    snap.docs.map((d) => mapFirebaseToModel(d.id, d.data() as StoredAnimal)),
  );
};

const isLocalSrc = (src: string) =>
  src.startsWith("blob:") || src.startsWith("data:");

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
};

const srcToBlob = async (src: string): Promise<Blob> =>
  src.startsWith("data:") ? dataUrlToBlob(src) : (await fetch(src)).blob();

export const buildMedias = async ({
  photos = [],
  folderId,
}: {
  photos?: string[];
  folderId: string;
}): Promise<string[]> =>
  Promise.all(
    photos.map(async (src) => {
      if (!isLocalSrc(src)) return src; // already a storage path, keep it

      const blob = await srcToBlob(src);
      const ext = blob.type.split("/")[1] ?? "jpg";
      const path = `animals/${folderId}/${crypto.randomUUID()}.${ext}`;
      await uploadBytes(sRef(storage, path), blob, { contentType: blob.type });
      return path;
    }),
  );


  type PublishedAnimal = Pick<
  Animal,
  | "speciesId" | "name" | "sex" | "birthDate" | "intakeDate"
  | "description" | "speciesData" | "compatibilityBySpecies"
  | "okWithChildren" | "adoptionEligibility"
>;

export const toPublished = (a: AnimalInput | AnimalUpdateInput): PublishedAnimal => ({
  speciesId: a.speciesId!,
  name: a.name ?? "",
  sex: a.sex ?? "UNKNOWN",
  birthDate: a.birthDate ?? "",
  intakeDate: a.intakeDate ?? "",
  description: a.description ?? "",
  speciesData: a.speciesData ?? ({} as Animal["speciesData"]),
  compatibilityBySpecies: a.compatibilityBySpecies ?? {},
  okWithChildren: a.okWithChildren ?? null,
  adoptionEligibility: a.adoptionEligibility ?? "UNKNOWN",
});

 const SPECIES_TO_LEGACY: Record<SpeciesId, animalSpeciesCS> = {
  dog: speciesCSEnum.Chien,
  cat: speciesCSEnum.Chat,
  rabbit: speciesCSEnum.Lapin,
  snake: speciesCSEnum.Serpent,
};


export const toLegacy = (
  publishedAnimal: PublishedAnimal,
  images: string[],
  id: string,
): Omit<LegacyAnimalCS, "type"> & { idCS: string } => ({
  idCS: id,
  _id: id,
  name: publishedAnimal.name,
  animal: SPECIES_TO_LEGACY[publishedAnimal.speciesId as keyof typeof SPECIES_TO_LEGACY],
  race: "breed" in publishedAnimal.speciesData ? publishedAnimal.speciesData.breed ?? "" : "",
  gender: publishedAnimal.sex === "M" ? "male" : "female",
  specificite: publishedAnimal.speciesData?.specialNeeds ?? "",
  description: publishedAnimal.description ?? "",
  age: publishedAnimal.birthDate,
  inShelter: publishedAnimal.intakeDate,
  compatibility: {
    chien: publishedAnimal.compatibilityBySpecies.dog ?? null,
    lapin: publishedAnimal.compatibilityBySpecies.rabbit ?? null,
    chat: publishedAnimal.compatibilityBySpecies.cat ?? null,
    serpent: null,              // whatever extra keys it requires
    enfant: publishedAnimal.okWithChildren ?? null,
  },
  images,
  // additive clean fields, ignored by current prod readers
 // birthdate: p.birthDate,
  //tookIn: p.intakeDate,
});
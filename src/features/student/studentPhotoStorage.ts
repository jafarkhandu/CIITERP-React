/**
 * Browser-only photo cache, scoped by the authenticated student ID.
 * This is not a backend profile-photo upload.
 */
const DB_NAME = 'ciit-student-profile-photos';
const STORE_NAME = 'photos';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Photo storage is unavailable.'));
  });
}

export async function loadStudentPhoto(studentId: number): Promise<string | null> {
  if (!Number.isSafeInteger(studentId) || studentId <= 0) return null;

  const db = await openDatabase();
  try {
    const photo = await new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(studentId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });

    return typeof photo === 'string' ? photo : null;
  } finally {
    db.close();
  }
}

export async function saveStudentPhoto(studentId: number, photo: string): Promise<void> {
  if (!Number.isSafeInteger(studentId) || studentId <= 0) {
    throw new Error('A valid student ID is required to save a profile photo.');
  }

  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(photo, studentId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

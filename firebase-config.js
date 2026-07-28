// ==========================================================================
// KONFIGURASI FIREBASE — versi hemat Firestore Reads
// ==========================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyDVD2HB3Q_Ltp-zSIufgN7Ajq9MG2CvADQ",
  authDomain: "jemput-an-nashir-dda51.firebaseapp.com",
  projectId: "jemput-an-nashir-dda51",
  storageBucket: "jemput-an-nashir-dda51.firebasestorage.app",
  messagingSenderId: "709710168570",
  appId: "1:709710168570:web:7897c05cf175414aa0e443",
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, collection, onSnapshot, getDocs, query, where,
  doc, deleteDoc, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getFunctions, httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});

export const auth = getAuth(app);
const functions = getFunctions(app);

/*
 * ==========================================================================
 * ROSTER SISWA — CACHE LOKAL
 * ==========================================================================
 * Halaman orang tua tidak lagi memasang onSnapshot() ke students_public.
 * Daftar siswa diambil sekali lalu disimpan di localStorage selama TTL.
 *
 * Keuntungan:
 * - Tidak ada listener realtime untuk daftar siswa di setiap HP orang tua.
 * - Membuka ulang halaman tidak selalu membaca seluruh students_public.
 * - Admin tetap bisa memaksa refresh dengan forceRefresh = true.
 *
 * TTL default: 10 menit.
 * Jika sekolah sering menambah/mengubah siswa, kecilkan menjadi 5 menit.
 */
const ROSTER_CACHE_KEY = "an_nashir_students_public_v1";
const ROSTER_CACHE_TTL_MS = 10 * 60 * 1000;

export async function getRosterOnce({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(ROSTER_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (
          parsed &&
          Array.isArray(parsed.data) &&
          Number.isFinite(parsed.savedAt) &&
          Date.now() - parsed.savedAt < ROSTER_CACHE_TTL_MS
        ) {
          return parsed.data;
        }
      }
    } catch (e) {
      console.warn("Roster cache tidak dapat digunakan:", e);
    }
  }

  const snap = await getDocs(collection(db, "students_public"));
  const roster = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  try {
    localStorage.setItem(
      ROSTER_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), data: roster })
    );
  } catch (e) {
    console.warn("Roster gagal disimpan ke cache:", e);
  }

  return roster;
}

/*
 * Listener roster tetap tersedia untuk halaman admin lama.
 * JANGAN gunakan fungsi ini di halaman orang tua jika tidak diperlukan.
 */
export function listenRoster(onChange) {
  return onSnapshot(collection(db, "students_public"), (snap) => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

/*
 * ==========================================================================
 * ANTREAN — LISTENER SATU DOKUMEN SAJA
 * ==========================================================================
 * Untuk halaman orang tua, gunakan queueId yang dikembalikan oleh
 * submitPickup(). Jangan mendengarkan seluruh collection "queue".
 *
 * Ini adalah perubahan utama untuk mengurangi Firestore Reads.
 */
export function listenQueueEntry(queueId, onChange) {
  if (!queueId) return () => {};

  return onSnapshot(doc(db, "queue", queueId), (snap) => {
    onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

/*
 * Listener seluruh antrean hari ini tetap tersedia untuk DASHBOARD GURU.
 * Jangan gunakan fungsi ini untuk halaman orang tua.
 */
export function listenQueue(onChange) {
  const todayStr = new Date().toISOString().split("T")[0];
  const q = query(collection(db, "queue"), where("date", "==", todayStr));

  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

/* ---------- guru: tandai siswa sudah dipanggil keluar ---------- */
export async function markCalled(entryId) {
  await updateDoc(doc(db, "queue", entryId), {
    status: "called",
    calledAt: serverTimestamp(),
  });
}

/* ---------- guru: tandai selesai diserahkan -> hapus dari papan ---------- */
export async function markPickupDone(entryId) {
  await deleteDoc(doc(db, "queue", entryId));
}

/* ---------- orang tua: kirim permintaan jemput ---------- */
const requestPickupFn = httpsCallable(functions, "requestPickup");
export async function submitPickup(studentId, pin, pickerName, coords) {
  const res = await requestPickupFn({
    studentId,
    pin,
    pickerName,
    lat: coords?.latitude,
    lng: coords?.longitude,
    accuracy: coords?.accuracy,
  });
  return res.data;
}

/* ---------- orang tua: ganti PIN keluarga sendiri ---------- */
const changeFamilyPinFn = httpsCallable(functions, "changeFamilyPin");
export async function changeFamilyPin(studentId, currentPin, newPin, coords) {
  const res = await changeFamilyPinFn({
    studentId,
    currentPin,
    newPin,
    lat: coords?.latitude,
    lng: coords?.longitude,
    accuracy: coords?.accuracy,
  });
  return res.data;
}

/* ---------- admin: login & sesi ---------- */
export function adminLogin(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function adminLogout() {
  return signOut(auth);
}

export function watchAdminSession(callback) {
  return onAuthStateChanged(auth, (user) => callback(user));
}

export function resetAdminPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

/* ---------- admin: kelola siswa ---------- */
const addStudentFn = httpsCallable(functions, "adminAddStudent");
const updatePinFn = httpsCallable(functions, "adminUpdateStudentPin");
const deleteStudentFn = httpsCallable(functions, "adminDeleteStudent");

function clearRosterCache() {
  try {
    localStorage.removeItem(ROSTER_CACHE_KEY);
  } catch (e) {
    console.warn("Roster cache gagal dihapus:", e);
  }
}

export async function addStudent(name, cls, pin) {
  const result = (await addStudentFn({ name, class: cls, pin })).data;
  clearRosterCache();
  return result;
}

export async function updateStudentPin(studentId, newPin) {
  return (await updatePinFn({ studentId, newPin })).data;
}

export async function deleteStudent(studentId) {
  const result = (await deleteStudentFn({ studentId })).data;
  clearRosterCache();
  return result;
}

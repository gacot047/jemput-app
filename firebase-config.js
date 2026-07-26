// ==========================================================================
// KONFIGURASI FIREBASE — isi 6 baris di bawah ini dengan nilai dari
// Firebase Console > Project settings > Your apps > Web app > SDK setup.
// Lihat README.md di folder jemput-backend untuk langkah lengkapnya.
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
  initializeFirestore, collection, onSnapshot,
  doc, deleteDoc, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getFunctions, httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp(firebaseConfig);

// Memaksa Firestore menggunakan long-polling murni dan mematikan Fetch Streams
// agar tidak terkena error WebChannel (400/404) akibat pembatasan jaringan/firewall.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});

export const auth = getAuth(app);
const functions = getFunctions(app);

/* ---------- roster: dengar daftar siswa secara real-time ---------- */
export function listenRoster(onChange) {
  return onSnapshot(collection(db, "students_public"), (snap) => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

/* ---------- antrean penjemputan: dengar seluruh antrean (untuk Layar Kelas) ---------- */
export function listenQueue(onChange) {
  return onSnapshot(collection(db, "queue"), (snap) => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

/* ---------- antrean penjemputan: dengar SATU entri (untuk status di HP orang tua) ---------- */
export function listenQueueEntry(queueId, onChange) {
  return onSnapshot(doc(db, "queue", queueId), (snap) => {
    onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

/* ---------- guru: tandai siswa sudah dipanggil keluar (belum selesai diserahkan) ---------- */
export async function markCalled(entryId) {
  await updateDoc(doc(db, "queue", entryId), { status: "called", calledAt: serverTimestamp() });
}

/* ---------- guru: tandai selesai diserahkan -> hapus dari papan ---------- */
export async function markPickupDone(entryId) {
  await deleteDoc(doc(db, "queue", entryId));
}

/* ---------- orang tua: kirim permintaan jemput ---------- */
const requestPickupFn = httpsCallable(functions, "requestPickup");
export async function submitPickup(studentId, pin, pickerName, coords) {
  const res = await requestPickupFn({
    studentId, pin, pickerName,
    lat: coords?.latitude, lng: coords?.longitude, accuracy: coords?.accuracy,
  });
  return res.data; // { ok, reason?, attemptsLeft? }
}

/* ---------- orang tua: ganti PIN keluarga sendiri (butuh PIN lama) ---------- */
const changeFamilyPinFn = httpsCallable(functions, "changeFamilyPin");
export async function changeFamilyPin(studentId, currentPin, newPin, coords) {
  const res = await changeFamilyPinFn({
    studentId, currentPin, newPin,
    lat: coords?.latitude, lng: coords?.longitude, accuracy: coords?.accuracy,
  });
  return res.data; // { ok, reason?, attemptsLeft? }
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

/* ---------- admin: kelola siswa (lewat Cloud Function, butuh login) ---------- */
const addStudentFn = httpsCallable(functions, "adminAddStudent");
const updatePinFn = httpsCallable(functions, "adminUpdateStudentPin");
const deleteStudentFn = httpsCallable(functions, "adminDeleteStudent");

export async function addStudent(name, cls, pin) {
  return (await addStudentFn({ name, class: cls, pin })).data;
}
export async function updateStudentPin(studentId, newPin) {
  return (await updatePinFn({ studentId, newPin })).data;
}
export async function deleteStudent(studentId) {
  return (await deleteStudentFn({ studentId })).data;
}

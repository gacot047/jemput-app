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
  getFirestore, collection, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getFunctions, httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
const functions = getFunctions(app);

/* ---------- roster: dengar daftar siswa secara real-time ---------- */
export function listenRoster(onChange) {
  return onSnapshot(collection(db, "students_public"), (snap) => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

/* ---------- antrean penjemputan: dengar secara real-time ---------- */
export function listenQueue(onChange) {
  return onSnapshot(collection(db, "queue"), (snap) => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
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

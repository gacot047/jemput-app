const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();

const LOCK_MINUTES = 15;
const MAX_ATTEMPTS = 3;

/* ---------- helper: hash a PIN with a random salt (scrypt) ---------- */
function hashPin(pin, salt) {
  return crypto.scryptSync(pin, salt, 64).toString("hex");
}
function makeSalt() {
  return crypto.randomBytes(16).toString("hex");
}

/* ---------- helper: distance between two lat/lng points, in meters ---------- */
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * requestPickup — dipanggil dari Aplikasi Orang Tua.
 * Input:  { studentId, pin, pickerName, lat, lng }
 * Output: { ok: true } atau { ok:false, reason, attemptsLeft? }
 *
 * Semua verifikasi (PIN + radius lokasi) terjadi di sini, di server —
 * bukan di HP orang tua — supaya tidak bisa diakali lewat DevTools browser.
 */
exports.requestPickup = onCall(async (request) => {
  const { studentId, pin, pickerName, lat, lng, accuracy } = request.data || {};
  if (!studentId || !pin) {
    throw new HttpsError("invalid-argument", "studentId dan pin wajib diisi.");
  }

  // 1) Cek radius sekolah (kalau admin sudah mengatur titik koordinat)
  const configSnap = await db.doc("admin_config/settings").get();
  const config = configSnap.exists ? configSnap.data() : null;
  if (config && config.schoolLat && config.schoolLng && config.radiusMeters) {
    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new HttpsError("invalid-argument", "Lokasi tidak terdeteksi.");
    }
    const dist = distanceMeters(lat, lng, config.schoolLat, config.schoolLng);
    // GPS di HP tidak pernah 100% presisi — browser melaporkan seberapa
    // besar kemungkinan melesetnya lewat `accuracy` (dalam meter). Kita
    // tambahkan itu sebagai toleransi, dibatasi maksimum ACCURACY_CAP
    // supaya tidak bisa disalahgunakan dengan mengirim accuracy palsu
    // yang sangat besar. Ini lebih tepat daripada memperbesar radius
    // tetap untuk semua orang.
    const ACCURACY_CAP = 150;
    const buffer = Math.min(typeof accuracy === "number" ? accuracy : 0, ACCURACY_CAP);
    const allowedRadius = config.radiusMeters + buffer;
    if (dist > allowedRadius) {
      return { ok: false, reason: "out_of_range" };
    }
  }

  const privRef = db.doc(`students_private/${studentId}`);
  const pubRef = db.doc(`students_public/${studentId}`);
  const [privSnap, pubSnap] = await Promise.all([privRef.get(), pubRef.get()]);

  if (!privSnap.exists || !pubSnap.exists) {
    throw new HttpsError("not-found", "Siswa tidak ditemukan.");
  }
  const priv = privSnap.data();
  const pub = pubSnap.data();

  // 2) Cek apakah sedang terkunci karena PIN salah berkali-kali
  if (priv.lockUntil && priv.lockUntil.toMillis() > Date.now()) {
    return { ok: false, reason: "locked" };
  }

  // 3) Cek apakah siswa ini sudah ada di antrean (belum diambil)
  const existing = await db
    .collection("queue")
    .where("studentId", "==", studentId)
    .limit(1)
    .get();
  if (!existing.empty) {
    return { ok: false, reason: "already_queued" };
  }

  // 4) Verifikasi PIN
  const computed = hashPin(String(pin), priv.salt);
  if (computed !== priv.pinHash) {
    const attempts = (priv.failedAttempts || 0) + 1;
    const update = { failedAttempts: attempts };
    if (attempts >= MAX_ATTEMPTS) {
      update.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
      update.failedAttempts = 0;
    }
    await privRef.update(update);
    return {
      ok: false,
      reason: attempts >= MAX_ATTEMPTS ? "locked" : "wrong_pin",
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts),
    };
  }

  // 5) PIN benar → reset percobaan gagal, masukkan ke antrean
  await privRef.update({ failedAttempts: 0, lockUntil: FieldValue.delete() });
  await db.collection("queue").add({
    studentId,
    name: pub.name,
    class: pub.class,
    picker: pickerName || "—",
    time: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

/* ---------- fungsi admin di bawah ini WAJIB login (Firebase Auth) ---------- */
function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Silakan login sebagai admin/guru.");
  }
}

/**
 * adminAddStudent — { name, class, pin }
 */
exports.adminAddStudent = onCall(async (request) => {
  requireAuth(request);
  const { name, class: cls, pin } = request.data || {};
  if (!name || !cls || !/^\d{4}$/.test(String(pin))) {
    throw new HttpsError("invalid-argument", "Nama, kelas, dan PIN 4 digit wajib diisi.");
  }
  const ref = db.collection("students_public").doc();
  const salt = makeSalt();
  await ref.set({ name, class: cls });
  await db.doc(`students_private/${ref.id}`).set({
    pinHash: hashPin(String(pin), salt),
    salt,
    failedAttempts: 0,
  });
  return { ok: true, id: ref.id };
});

/**
 * adminUpdateStudentPin — { studentId, newPin }
 */
exports.adminUpdateStudentPin = onCall(async (request) => {
  requireAuth(request);
  const { studentId, newPin } = request.data || {};
  if (!studentId || !/^\d{4}$/.test(String(newPin))) {
    throw new HttpsError("invalid-argument", "PIN harus 4 digit angka.");
  }
  const salt = makeSalt();
  await db.doc(`students_private/${studentId}`).update({
    pinHash: hashPin(String(newPin), salt),
    salt,
    failedAttempts: 0,
    lockUntil: FieldValue.delete(),
  });
  return { ok: true };
});

/**
 * adminDeleteStudent — { studentId }
 */
exports.adminDeleteStudent = onCall(async (request) => {
  requireAuth(request);
  const { studentId } = request.data || {};
  if (!studentId) throw new HttpsError("invalid-argument", "studentId wajib diisi.");
  await db.doc(`students_public/${studentId}`).delete();
  await db.doc(`students_private/${studentId}`).delete();
  return { ok: true };
});

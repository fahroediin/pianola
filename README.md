# Pianola

Tempel notasi lagu, tekan Play, dan piano di
[recursivearts.com/virtual-piano](https://recursivearts.com/virtual-piano/) dimainkan otomatis.
Tuts benar-benar ditekan di situsnya, jadi kamu bisa melihat dan mendengar setiap not.

Namanya diambil dari *pianola*, piano mekanis awal abad ke-20 yang memainkan dirinya sendiri dari
gulungan kertas berlubang. Bedanya, gulungannya sekarang berupa teks.

## Cara kerja

```
notasi (teks) -> parser -> penjadwal -> Playwright -> piano Unity di browser
                  |           |
                  |           +-- daftar aksi keyboard berwaktu (down/up, Shift)
                  +-- validasi + error per baris
```

- **Parser** membaca format ketat dua jalur (tangan kanan `RH` dan tangan kiri `LH`), lalu
  menolak seluruh lagu kalau ada kesalahan. Semua error dilaporkan sekaligus dengan nomor
  barisnya.
- **Penjadwal** mengubah not menjadi aksi keyboard dengan waktu absolut. Not kres dimainkan
  dengan Shift + tombol not naturalnya, sesuai tata letak keyboard situs.
- **Player** membuka Chromium lewat Playwright dan mengirim input keyboard asli (trusted). Situs
  ini aplikasi Unity WebGL yang mengabaikan event JavaScript buatan.

Catatan teknis: Unity membaca status Shift satu kali per frame. Jeda milidetik saja tidak cukup,
karena not natural dan Shift bisa jatuh di frame yang sama sehingga natural ikut terbaca kres.
Hanya 16 dari 32 not akord campuran yang benar sebelum ini diperbaiki. Player sekarang menunggu
halaman merender frame baru sebelum setiap perubahan Shift. Setelah perbaikan, verifikasi lewat
sadapan WebAudio menunjukkan 225 dari 225 nada benar.

## Kebutuhan

- Node.js 24 atau lebih baru. File TypeScript dijalankan langsung tanpa build.
- Koneksi internet, karena piano dimuat dari situs aslinya.

## Instalasi

```bash
npm install
npx playwright install chromium
```

## Pemakaian

### Panel web

```bash
npm start
```

Buka http://127.0.0.1:5178. Chromium terbuka sendiri dan memuat piano (sekitar 15-20 detik)
sampai status panel menjadi `Siap`. Setelah itu:

1. Tempel notasi ke kotak teks.
2. Atur kecepatan (50-200%) bila perlu.
3. Tekan **Play**. **Stop** menghentikan lagu dan melepas semua tuts.

Kalau notasi salah, error per baris tampil di panel dan piano tidak disentuh. Teks notasi
tersimpan di browser, jadi tidak hilang saat halaman di-refresh.

### Command line

```bash
npm run smoke songs/ode-to-joy.txt
```

## Format notasi

```
tempo: 90
# komentar

RH: E4 F4 E4 F4 | E5 F5 E5 C5:3
LH: A2 E3 A3:5

RH: [E5 E6] [F5 F6] [E5 E6] [C5 C6]:2
LH: A2:0.5 E3:0.5 A3:0.5 C4:0.5 E4:3
```

| Unsur | Arti |
|---|---|
| `tempo: 90` | BPM, 20-300, default 90 |
| `RH:` / `LH:` | Tangan kanan / kiri. Keduanya dalam satu blok mulai bersamaan. |
| Baris kosong | Pemisah blok. Blok berikutnya mulai setelah jalur terpanjang selesai. |
| `C4`, `F#3`, `Bb5` | Not dengan oktaf. Tengah piano = C4. |
| `[C4 E4 G4]` | Akord |
| `R` | Istirahat |
| `:2`, `:0.5` | Durasi dalam ketuk, default 1 |
| `\|` | Garis birama, diabaikan |
| `#` | Komentar, bila di awal baris atau setelah spasi |

Batasan piano:

- Jangkauan **C2 sampai C7**.
- Dua not tidak boleh memakai tombol yang sama pada waktu bersamaan. Contohnya not yang sama di
  kedua tangan, atau C4 dengan C#4 (kres memakai tombol not naturalnya ditambah Shift).

Untuk membuat notasi lagu dengan bantuan ChatGPT, Claude, atau Gemini, pakai prompt siap salin
di [docs/prompt-notasi.md](docs/prompt-notasi.md). File itu juga berisi cara memperbaiki notasi
yang ditolak.

## Lagu contoh

| File | Isi |
|---|---|
| `songs/ode-to-joy.txt` | Ode to Joy, Beethoven (domain publik) |
| `songs/twinkle.txt` | Twinkle Twinkle Little Star (domain publik) |
| `songs/uji-kres.txt` | Uji akord campuran kres + natural dan tangga nada kromatik |

## Pengujian

```bash
npm test
```

44 tes otomatis mencakup pemetaan tombol, parser, penjadwal (termasuk aturan Shift dan deteksi
bentrok tombol), lagu contoh, dan API server dengan player palsu. Player tidak dites otomatis
karena bergantung pada situs nyata.

## Struktur

```
src/keymap.ts      nama not -> tombol keyboard situs
src/notation.ts    parser + pesan error
src/schedule.ts    not -> aksi keyboard berwaktu
src/player.ts      Playwright yang menekan tuts
src/server.ts      HTTP API untuk panel
src/main.ts        titik masuk npm start
public/panel.html  panel web
scripts/smoke.ts   pemutaran dari command line
docs/              spec desain, rencana implementasi, prompt notasi
```

## Keterbatasan

- Bergantung pada struktur situs recursivearts.com. Kalau situsnya berubah, player bisa berhenti
  bekerja.
- Timing bisa meleset sesekali, sampai sekitar 200 ms, biasanya di akord pertama.
- Tidak ada dinamika (keras/lembut) dan pedal. Semua not ditekan dengan kekuatan yang sama.

Proyek pribadi untuk eksperimen, tidak berafiliasi dengan Recursive Arts. Pakai secukupnya dan
hormati situs penyedia pianonya.

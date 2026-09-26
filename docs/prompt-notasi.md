# Prompt untuk LLM pembuat notasi

Salin semua teks di dalam kotak di bawah ini ke ChatGPT/Claude/Gemini. Ganti `{{LAGU}}` dengan
judul lagu atau tempel bahan mentahnya (misalnya teks aransemen bebas). Hasil dari LLM ditempel
ke panel atau disimpan sebagai file `.txt`, lalu dijalankan dengan `npm run smoke <file>`.

Yang ditempel hanya isi notasinya. Baris pembuka dan penutup code block (tiga backtick) jangan
ikut.

````text
Ubah lagu berikut menjadi notasi piano dalam FORMAT KETAT di bawah. Notasi ini dibaca oleh
program, bukan manusia. Satu pelanggaran format membuat seluruh lagu ditolak.

LAGU: {{LAGU}}

## Format

1. Baris pertama: `tempo: N` (BPM, angka 20-300). 1 ketuk = 1 satuan durasi.
2. Lagu dibagi menjadi BLOK. Antar-blok dipisahkan SATU BARIS KOSONG.
3. Setiap blok berisi paling banyak satu baris `RH:` (tangan kanan) dan satu baris `LH:`
   (tangan kiri). Boleh hanya salah satunya. RH dan LH dalam satu blok MULAI BERSAMAAN.
   Blok berikutnya mulai setelah jalur terpanjang di blok sebelumnya selesai.
4. Komentar diawali `#` di awal baris atau setelah spasi. Baris komentar boleh diletakkan di
   mana saja dan tidak memutus blok.
5. Isi baris RH/LH adalah token yang dipisahkan spasi:
   - Not: huruf A-G, opsional `#` (kres) atau `b` (mol), lalu SATU digit oktaf.
     Contoh: `C4`, `F#3`, `Bb5`. Tengah piano = C4.
   - Akord: not-not dalam kurung siku, dipisahkan spasi: `[C4 E4 G4]`. Tanpa not ganda.
   - Istirahat: `R`.
   - Durasi dalam ketuk ditulis dengan `:angka` di belakang not, akord, atau istirahat. Default
     1. Boleh desimal: `E4:0.5`, `[C3 G3]:2`, `R:1.5`. Harus lebih dari 0.
     Triplet ditulis dengan pembulatan: `C4:0.333 D4:0.333 E4:0.334`.
   - `|` boleh dipakai sebagai garis birama. Program mengabaikannya.
6. Tidak ada simbol lain: tanpa dinamika (p, f), pedal, legato, ulangan (x2, D.C.), tanda
   kunci, lirik, atau teks di luar komentar. Bagian yang diulang harus ditulis ulang utuh.

## Batasan piano (wajib)

A. JANGKAUAN HANYA C2 SAMPAI C7. Not di bawah C2 (misalnya A1) naikkan satu oktaf. Not di atas
   C7 turunkan satu oktaf.
B. TIDAK BOLEH ADA DUA NOT YANG MEMAKAI TOMBOL YANG SAMA PADA WAKTU BERSAMAAN. Tombol sama berarti:
   - not yang sama persis di RH dan LH yang berbunyi bersamaan, atau
   - sebuah not dan kresnya di oktaf yang sama: C dan C#, D dan D#, F dan F#, G dan G#,
     A dan A# (mol ikut padanannya: Db=C#, Eb=D#, Gb=F#, Ab=G#, Bb=A#).
   Ini juga berlaku di dalam satu akord (`[C4 C#4]` dilarang) dan antar-tangan. Kalau
   bertabrakan, pindahkan salah satu not satu oktaf atau buang not yang merupakan pengisi.
   Not yang sama boleh dimainkan BERURUTAN (`E4 E4`).
C. Dalam satu blok, total ketuk RH dan LH sebaiknya SAMA. Kalau tidak sama, jalur yang lebih
   pendek akan diam sampai jalur yang lebih panjang selesai.

## Kejujuran

Kalau kamu tidak yakin dengan melodi aslinya, tetap buat aransemen terbaik yang kamu bisa, lalu
tulis satu baris komentar di bagian atas: `# catatan: <bagian yang kamu kira-kira>`. Jangan
mengarang lalu mengaku akurat.

## Contoh valid (melodi buatan, hanya contoh format)

tempo: 90
# Contoh format

# Bagian A
RH: C4 E4 G4 [C5 E5] | R:0.5 G4:0.5 F#4 E4:2
LH: C3:2 G2:2 | A2:2 C3:2

# Bagian B
RH: [D4 F#4 A4]:2 Bb4:1.5 A4:0.5 | G4:4
LH: D3:4 | G2:2 [G2 D3]:2

## Sebelum menjawab, periksa sendiri

- [ ] Baris pertama `tempo: N`.
- [ ] Setiap baris not diawali `RH:` atau `LH:`, dan tiap label paling banyak sekali per blok.
- [ ] Semua not ada di rentang C2-C7.
- [ ] Tidak ada tombol yang dipakai dua not pada saat bersamaan (aturan B).
- [ ] Total ketuk RH = LH di setiap blok.
- [ ] Hanya token yang diizinkan: not, `[...]`, `R`, `:durasi`, `|`, dan komentar `#`.

## Format jawaban

Jawab HANYA dengan satu code block berisi notasi lengkap dari awal sampai akhir lagu. Tanpa
penjelasan sebelum atau sesudahnya.
````

## Kalau program menolak notasi

Pesan error menyebut nomor baris. Kirim pesan error itu kembali ke LLM yang sama, misalnya:

```text
Program menolak notasimu dengan error berikut. Perbaiki hanya baris yang disebut, lalu kirim
ulang notasi lengkap dalam satu code block:

<tempel semua baris error di sini>
```

Pesan yang mungkin muncul:

| Pesan | Artinya |
|---|---|
| `X di luar jangkauan piano (C2-C7)` | Not terlalu rendah atau tinggi, pindahkan satu oktaf |
| `bentrok tombol: A (baris m) dan B (baris n) ...` | Aturan B dilanggar |
| `token "..." tidak dikenal` | Ada simbol di luar format |
| `durasi "..." tidak valid` | Durasi kosong, nol, negatif, atau bukan angka |
| `baris harus diawali RH: atau LH:` | Ada teks di luar komentar, termasuk baris backtick yang ikut tertempel |
| `RH sudah ada di blok ini` | Lupa baris kosong antar-blok |

# Renisan (ڕێنیسان / رينيسان)

> **Multilingual university admission eligibility checker & scholarship directory for Grade-12 graduates across Federal Iraq and the Kurdistan Region of Iraq (KRG).**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Preact](https://img.shields.io/badge/Preact-10.25-purple.svg)](https://preactjs.com/)
[![Vite](https://img.shields.io/badge/Vite-6.0-green.svg)](https://vitejs.dev/)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline%20First-orange.svg)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)

---

## 📖 Overview

Every year, over 600,000 Grade-12 students (*Baccalaureate / پۆلی دوازدە / السادس الإعدادي*) in Iraq and the Kurdistan Region face a complex, fragmented admissions landscape. Official cutoff books run hundreds of pages, admissions rules differ significantly between the Federal Ministry (MOESR) and the KRG Ministry (Zankoline), and international scholarship deadlines are often scattered or out of date.

**Renisan** is an ultra-lightweight, offline-capable Progressive Web App built to provide:
1. **Instant eligibility matching** based on baccalaureate scores and educational track.
2. **KRG Grade 10–11–12 composite calculation** with official "best-of" protection.
3. **Curated, deadline-aware scholarship listings** verified specifically for Iraqi and refugee/IDP youth.
4. **Native trilingual support** (Arabic, Central Kurdish / Sorani, and Northern Kurdish / Kurmanji).
5. **Zero data footprint & offline reliability** on slow 3G or intermittent mobile connections.

---

## ✨ Key Features

### 1. Dual-Track University Eligibility Checker
- **Federal Ministry of Higher Education (MOESR / القبول المركزي)**:
  - Filter by branch: Scientific (*العلمي / التطبيقي / الإحيائي*), Literary (*الأدبي*), Vocational (*المهني*).
  - Filter by study type: Morning (*صباحي*), Evening (*مسائي*), Parallel (*موازي*).
  - Special admission channels: General, Martyrs (*ذوي الشهداء*), Distinguished (*الطلبة المتميزين*), and Survivors (*الناجون*).
  - Filter by governorate.
- **KRG Ministry of Higher Education (Zankoline / زانكۆلاین)**:
  - Automatic calculation of weighted composite scores:
    $$\text{Composite} = (\text{G12} \times 0.80) + (\text{G11} \times 0.10) + (\text{G10} \times 0.10)$$
  - **Best-of rule protection**: $\max(\text{Grade 12}, \text{Composite})$ ensures that Grades 10 and 11 can only improve a student's score, never lower it.
  - Filter by city and track (Government / Parallel / Evening).

### 2. Mobile-Optimized Input Normalizer
- Seamlessly handles Eastern Arabic numerals (`٠-٩`), Persian/Kurdish numerals (`۰-۹`), and Latin numerals (`0-9`).
- Converts Arabic decimal commas (`،`) to standard decimal points (`.`).
- Strips extraneous percentage signs and whitespace.

### 3. Verified & Deadline-Aware Scholarship Directory
- High-yield international and domestic scholarships open to Iraqi students (e.g. *Türkiye Bursları, Stipendium Hungaricum, IYLEP*).
- Dynamic deadline resolution: scholarships automatically shift to "closed" once an application deadline passes, avoiding false expectations.
- Flags refugee / IDP / survivor eligibility and required GPA/age caps.

### 4. Native Trilingual Localization
- **العربية (Arabic)**
- **کوردیی سۆرانی (Central Kurdish / Sorani)**
- **Kurdî / Kurmancî (Northern Kurdish)**
- Full RTL layout support with semantic CSS logical properties and typography tuned with **Vazirmatn**.

### 5. Offline-First PWA Architecture
- Generates a standalone Progressive Web App via `vite-plugin-pwa` and Workbox.
- Built with Preact for a minimal JavaScript footprint (~45KB gzipped total bundle).
- Caches all application code and datasets for full offline functionality.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher
- `npm` (or `pnpm` / `yarn`)

### Installation & Development

```bash
# Clone the repository and navigate into the project directory
cd renisan

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 🛠️ Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite local development server with instant HMR. |
| `npm test` | Runs the automated 9-suite verification test (`tests/verify.js`). |
| `npm run typecheck` | Validates TypeScript types across the codebase (`tsc --noEmit`). |
| `npm run build` | Compiles TypeScript and builds optimized production assets in `dist/`. |
| `npm run preview` | Previews the production build locally. |

---

## 📁 Project Structure

```text
renisan/
├── public/
│   ├── data/
│   │   ├── cutoffs-federal-2024.json   # Federal admissions cutoff dataset
│   │   ├── cutoffs-krg-2024.json       # KRG Zankoline cutoff dataset
│   │   └── scholarships.json           # Curated scholarships database
│   ├── icons/                          # PWA icons (192x192, 512x512, SVG)
│   └── favicon.ico
├── src/
│   ├── components/                     # Preact UI components
│   │   ├── App.tsx                     # Main layout & tab orchestration
│   │   ├── EligibilityChecker.tsx      # Dual-system admission calculator
│   │   ├── ScholarshipDirectory.tsx    # Scholarship directory & filters
│   │   ├── ResultCard.tsx              # University cutoff card
│   │   ├── ScholarshipCard.tsx         # Scholarship details card
│   │   └── ...
│   ├── hooks/                          # Custom hooks (e.g. useI18n)
│   ├── lib/                            # Business logic & utilities
│   │   ├── normalizer.ts               # Arabic/Kurdish numerals converter & KRG formula
│   │   ├── status.ts                   # Real-time deadline evaluation
│   │   ├── search.ts                   # Filtering & sorting algorithms
│   │   ├── url-state.ts                # Deep linking & shareable URL query state
│   │   ├── types.ts                    # TypeScript data definitions
│   │   └── translations/               # Trilingual translation dictionaries
│   └── styles/                         # Native CSS design tokens & components
├── tests/
│   └── verify.js                       # Comprehensive verification test suite
├── package.json
├── tsconfig.json
└── vite.config.ts                      # Vite & PWA Service Worker configuration
```

---

## 📊 Dataset Schema & Updates

### Federal Cutoffs (`cutoffs-federal-2024.json`)
Each entry follows this structure:
```json
{
  "id": "fed-001",
  "year": 2024,
  "university": "جامعة بغداد",
  "university_en": "University of Baghdad",
  "college": "كلية الطب",
  "college_en": "College of Medicine",
  "stream": "scientific",
  "sub_stream": "bio",
  "study_type": "morning",
  "channel": "general",
  "governorate": "بغداد",
  "min_average": 99.29,
  "confidence": "official"
}
```

### KRG Cutoffs (`cutoffs-krg-2024.json`)
```json
{
  "id": "krg-001",
  "year": 2024,
  "university": "زانکۆی سەڵاحەدین - هەولێر",
  "university_ku": "زانکۆی سەڵاحەدین - هەولێر",
  "university_en": "Salahaddin University - Erbil",
  "college": "کۆلێژی پزیشکی",
  "college_ku": "کۆلێژی پزیشکی",
  "college_en": "College of Medicine",
  "city": "هەولێر",
  "stream": "scientific",
  "study_type": "government",
  "min_composite_score": 98.75,
  "weighting_formula": "80_10_10",
  "confidence": "official"
}
```

---

## 🧪 Testing

Renisan includes a test runner that executes 9 suites with zero external test runners:
```bash
npm test
```

The test validates:
1. Dataset files existence and record counts.
2. Dataset schema integrity (unique IDs, score ranges, valid enums).
3. Eastern Arabic & Persian digit normalization.
4. KRG composite score calculations and "best-of" protection.
5. Federal & KRG cutoff filtering and score descending sorting.
6. Scholarship eligibility curation accuracy.
7. Dynamic deadline-aware status resolution.
8. Deep link URL state serialization and deserialization round-trips.
9. 100% dictionary completeness across Arabic, Sorani, and Kurmanji.

---

## 📄 License

This project is licensed under the MIT License.
All cutoff data is derived from publicly published records of the Iraqi Ministry of Higher Education and Scientific Research (MOESR) and the KRG Ministry of Higher Education and Scientific Research.

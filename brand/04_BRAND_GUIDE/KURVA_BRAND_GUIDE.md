# KURVA — Brand Assets & Development Handoff

## 1. Brand
- Brand: **KURVA**
- Tagline: **Lihat Sekitarmu.**
- Positioning: consumer product that helps people understand what is happening around them.
- Core thought: **Melihat sekitar dengan lebih jelas.**

## 2. Brand character
SIMPLE · SHARP · LOCAL · HUMAN · RELEVANT · FRIENDLY · MODERN · CONFIDENT · USEFUL

KURVA should feel simple on the surface while having strong intelligence behind the scenes.

Avoid making KURVA feel:
- overly corporate
- overly formal
- futuristic
- tech-heavy
- AI-looking
- dashboard-like
- news-portal-like
- marketplace-like
- social-media-heavy

## 3. MASTER VISUAL — LOCKED
The files in `01_MASTER_REFERENCES/` are the supplied master references.

**SINGLE SOURCE OF TRUTH.**

Do NOT redesign, improve, reinterpret, modernize, simplify, redraw, or create alternative versions of the KURVA wordmark or app icon unless explicitly requested.

Principles:
- **REFERENCE > TREND**
- **CONSISTENCY > NOVELTY**

## 4. Wordmark
Use the supplied logo asset.

Important visual characteristics:
- uppercase custom lettering
- bold, rounded, compact and smooth
- deep navy
- orange location pin integrated into the R→V relationship

The **R must remain clearly readable as R**.
The **V must remain clearly readable as V**.

Do not recreate the wordmark using text + a font.
Use `KURVA_wordmark_master.png` or `KURVA_wordmark_transparent.png`.

## 5. App icon / logomark
Use the supplied app icon asset directly.

Characteristics:
- abstract V + A relationship
- rounded and bold
- deep navy
- orange location pin
- minimal and recognizable

Do not turn it into a K, replace it with a generic location pin, add KURVA text, or invent a new symbol.

## 6. Design tokens from the supplied playbook
Primary navy: `#003366`
Action blue: `#2563EB`
Signal orange: `#FF5A00`
Background: `#F8FAFC`
Surface: `#FFFFFF`
Text primary: `#0F172A`
Text secondary: `#647488`
Border: `#E2E8F0`
Disabled: `#CBD5E1`

Typography:
- Typeface: **Manrope**
- Weights shown in the playbook: ExtraBold, Bold, SemiBold, Medium, Regular

Spacing tokens shown:
`4, 8, 12, 16, 20, 24, 32, 40, 48`

Radius tokens shown:
`8, 12, 16, 24`

## 7. Files
### Master references
- `01_MASTER_REFERENCES/KURVA_wordmark_master_source.png`
- `01_MASTER_REFERENCES/KURVA_app_icon_master_source.png`
- `01_MASTER_REFERENCES/KURVA_design_development_playbook_master.png`

### Logo
- `02_LOGO/KURVA_wordmark_master.png` — tightly cropped supplied wordmark on white
- `02_LOGO/KURVA_wordmark_transparent.png` — transparent-background derivative

### App icon
- `03_APP_ICON/KURVA_app_icon_1024.png`
- `03_APP_ICON/KURVA_app_icon_512.png`
- `03_APP_ICON/KURVA_app_icon_192.png`
- `03_APP_ICON/KURVA_app_icon_180.png`
- `03_APP_ICON/KURVA_app_icon_128.png`
- `03_APP_ICON/KURVA_app_icon_64.png`
- `03_APP_ICON/KURVA_app_icon_32.png`
- `03_APP_ICON/KURVA_app_mark_transparent.png`

### Web
- `05_WEB_ASSETS/favicon-32.png`
- `05_WEB_ASSETS/apple-touch-icon.png`
- `05_WEB_ASSETS/icon-192.png`
- `05_WEB_ASSETS/icon-512.png`

## 8. Development rule
Treat these assets as **brand assets, not inspiration**.

When implementing UI:
1. Use the supplied KURVA logo/icon assets.
2. Do not recreate the logo in CSS/SVG/text.
3. Follow the supplied color, typography, spacing and radius tokens.
4. Keep the interface clean, local, human and useful.
5. If an implementation conflicts with the master reference, preserve the master reference.

**Do not generate a new logo.**

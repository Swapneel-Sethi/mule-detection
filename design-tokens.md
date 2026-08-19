## MekaVerse Design Tokens Documentation

### 🎨 Color Palette
- **Void**: `#000000`
- **Bone**: `#ffffff`
- **Charcoal**: `#444345`
- **Frost**: `#e2e2e2`
- **Ash**: `#b8bab9`

### 📐 Spacing System
- `--spacing-4`: `4px`
- `--spacing-8`: `8px`
- `--spacing-12`: `12px`
- `--spacing-16`: `16px`
- `--spacing-24`: `24px`

### 🔤 Typography
- **Display**: `'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;`
- **Mono**: `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;`
- **Type Scale**: `10px`, `12px`, `26px`, `30px`, `80px`

### 🎭 UI Components
- **Risk Indicators**: `.risk-dot` class with 6px diameter
- **Scrollbar**: Custom monochrome style
- **Selection**: `::selection` styles for monochrome inverse

### 📂 Organization
All tokens are defined in `src/app/globals.css` using CSS variables. Tailwind configurations are automatically aligned with these tokens through the build process.
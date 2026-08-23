---
name: Khun Muan Culinary System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cfdbed'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eef4ff'
  surface-container: '#e4efff'
  surface-container-high: '#dde9fb'
  surface-container-highest: '#d7e4f5'
  on-surface: '#101c29'
  on-surface-variant: '#4c4639'
  inverse-surface: '#26313f'
  inverse-on-surface: '#e9f1ff'
  outline: '#7e7667'
  outline-variant: '#cfc5b4'
  surface-tint: '#725c1c'
  primary: '#725c1c'
  on-primary: '#ffffff'
  primary-container: '#f5d68a'
  on-primary-container: '#725c1c'
  inverse-primary: '#e1c379'
  secondary: '#585f6a'
  on-secondary: '#ffffff'
  secondary-container: '#dce3f0'
  on-secondary-container: '#5e6570'
  tertiary: '#5c5f60'
  on-tertiary: '#ffffff'
  tertiary-container: '#d8d9db'
  on-tertiary-container: '#5c5f61'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdf92'
  primary-fixed-dim: '#e1c379'
  on-primary-fixed: '#241a00'
  on-primary-fixed-variant: '#584404'
  secondary-fixed: '#dce3f0'
  secondary-fixed-dim: '#c0c7d3'
  on-secondary-fixed: '#151c25'
  on-secondary-fixed-variant: '#404752'
  tertiary-fixed: '#e1e2e4'
  tertiary-fixed-dim: '#c5c7c8'
  on-tertiary-fixed: '#191c1e'
  on-tertiary-fixed-variant: '#444749'
  background: '#f8f9ff'
  on-background: '#101c29'
  surface-variant: '#d7e4f5'
  border-width-primary: 1.5px
typography:
  display-lg:
    fontFamily: IBM Plex Sans Thai
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-md:
    fontFamily: IBM Plex Sans Thai
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-sm:
    fontFamily: IBM Plex Sans Thai
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: IBM Plex Sans Thai
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: IBM Plex Sans Thai
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-sm:
    fontFamily: IBM Plex Sans Thai
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  mono-price:
    fontFamily: IBM Plex Mono
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 20px
  mono-code:
    fontFamily: IBM Plex Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-padding: 20px
  gutter: 16px
---

## Brand & Style
The design system is centered on a "Modern Thai Minimalist" aesthetic, specifically tailored for a mobile-first suki-roll ordering experience. It evokes a sense of cleanliness, calm, and approachability. The brand personality is personified by the "Khun Muan" character—friendly, precise, and youthful. 

The visual style leans heavily into **Minimalism** with a **Tactile** edge. It utilizes generous whitespace, a restricted palette, and sophisticated line-work. The presence of the character logo as a circular "sticker" element suggests a seal of quality and personal care. The UI must remain light and airy to reflect the freshness of the ingredients, using gold only as a warm, appetizing accent rather than a structural or typographic base.

## Colors
The color palette is divided into high-utility neutrals and a singular, appetizing Gold accent. 

### Implementation Rules:
- **Gold Usage:** Gold is strictly reserved for fills (buttons, active states, icons). It must never be used for body text. When Gold is used as a button fill, the text inside must always be the primary `Ink` color (#101720) for maximum legibility.
- **Status Indicators:** To avoid confusion with the primary Gold brand color, all status indicators (e.g., Pending, Cooking, Delivered) utilize a "Cool Palette" of blues, cyans, and greens. 
- **Typography Tinting:** Use `Gold-Ink` only for small semantic highlights or prices when they sit on a white or neutral surface, never for long-form reading.

## Typography
This design system uses a dual-font approach to balance friendly hospitality with technical precision.

- **Primary Typeface:** IBM Plex Sans Thai is the workhorse. It provides a contemporary, neutral feel that handles Thai glyphs with exceptional clarity at small sizes.
- **Monospace Typeface:** IBM Plex Mono is used exclusively for functional data points: order IDs, price figures (e.g., ฿120), and countdown timers. This creates a clear visual distinction between descriptive content and transactional data.
- **Language Policy:** All UI labels, buttons, and instructions must be in **Thai**. English is permitted only for universal symbols or technical codes.

## Layout & Spacing
The layout follows a strict **4px baseline grid** to ensure vertical rhythm and alignment. 

- **Mobile Philosophy:** As a mobile-first app, the primary container uses a 20px side margin. 
- **Rhythm:** Elements within a card (like title and price) should use `8px (sm)` spacing. Distinct sections on the screen (like "Your Order" and "Recommended") should use `32px (xl)` spacing to provide the "calm" aesthetic required.
- **Grid:** Use a simple 2-column fluid grid for menu items and a single-column layout for checkout flows.

## Elevation & Depth
In keeping with the minimal and clean aesthetic, depth is created through **Tonal Layering** rather than heavy shadows.

- **Surface Tiering:** The background (`Ground`) is slightly tinted. Main content sits on `Surface` (White) cards. Secondary information or input backgrounds use `Surface-2`.
- **Shadows:** Use a singular, "near-invisible" shadow for interactive cards: `0 1px 2px rgba(16, 23, 32, 0.04)`. This provides just enough lift to indicate interactability without cluttering the interface.
- **Outlines:** Structural integrity is maintained via `Border` (#E3E7EC). For active states or primary elements, use a `Border-Strong` to define shape without adding visual weight.

## Shapes
The shape language is "Rounded-Modern." The generous corner radii contribute to the friendly, welcoming brand personality.

- **Containers:** Large elements like product cards, modals, and bottom sheets use a **16px radius**.
- **Interactive Elements:** Buttons, text fields, and chips use a **12px radius**.
- **Stroke Weights:** Primary buttons feature a distinct **1.5px outline** (Gold-Edge) to create a tactile "sticker" or "stamp" look that aligns with the logo's aesthetic.

## Components

### Buttons
- **Primary:** Gold fill (#F5D68A) with a 1.5px Ink outline (#101720). Text is always Ink (#101720). 12px radius.
- **Secondary:** Surface-2 fill, no outline. Ink text.
- **Ghost:** Transparent fill, Ink-Muted text, no outline.

### Chips (Status)
Status chips use a 12px radius and the "Cool Palette." They consist of a low-opacity background with high-contrast text.
- **รอยืนยัน (Pending):** Slate Grey.
- **รับแล้ว (Accepted):** Cyan.
- **กำลังทำ (Cooking):** Blue.
- **รอรับ (Ready):** Emerald Green.
- **ส่งมอบแล้ว (Delivered):** Light Slate.
- **ยกเลิก (Cancelled):** Red.

### Cards
Product cards should be white with the 1.5px border only on hover or selection. By default, they rely on the subtle 1px shadow for separation from the #F7F8FA ground.

### Input Fields
Inputs use `Surface` with a `Border` (#E3E7EC) and a 12px radius. On focus, the border shifts to `Border-Strong`. Placeholder text uses `Ink-Muted`.

### Suki-Roll Selector
A custom horizontal "Stepper" component for quantity should use Gold-Wash as its background to make the +/- buttons feel integrated into the brand experience.
import { MoonStar, Moon, Sun } from 'lucide-react'

export const THEME_STORAGE_KEY = 'tagstash-theme'
export const THEME_ORDER = ['slate', 'midnight', 'light']
export const THEME_LABELS = { slate: 'Slate', midnight: 'Midnight', light: 'Light' }
export const THEME_ICONS = { slate: MoonStar, midnight: Moon, light: Sun }

export const isValidTheme = (value) => THEME_ORDER.includes(value)

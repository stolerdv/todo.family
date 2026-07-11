import type { Config } from 'tailwindcss'
import colors from 'tailwindcss/colors'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // gray у Tailwind по умолчанию холодный (синий подтон) — на чёрном фоне
        // весь серый текст читался голубоватым. Меняем на нейтральный (без синевы).
        gray: colors.neutral,
        // янтарный акцент приложения (единственный цвет на чёрно-белой базе)
        accent: {
          300: '#ffc182',
          400: '#ffa04d',
          500: '#ff7a1a',
          600: '#f26a00',
          700: '#c85400',
        },
      },
    },
  },
  plugins: [],
}
export default config

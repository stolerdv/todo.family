import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
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

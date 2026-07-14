import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

// Link/redirect/usePathname/useRouter, которые сами знают про текущий locale —
// использовать их ВЕЗДЕ вместо next/link и next/navigation, иначе переход
// молча теряет префикс языка.
export const { Link, redirect, usePathname, useRouter } = createNavigation(routing)

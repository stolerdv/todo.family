import BottomNav from '@/components/BottomNav'

// Каркас приложения: контент сверху (скроллится), панель разделов снизу — всегда видна.
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-black">
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      <BottomNav />
    </div>
  )
}

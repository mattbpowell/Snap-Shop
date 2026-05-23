/**
 * Sticky bottom tab bar — all navigation reachable one-handed from the thumb zone.
 * Tabs: List (review) | Scan (primary, elevated) | Shop (store)
 * Safe-area padding ensures the bar clears the iOS home indicator.
 */

export function BottomNav({ screen, list, onNavigate }) {
  const hasList = Boolean(list?.items?.length)

  const tabs = [
    { id: 'review', label: 'List', icon: <ListIcon />, activeIcon: <ListIconFilled /> },
    { id: 'upload', label: 'Scan', primary: true, icon: <CameraIcon /> },
    { id: 'store', label: 'Shop', icon: <CartIcon />, activeIcon: <CartIconFilled /> },
  ]

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 flex items-end justify-around px-2 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] shadow-[0_-1px_12px_rgba(0,0,0,0.06)]"
      aria-label="Main navigation"
    >
      {tabs.map(tab => {
        const isActive = screen === tab.id
        const isDisabled = (tab.id === 'review' || tab.id === 'store') && !hasList

        if (tab.primary) {
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className="flex flex-col items-center gap-0.5 -mt-5 focus:outline-none"
              aria-label={tab.label}
            >
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 duration-100 ${isActive ? 'bg-green-500' : 'bg-gray-900'}`}
              >
                <span className="text-white w-7 h-7">{tab.icon}</span>
              </div>
              <span className={`text-[10px] font-medium mt-0.5 ${isActive ? 'text-green-500' : 'text-gray-400'}`}>
                {tab.label}
              </span>
            </button>
          )
        }

        return (
          <button
            key={tab.id}
            onClick={() => !isDisabled && onNavigate(tab.id)}
            disabled={isDisabled}
            className="flex flex-col items-center justify-end gap-0.5 px-4 pb-1 min-w-[64px] min-h-[48px] focus:outline-none disabled:opacity-30"
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className={`w-6 h-6 transition-colors duration-150 ${isActive ? 'text-green-500' : 'text-gray-400'}`}>
              {isActive && tab.activeIcon ? tab.activeIcon : tab.icon}
            </span>
            <span className={`text-[10px] font-medium transition-colors duration-150 ${isActive ? 'text-green-500' : 'text-gray-400'}`}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

function ListIconFilled() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <rect x="2" y="5" width="2" height="2" rx="1" />
      <rect x="7" y="5" width="15" height="2" rx="1" />
      <rect x="2" y="11" width="2" height="2" rx="1" />
      <rect x="7" y="11" width="15" height="2" rx="1" />
      <rect x="2" y="17" width="2" height="2" rx="1" />
      <rect x="7" y="17" width="15" height="2" rx="1" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  )
}

function CartIconFilled() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <path d="M22.713 5.246A1 1 0 0 0 22 5H6.586L5.305 1.55A1 1 0 0 0 4.382 1H1a1 1 0 0 0 0 2h2.618l4.987 13.45A2 2 0 0 0 9 19a1.5 1.5 0 1 0 1.5 1.5A1.5 1.5 0 0 0 9 19h10a2 2 0 0 0-.605-3.05l1.318-8.553a1 1 0 0 0 .713-1.001zM20 17H9.2l-1.11-3h13.2z" />
    </svg>
  )
}

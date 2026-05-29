import { useEffect, useState } from 'react'
import { UploadScreen } from './components/UploadScreen.jsx'
import { ReviewScreen } from './components/ReviewScreen.jsx'
import { InStoreMode } from './components/InStoreMode.jsx'
import { BottomNav } from './components/BottomNav.jsx'
import { useList } from './hooks/useList.js'

export default function App() {
  const {
    list,
    history,
    startList,
    updateItem,
    deleteItem,
    addItem,
    toggleChecked,
    clearChecked,
    archiveAndReset,
    discardList
  } = useList()

  const [screen, setScreen] = useState('upload')
  // Bumped every time the Scan tab is tapped — UploadScreen watches this and
  // opens the camera/photo picker when it changes. Lets the bottom-bar Scan
  // button act as a one-tap capture entry point.
  const [scanTrigger, setScanTrigger] = useState(0)

  useEffect(() => {
    if (screen === 'upload' && list && list.items.length) return
    if (!list && screen !== 'upload') setScreen('upload')
  }, [list, screen])

  const handleListReady = (items) => {
    startList(items)
    setScreen('review')
  }

  const handleStart = () => setScreen('store')
  const handleBack = () => setScreen('review')
  const handleNewList = () => {
    archiveAndReset()
    setScreen('upload')
  }
  const handleDiscard = () => {
    discardList()
    setScreen('upload')
  }
  const handleResume = () => {
    if (list?.items?.some(i => i.checked)) setScreen('store')
    else setScreen('review')
  }

  const handleNavigate = (target) => {
    if (target === 'upload') {
      // Scan tab is "capture", not just "go to upload" — always navigate to
      // upload and bump the trigger so UploadScreen opens the camera.
      setScreen('upload')
      setScanTrigger(t => t + 1)
    }
    else if (target === 'review' && list?.items?.length) setScreen('review')
    else if (target === 'store' && list?.items?.length) setScreen('store')
  }

  // InStoreMode is full-screen with its own controls — hide BottomNav there
  const showBottomNav = screen !== 'store'

  if (screen === 'upload' || !list) {
    return (
      <>
        <UploadScreen
          onListReady={handleListReady}
          existingList={list}
          onResume={handleResume}
          history={history}
          scanTrigger={scanTrigger}
        />
        <BottomNav screen="upload" list={list} onNavigate={handleNavigate} />
      </>
    )
  }

  if (screen === 'review') {
    return (
      <>
        <ReviewScreen
          list={list}
          onRename={updateItem}
          onDelete={deleteItem}
          onAddItem={addItem}
          onStart={handleStart}
          onDiscard={handleDiscard}
        />
        <BottomNav screen="review" list={list} onNavigate={handleNavigate} />
      </>
    )
  }

  return (
    <InStoreMode
      list={list}
      onBack={handleBack}
      onToggle={toggleChecked}
      onClearChecked={clearChecked}
      onNewList={handleNewList}
    />
  )
}

import { Route, Routes } from 'react-router'
import { AppStoreProvider } from '@/store/AppStore'
import Layout from '@/components/Layout'
import Home from '@/pages/Home'
import Study from '@/pages/Study'
import Library from '@/pages/Library'
import Settings from '@/pages/Settings'
import { Toaster } from '@/components/ui/sonner'

export default function App() {
  return (
    <AppStoreProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/study" element={<Study />} />
          <Route path="/library" element={<Library />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
      <Toaster position="top-center" />
    </AppStoreProvider>
  )
}

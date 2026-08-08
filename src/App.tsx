import { AppShell } from './components/AppShell'
import { ServerHealthSync } from './components/ServerHealthSync'
import { ThemeSync } from './components/ThemeSync'

export default function App() {
  return (
    <>
      <ThemeSync />
      <ServerHealthSync />
      <AppShell />
    </>
  )
}
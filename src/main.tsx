import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import HoldemTable from './HoldemTable'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <HoldemTable />
  </StrictMode>,
)

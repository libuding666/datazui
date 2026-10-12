import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@appica/ui-react/providers/theme-provider'
import { Toaster, ToastProvider } from '@appica/ui-react/toast'
import { AdminApp } from './AdminApp'
import '../index.css'

const container = document.getElementById('admin-root')
if (!container) throw new Error('#admin-root not found')

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider timeout={2600} limit={3}>
        <AdminApp />
        <Toaster position="top-center" />
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)

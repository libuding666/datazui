import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@appica/ui-react/providers/theme-provider'
import { Toaster, ToastProvider } from '@appica/ui-react/toast'
import App from './App'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider timeout={2600} limit={3}>
        <App />
        <Toaster position="top-center" />
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)

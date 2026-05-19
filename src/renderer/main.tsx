import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'sonner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useModelStore } from '@/stores/model-store'
import App from './App'
import './i18n'
import './index.css'

// Expose state for E2E test access
window.__modelStore = useModelStore
window.__errors = []

// Global error handlers — surface errors to both console and window.__errors
window.addEventListener('error', (event) => {
  const err = event.error
  if (err instanceof Error) {
    const detail = { message: err.message, stack: err.stack ?? '', timestamp: Date.now() }
    window.__errors.push(detail)
    console.error('[Global Error]', err.message, '\n', err.stack)
  } else {
    const detail = { message: event.message, stack: `${event.filename}:${event.lineno}:${event.colno}`, timestamp: Date.now() }
    window.__errors.push(detail)
    console.error('[Global Error]', event.message, '\n', event.filename, ':', event.lineno, ':', event.colno)
  }
})

window.addEventListener('unhandledrejection', (event) => {
  window.__errors.push({ message: String(event.reason), stack: '', timestamp: Date.now() })
  console.error('[Unhandled Promise Rejection]', event.reason)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <TooltipProvider delayDuration={300}>
          <App />
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>
)

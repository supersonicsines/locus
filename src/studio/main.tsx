import { createRoot } from 'react-dom/client'
// Fonts ship with the app: no request ever goes to a font host.
import '@fontsource/lustria/400.css'
import '@fontsource/livvic/300.css'
import '@fontsource/livvic/400.css'
import '@fontsource/livvic/500.css'
import './styles.css'
import { App } from './App.tsx'

createRoot(document.getElementById('root')!).render(<App />)

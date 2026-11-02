import { createRoot } from 'react-dom/client'
// Fonts ship with the app: no request ever goes to a font host.
import '@fontsource/lustria/400.css'
// The interface sans, in the only two weights the Studio uses. Its name lives in --sans in styles.css.
import '@fontsource/geist/400.css'
import '@fontsource/geist/500.css'
import './styles.css'
import { App } from './App.tsx'

createRoot(document.getElementById('root')!).render(<App />)

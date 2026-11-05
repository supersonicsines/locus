import { createRoot } from 'react-dom/client'
// Fonts ship with the app: no request ever goes to a font host.
// The one face, Spline Sans Mono, on one variable file. Its name lives in --sans in styles.css.
import '@fontsource-variable/spline-sans-mono/wght.css'
import './styles.css'
import { App } from './App.tsx'

createRoot(document.getElementById('root')!).render(<App />)

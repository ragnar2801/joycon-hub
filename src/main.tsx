import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Controller } from './Controller';
import './styles.css';

function Root() {
  const [controller, setController] = useState(location.hash.startsWith('#/controller'));
  useEffect(() => { const change = () => setController(location.hash.startsWith('#/controller')); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  return controller ? <Controller/> : <App/>;
}
createRoot(document.getElementById('root')!).render(<Root/>);

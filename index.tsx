import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Error Boundary Component to catch rendering errors
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error to the console for debugging
    console.error("Uncaught error in React component tree:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Render a user-friendly fallback UI
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
            <div className="bg-slate-800 p-8 rounded-lg shadow-lg border border-red-500 text-center max-w-lg">
                <h1 className="text-2xl font-bold text-red-400 mb-4 font-orbitron">Er is een fout opgetreden</h1>
                <p className="text-slate-300 mb-4">De applicatie kon niet correct worden geladen. Controleer de console van de browser voor technische details (F12 of rechtermuisknop -> Inspecteren).</p>
                <details className="mt-4 text-left">
                    <summary className="cursor-pointer text-cyan-400 hover:text-cyan-300">Technische Details</summary>
                    <pre className="text-left bg-slate-900 p-4 rounded-md text-red-300 overflow-auto text-sm mt-2">
                        {this.state.error && this.state.error.toString()}
                    </pre>
                </details>
            </div>
        </div>
      );
    }

    return this.props.children; 
  }
}


const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
  </React.StrictMode>
);
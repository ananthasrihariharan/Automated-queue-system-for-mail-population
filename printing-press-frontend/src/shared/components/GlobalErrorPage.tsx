import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'
import './GlobalErrorPage.css'

/**
 * GlobalErrorPage — A premium, luxury error boundary screen.
 * Designed to catch routing and runtime crashes with a high-end aesthetic.
 */
export default function GlobalErrorPage() {
    const error = useRouteError()
    console.error('[GlobalError] Unhandled Exception:', error)

    const getErrorMessage = () => {
        if (isRouteErrorResponse(error)) {
            return {
                title: `${error.status} — ${error.statusText}`,
                message: error.data?.message || 'The requested page could not be synchronized with the hub.',
                code: error.status
            }
        } else if (error instanceof Error) {
            return {
                title: 'System Fault',
                message: error.message,
                code: 'EX_RUNTIME'
            }
        }
        return {
            title: 'Unknown Interruption',
            message: 'An unexpected state occurred. Our recovery protocols have been engaged.',
            code: 'EX_UNKNOWN'
        }
    }

    const info = getErrorMessage()

    return (
        <div className="error-page-container">
            <div className="error-mesh-gradient" />
            
            <div className="error-card-luxury animate-in fade-in zoom-in-95 duration-500">
                <div className="error-icon-wrapper">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                </div>

                <h1 className="error-title-luxury">{info.title}</h1>
                <p className="error-message-luxury">{info.message}</p>
                
                <div className="error-details-tag">
                    <span>REFERENCE ID:</span>
                    <code>{info.code}</code>
                </div>

                <div className="error-actions-hub">
                    <Link to="/login" className="btn-error-primary">
                        RELOAD SYSTEM HUB
                    </Link>
                    <button 
                        onClick={() => window.location.reload()} 
                        className="btn-error-outline"
                    >
                        RETRY CONNECTION
                    </button>
                </div>

                <div className="support-hint">
                    If this persists, contact the engineering desk at <a href="mailto:support@despatch.sys">support@despatch.sys</a>
                </div>
            </div>

            <footer className="error-footer">
                &copy; {new Date().getFullYear()} DESPATCH SYSTEM CORE • RECOVERY MODE ACTIVE
            </footer>
        </div>
    )
}
